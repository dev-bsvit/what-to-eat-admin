// POST /api/ai/recognize-image
// Распознавание продуктов из фото (чек, список, книга).
// Free: 1 запрос/день (общий счётчик с recognize-text). Premium: без ограничений.

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

    const user = await verifyUser(request);
    if (!user.isPremium) {
      await checkAndIncrementAiUsage(user.userId);
    }

    const body = await request.json();
    const { imageBase64 } = body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing imageBase64 field" }, { status: 400 });
    }

    const systemPrompt = `You are a food product recognition assistant for photos. Analyze the image and extract food products.
Detect the language in the image and respond with product names in the SAME language.
Types: receipts, handwritten lists, cookbook photos, product photos.
Return JSON: {"products":[{"name":"...","quantity":1,"unit":"grams|kilograms|milliliters|liters|pieces","category":"vegetables|fruits|meat|dairy|bakery|cereals|spices|drinks|sweets|frozen|other"}]}`;

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
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image and extract all food products:" },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
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

    if (data.usage) {
      after(() => logTokenUsage(user.userId, "recognize-image", data.usage));
    }

    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message, reason: e.reason },
        { status: e.status }
      );
    }
    console.error("recognize-image error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
