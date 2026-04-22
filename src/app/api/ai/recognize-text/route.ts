// POST /api/ai/recognize-text
// Голосовой ввод продуктов — распознаёт список продуктов из текста.
// Free: 1 запрос/день. Premium: без ограничений.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { verifyUser, checkAndIncrementAiUsage, logTokenUsage, AuthError } from "@/lib/verifyUser";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // 1. Проверяем пользователя
    const user = await verifyUser(request);

    // 2. Для free пользователей проверяем лимит
    if (!user.isPremium) {
      await checkAndIncrementAiUsage(user.userId);
    }

    // 3. Читаем тело запроса
    const body = await request.json();
    const { text } = body;
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text field" }, { status: 400 });
    }

    // 4. Шлём запрос к OpenAI
    const systemPrompt = `You are a precise food product recognition assistant. Extract EACH product separately with its EXACT quantity and unit from the text.

CRITICAL RULES:
1. Detect the language of input and respond with product names in the SAME language
2. Parse EACH product individually
3. Extract the EXACT quantity and unit mentioned
4. Pay attention: "полкилограмма"=0.5kg, "штука/штуки"=pieces
5. NEVER guess quantities — use exactly what was said
6. If no unit mentioned, default to pieces for countable items
7. If no quantity mentioned, use 1

Return JSON:
{"products":[{"name":"...","quantity":1,"unit":"grams|kilograms|milliliters|liters|pieces","category":"vegetables|fruits|meat|dairy|bakery|cereals|spices|drinks|sweets|frozen|other"}]}`;

    const openAIResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!openAIResponse.ok) {
      const err = await openAIResponse.text();
      console.error("OpenAI error:", err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await openAIResponse.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    // Log tokens in background — does not block the response
    if (data.usage) {
      after(() => logTokenUsage(user.userId, "recognize-text", data.usage));
    }

    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message, reason: e.reason },
        { status: e.status }
      );
    }
    console.error("recognize-text error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
