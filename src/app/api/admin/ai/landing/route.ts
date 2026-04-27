import { NextResponse } from "next/server";
import { translateLandingToAllLanguages } from "@/lib/translate";
import { CATALOG_RECOMMENDATION_PROMPT } from "@/lib/catalogRecommendationTags";

const OPENAI_URL = "https://api.openai.com/v1/responses";

function stripMarkdown(content: string): string {
  let s = content.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

const SCHEMA_DESCRIPTION = `
{
  "_cuisine": {
    "recommendation": {
      "levels": string[],       // machine values only
      "times": string[],        // machine values only
      "dietary": string[],      // machine values only, can be []
      "tags": string[]          // machine values only
    }
  },
  "preview_card": {
    "title": string,            // короткий заголовок для карточки в списке (до 40 символов)
    "subtitle": string,         // 1-2 предложения о пользе каталога
    "badges": string[],         // 2-3 короткие метки, например ["36 рецептов","Пошагово","Разовая покупка"]
    "imageUrl": null,           // оставь null — устанавливается отдельно
    "backgroundHex": string,    // HEX без #, тёмный насыщенный цвет под тему
    "overlayHex": string,       // HEX без #, чуть светлее фона
    "accentHex": string         // HEX без #, яркий акцентный цвет
  },
  "hero": {
    "title": string,            // заголовок лендинга, можно с переносом \\n (до 50 символов)
    "subtitle": string,         // 1-2 предложения, раскрывают ценность
    "badges": string[],         // 2-3 метки, например ["20–30 минут","Без редких ингредиентов","Пошагово"]
    "imageUrl": null,
    "backgroundHex": string,
    "overlayHex": string
  },
  "inside_section": {
    "title": "Что внутри",
    "subtitle": string,
    "items": [                  // столько пунктов, сколько реально есть в каталоге — не обрезай
      {"id": "<uuid>", "emoji": string, "title": string|null, "text": string}
      // ... повтори для каждого реального пункта
    ]
  },
  "recipe_showcase": {
    "title": string,
    "subtitle": string
  },
  "audience_section": {
    "title": "Кому подойдёт",
    "subtitle": string,
    "items": [                  // столько аудиторий, сколько реально подходит — не обрезай
      {"id": "<uuid>", "emoji": string, "title": null, "text": string}
      // ... повтори для каждой группы
    ]
  },
  "transformation_section": {
    "title": "Узнаёшь себя?",
    "subtitle": null,
    "beforeLabel": "До",
    "afterLabel": "После",
    "pairs": [                  // столько пар, сколько реально актуально для каталога
      {"id": "<uuid>", "beforeText": string, "afterText": string}
      // ... повтори
    ]
  },
  "benefits_section": {
    "title": "Преимущества",
    "subtitle": string,
    "cards": [                  // столько карточек, сколько реальных преимуществ — не обрезай
      {"id": "<uuid>", "eyebrow": string, "title": string, "text": string}
      // ... повтори
    ]
  },
  "faq_items": [                // 3-5 реальных вопросов покупателя
    {"id": "<uuid>", "question": string, "answer": string}
    // ...
  ],
  "purchase_cta": {
    "title": "Открыть каталог",
    "subtitle": string,
    "priceBadge": string,       // например "$4" или "$2.99"
    "features": [
      {"id": "<uuid>", "icon": string, "title": string, "subtitle": string}
    ],
    "buttonTitle": "Открыть каталог"
  },
  "theme": {
    "pageBackgroundHex": string,      // очень тёмный, почти чёрный
    "heroBackgroundHex": string,      // тот же что в preview_card.backgroundHex
    "heroOverlayHex": string,
    "cardBackgroundHex": "F2F2F7",
    "accentHex": string,              // основной акцент (кнопки, метки)
    "secondaryAccentHex": string,     // жёлтый/золотой для дополнительных акцентов
    "textOnDarkHex": "FFFFFF"
  },
  "recipe_preview_ids": [],
  "is_published": false,
  "sort_order": 0
}`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const cuisineName: string = String(body.cuisineName || "").trim();
    const cuisineDescription: string = String(body.cuisineDescription || "").trim();
    const price: string = String(body.price || "$2").trim();
    const language: string = String(body.language || "ru").trim();
    const userPrompt: string = String(body.userPrompt || "").trim();
    const existingJson: string = String(body.existingJson || "").trim();

    if (!cuisineName) {
      return NextResponse.json({ error: "cuisineName is required" }, { status: 400 });
    }

    const languageNames: Record<string, string> = {
      ru: "русском", en: "English", de: "Deutsch", fr: "français",
      it: "italiano", es: "español", "pt-BR": "português (BR)", uk: "українській",
    };
    const langInstruction = language === "ru"
      ? "Все тексты пиши на русском языке."
      : `Все тексты в JSON пиши ТОЛЬКО на языке: ${languageNames[language] ?? language}. Не используй русский и не используй английский — только указанный язык.`;

    const contextBlock = [
      `Название каталога: ${cuisineName}`,
      cuisineDescription ? `Описание: ${cuisineDescription}` : "",
      `Цена: ${price}`,
      `Язык контента: ${language} — ${langInstruction}`,
      userPrompt ? `Дополнительные пожелания: ${userPrompt}` : "",
      existingJson ? `Текущие данные (используй как основу, улучши): ${existingJson.slice(0, 2000)}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `Ты копирайтер и UX-дизайнер. Создай JSON для лендинга платного кулинарного каталога в мобильном приложении (App Store стиль).

${contextBlock}

ТРЕБОВАНИЯ:
- ${langInstruction}
- Добавь служебный блок _cuisine.recommendation для выбора подарка в онбординге
- ${CATALOG_RECOMMENDATION_PROMPT}
- Текст живой, дружелюбный, без канцелярита
- Заголовки короткие и ёмкие
- Секции transformation_section и benefits_section — обязательны, они продают
- Количество items/pairs/cards в каждой секции определяй по содержанию каталога — НЕ обрезай до фиксированного числа, НЕ добавляй пустые пункты ради количества
- FAQ — 3-5 реальных вопросов покупателя
- Цвета подбери под тему кухни (backgroundHex — тёмный насыщенный, accentHex — яркий)
- Все id замени на реальные UUID v4
- Верни ТОЛЬКО валидный JSON, без markdown-обёртки

СХЕМА (строго соблюдай структуру):
${SCHEMA_DESCRIPTION}`;

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: prompt,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;

    if (!content) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
    }

    let parsed: Record<string, unknown>;
    try {
      const cleaned = stripMarkdown(content);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI", raw: content }, { status: 500 });
    }

    // Translate to all 7 other languages via DeepL right after AI generation
    let translations: Record<string, unknown> = {};
    try {
      translations = await translateLandingToAllLanguages(parsed, language);
    } catch (translateErr) {
      console.warn("[ai/landing] DeepL translation failed, returning base only:", translateErr);
    }

    return NextResponse.json({ data: parsed, translations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
