import { NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1/responses";

/**
 * Strip markdown code blocks from AI response
 */
function stripMarkdownCodeBlocks(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const userInput = String(body.input || "").trim();

    if (!userInput) {
      return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    const prompt = `Ты помощник для заполнения справочника продуктов.\n\nНа входе: описание продукта или название.\nВерни ТОЛЬКО валидный JSON без markdown.\n\nПоля JSON:\n- canonical_name (строка)\n- synonyms (массив строк, обязательно 5-8 штук, включи базовое название, популярные варианты, транслит/латиницу если уместно, и 1-2 варианта с типичными опечатками)\n- category (строка: vegetables|fruits|meat|dairy|grains|fish|bakery|frozen|drinks|spices|canned|snacks|other)\n- calories (число, ккал на 100г)\n- protein (число)\n- fat (число)\n- carbohydrates (число)\n- fiber (число)\n- preferred_unit (строка: g|kg|ml|l|pcs)\n- typical_serving (число)\n- requires_expiry (boolean)\n- default_shelf_life_days (число)\n- seasonal_months (массив чисел 1-12)\n- description (строка)\n- storage_tips (строка)\n\nПользовательский ввод: ${userInput}`;

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;
    if (!content) {
      return NextResponse.json({ error: "Empty response" }, { status: 500 });
    }

    let parsed;
    try {
      const cleanedContent = stripMarkdownCodeBlocks(content);
      parsed = JSON.parse(cleanedContent);
    } catch (error) {
      return NextResponse.json({ error: "Invalid JSON from model", raw: content }, { status: 500 });
    }

    if (parsed && typeof parsed === "object") {
      const canonical = typeof parsed.canonical_name === "string" ? parsed.canonical_name.trim() : "";
      const baseInput = userInput.trim();
      const ensureSynonym = (value: string) => value && value.length > 0;
      let synonyms: string[] = Array.isArray(parsed.synonyms)
        ? parsed.synonyms.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];

      if (ensureSynonym(canonical) && !synonyms.some((s) => s.toLowerCase() === canonical.toLowerCase())) {
        synonyms.unshift(canonical);
      }
      if (ensureSynonym(baseInput) && !synonyms.some((s) => s.toLowerCase() === baseInput.toLowerCase())) {
        synonyms.push(baseInput);
      }
      const generateTypos = (value: string, limit: number) => {
        const cleaned = value.trim();
        if (cleaned.length < 4) {
          return [];
        }
        const variants: string[] = [];
        for (let i = 0; i < cleaned.length - 1 && variants.length < limit; i += 1) {
          const chars = cleaned.split("");
          [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
          const swapped = chars.join("");
          if (swapped !== cleaned) {
            variants.push(swapped);
          }
        }
        if (cleaned.length > 4 && variants.length < limit) {
          variants.push(cleaned.slice(0, -1));
        }
        return variants;
      };

      if (synonyms.length < 5) {
        const typos = generateTypos(baseInput || canonical, 3);
        synonyms.push(...typos);
      }

      parsed.synonyms = Array.from(new Set(synonyms.map((s) => s.trim()))).filter(Boolean);
    }

    return NextResponse.json({ data: parsed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
