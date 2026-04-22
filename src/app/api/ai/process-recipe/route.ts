// POST /api/ai/process-recipe
// AI улучшение рецепта — нормализация единиц, чистка ингредиентов.
// ТОЛЬКО для Premium пользователей.

import { NextResponse } from "next/server";
import { verifyUser, AuthError } from "@/lib/verifyUser";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const user = await verifyUser(request);

    // Эта функция — только Premium
    if (!user.isPremium) {
      return NextResponse.json(
        { error: "Premium subscription required", reason: "premium_required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { recipe } = body;
    if (!recipe || !recipe.t) {
      return NextResponse.json({ error: "Missing recipe data" }, { status: 400 });
    }

    const systemPrompt = `Recipe data cleaner. Fix issues, normalize units. DO NOT invent data!

TASKS:
1. Ingredients: extract amount/unit from name to a/u fields. Clean name. Normalize units: г,кг,мл,л,шт,ст.л.,ч.л.,стакан
2. Steps: extract timer ONLY if explicitly mentioned
3. Detect cu (cuisine) from ingredients/title if obvious
4. Keep original language. Clean whitespace.
5. DO NOT add pt/ct if not in input!

OUTPUT: valid JSON with same structure as input. Never put string in integer field.`;

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
          { role: "user", content: JSON.stringify(recipe) },
        ],
        temperature: 0.1,
        max_tokens: 1500,
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

    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message, reason: e.reason },
        { status: e.status }
      );
    }
    console.error("process-recipe error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
