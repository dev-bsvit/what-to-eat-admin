// POST /api/ai/extract-recipe-text
// Converts a free-form chat recipe into structured recipe JSON for iOS import form.

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
      await checkAndIncrementAiUsage(user.userId, "extract-recipe-text");
    }

    const body = await request.json();
    const { text } = body;
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text field" }, { status: 400 });
    }

    const systemPrompt = `You extract a complete recipe from a chat message.

Rules:
- Keep the original language of the recipe.
- Extract only data present or strongly implied in the message.
- Do not invent ingredients, steps, image URLs, or nutrition.
- If the text contains multiple recipes, extract the main/first complete recipe.
- Split ingredients into name, amount, unit. Put notes in note.
- Steps must be actionable cooking instructions, in order.
- Set "m": true for 1-3 ingredients that DEFINE the dish (main protein, main starch, key base). Set "m": false for oil, salt, water, spices, garlic, herbs, sugar, vinegar, etc.
- Return valid JSON only.

Return JSON:
{
  "t": "title",
  "d": "short description or null",
  "pt": prep_time_minutes_or_null,
  "ct": cook_time_minutes_or_null,
  "s": servings_or_null,
  "cu": "cuisine or null",
  "tags": [],
  "ing": [{"n":"name","a":"amount","u":"unit","note":"optional note","m":true/false}],
  "steps": [{"text":"step text","timer": timer_minutes_or_null}]
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
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      }),
    });

    if (!openAIResponse.ok) {
      console.error("OpenAI extract-recipe-text failed:", openAIResponse.status);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await openAIResponse.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    if (data.usage) {
      after(() => logTokenUsage(user.userId, "extract-recipe-text", data.usage));
    }

    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message, reason: e.reason },
        { status: e.status }
      );
    }
    console.error("extract-recipe-text error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
