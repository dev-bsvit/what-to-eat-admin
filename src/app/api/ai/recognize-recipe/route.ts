// POST /api/ai/recognize-recipe
// Распознавание полного рецепта из фото.
// Free: 1 запрос/день (общий счётчик). Premium: без ограничений.

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

    const systemPrompt = `You are a meticulous recipe extraction assistant. Extract 100% COMPLETE recipe information.

CRITICAL:
- Extract EVERY SINGLE ingredient and step, no exceptions
- Do NOT skip, summarize, or combine steps
- Keep ORIGINAL language from the image

Return JSON:
{
  "t": "title",
  "d": "description/notes/tips combined",
  "pt": prep_time_minutes_or_null,
  "ct": cook_time_minutes_or_null,
  "s": servings_or_null,
  "cu": "cuisine or null",
  "tags": [],
  "ing": [{"n":"name","a":"amount","u":"unit"}],
  "steps": [{"text":"full step text"}]
}`;

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
              {
                type: "text",
                text: "Extract the complete recipe. Include ALL ingredients with amounts and ALL cooking steps:",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.1,
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
      after(() => logTokenUsage(user.userId, "recognize-recipe", data.usage));
    }

    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message, reason: e.reason },
        { status: e.status }
      );
    }
    console.error("recognize-recipe error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
