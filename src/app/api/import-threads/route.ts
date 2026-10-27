import { NextResponse } from "next/server";
import { AI_API_KEY, AI_MODEL, AI_RESPONSES_URL } from "@/lib/ai";

export const runtime = "nodejs";

const OPENAI_URL = AI_RESPONSES_URL;
const MODEL = AI_MODEL;
const OPENAI_TIMEOUT_MS = 60_000;
const PAGE_FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 12_000;

interface ImportedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  cuisine?: string;
  tags: string[];
  meal_role?: string[];
  fridge_life_days?: number;
  mood_tags?: string[];
  main_ingredient?: string;
  budget_level?: number;
  season?: string[];
  is_compound_safe?: boolean;
  goal_tags?: string[];
  kid_friendly?: boolean;
  spicy_level?: number;
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    note?: string;
  }>;
  steps: Array<{ text: string }>;
  sourceUrl: string;
  sourceDomain?: string;
  confidence: "high" | "medium" | "low";
}

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
}

function normalizeTextArray(value: any, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((t: any) => String(t).trim()).filter(Boolean) : fallback;
}

function normalizeNumber(value: any, fallback?: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: any, fallback?: string) {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

function normalizeRecipe(parsed: any, fallback: Partial<ImportedRecipe>): ImportedRecipe {
  const title = String(parsed.title || fallback.title || "Рецепт из Threads").trim();

  let ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients
        .map((i: any) => ({
          name: String(i.name || "").trim(),
          amount: String(i.amount || "").trim(),
          unit: String(i.unit || "").trim(),
          note: i.note ? String(i.note).trim() : undefined,
        }))
        .filter((i: any) => i.name.length > 0)
    : [];

  let steps = Array.isArray(parsed.steps)
    ? parsed.steps
        .map((s: any) => ({
          text: String(s.text || s || "").trim(),
        }))
        .filter((s: any) => s.text.length > 0)
    : [];

  if (ingredients.length === 0) {
    ingredients = [
      { name: "Основной ингредиент", amount: "по вкусу", unit: "", note: "Уточните в посте" }
    ];
  }

  if (steps.length === 0) {
    steps = [
      { text: "Подготовьте ингредиенты" },
      { text: "Следуйте инструкциям из оригинального поста" }
    ];
  }

  return {
    title,
    description: parsed.description ? String(parsed.description).trim() : fallback.description,
    imageUrl: parsed.imageUrl || fallback.imageUrl,
    prepTime: Number.isFinite(parsed.prepTime) ? parsed.prepTime : (fallback.prepTime || 15),
    cookTime: Number.isFinite(parsed.cookTime) ? parsed.cookTime : (fallback.cookTime || 30),
    servings: Number.isFinite(parsed.servings) ? parsed.servings : (fallback.servings || 4),
    cuisine: parsed.cuisine ? String(parsed.cuisine).trim() : (fallback.cuisine || "international"),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    meal_role: normalizeTextArray(parsed.meal_role, fallback.meal_role),
    fridge_life_days: normalizeNumber(parsed.fridge_life_days, fallback.fridge_life_days ?? 1),
    mood_tags: normalizeTextArray(parsed.mood_tags, fallback.mood_tags),
    main_ingredient: normalizeText(parsed.main_ingredient, fallback.main_ingredient),
    budget_level: normalizeNumber(parsed.budget_level, fallback.budget_level),
    season: normalizeTextArray(parsed.season, fallback.season ?? ["all"]),
    is_compound_safe: typeof parsed.is_compound_safe === "boolean" ? parsed.is_compound_safe : (fallback.is_compound_safe ?? true),
    goal_tags: normalizeTextArray(parsed.goal_tags, fallback.goal_tags ?? []),
    kid_friendly: typeof parsed.kid_friendly === "boolean" ? parsed.kid_friendly : (fallback.kid_friendly ?? false),
    spicy_level: normalizeNumber(parsed.spicy_level, fallback.spicy_level ?? 0),
    ingredients,
    steps,
    sourceUrl: String(parsed.sourceUrl || fallback.sourceUrl || "").trim(),
    sourceDomain: parsed.sourceDomain || fallback.sourceDomain || "threads.com",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

interface ThreadsPost {
  text: string;
  imageUrl?: string;
}

// threads.net → threads.com, без share-параметров (?xmt=…)
function normalizeThreadsUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.endsWith("threads.net")) parsed.hostname = "www.threads.com";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, property: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const match = html.match(re);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeHtmlEntities(value).trim() : undefined;
}

/// Fallback, когда устройство не прислало текст: обычный GET страницы поста
/// и разбор og-тегов (только первый пост треда).
async function fetchThreadsPost(url: string): Promise<ThreadsPost | null> {
  const response = await fetch(url, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const text = metaContent(html, "og:description") || "";
  if (!text) return null;
  return { text, imageUrl: metaContent(html, "og:image") };
}

const LANG_NAMES: Record<string, string> = {
  ru: "Russian", uk: "Ukrainian", en: "English", de: "German",
  es: "Spanish", fr: "French", it: "Italian", "pt-BR": "Portuguese",
};

function buildPrompt(inputText: string, sourceUrl: string, sourceDomain?: string, imageUrl?: string, language = "ru") {
  const langName = LANG_NAMES[language] ?? "Russian";
  return `Extract recipe from a Threads post (the author's post text, possibly several posts of one thread). Return VALID JSON only.

OUTPUT LANGUAGE: ${langName}. Translate ALL user-visible text (title, description, ingredient names, step text, notes) into ${langName}. Keep only untranslatable proper nouns/brand names as-is.

INPUT TEXT:
${inputText}

REQUIRED OUTPUT FORMAT (copy structure exactly):
{
  "title": "Recipe name from text or generate descriptive title",
  "description": "Brief description or first line of the post",
  "imageUrl": ${imageUrl ? `"${imageUrl}"` : "null"},
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "cuisine": "international",
  "tags": ["quick", "dinner"],
  "meal_role": ["dinner"],
  "fridge_life_days": 1,
  "mood_tags": ["comfort", "quick"],
  "main_ingredient": "chicken",
  "budget_level": 2,
  "season": ["all"],
  "is_compound_safe": true,
  "goal_tags": ["balanced"],
  "kid_friendly": false,
  "spicy_level": 1,
  "ingredients": [
    { "name": "ingredient name", "amount": "100", "unit": "г", "note": "" }
  ],
  "steps": [
    { "text": "Step description" }
  ],
  "sourceUrl": "${sourceUrl}",
  "sourceDomain": "${sourceDomain || "threads.com"}",
  "confidence": "medium"
}

CRITICAL RULES:
1. ALWAYS return valid JSON - no markdown, no comments, no extra text
2. NEVER return empty arrays for ingredients or steps - ALWAYS extract or infer:
   - If cooking mentioned but amounts unclear: use "по вкусу" or estimate typical amounts (100г, 1 шт)
   - If steps unclear: create logical cooking sequence based on mentioned ingredients/actions
   - If only dish name known: infer typical ingredients and basic cooking steps
3. ALWAYS fill required fields with defaults if unknown:
   - title: extract from text OR create descriptive name like "Блюдо из [main ingredient]"
   - prepTime: estimate 10-20 min if not mentioned
   - cookTime: estimate 20-40 min if not mentioned
   - servings: default to 4 if not mentioned
   - cuisine: "international" if unclear
4. For ingredients without specific amounts: use "по вкусу", "1 шт", "100 г" etc.
5. ALL user-visible text MUST be in ${langName} — translate if needed
6. confidence: "high" if clear recipe, "medium" if inferred some data, "low" if mostly guessed
7. Extract ALL mentioned food items as ingredients, even if amounts are not specified
8. TAGS — choose only from this list (pick all that apply):
   Time: "quick" (≤20 min total), "special occasion" (>60 min total)
   Calories: "light" (<300 kcal/serving), "hearty" (>650 kcal/serving)
   Meal: "breakfast", "lunch", "dinner", "snack"
   Diet: "vegetarian", "vegan", "gluten-free", "dairy-free"
   Type: "soup", "salad", "pasta", "grill", "baking", "raw"
   If total time unknown but dish looks quick → add "quick". Do NOT add tags not in this list.
9. PLANNING FIELDS:
   - meal_role: array from breakfast, lunch_main, lunch_side, dinner, snack, dessert
   - fridge_life_days: 0 dressed salads/same-day, 1 default, 2 cutlets/casseroles, 3 soups/borscht/stews
   - mood_tags: array from comfort, light, energizing, festive, quick, cozy
   - main_ingredient: one of chicken, beef, fish, pasta, rice, vegetables, eggs, legumes
   - budget_level: 1 cheap, 2 medium, 3 expensive
   - season: array from spring, summer, autumn, winter, all
   - is_compound_safe: false for self-contained soups/stews, true if dish can be paired with a side/salad
   - goal_tags: array from weight_loss, muscle_gain, balanced, quick, budget, variety, meal_prep
   - kid_friendly: boolean, true only for mild, non-spicy, child-appropriate dishes with no alcohol
   - spicy_level: 0 none, 1 mild, 2 medium, 3 hot`;
}

export async function POST(request: Request) {
  try {
    const apiKey = AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const { url, caption: clientCaption, thumbnail_url: clientThumbnail, language = "ru" } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    const normalizedUrl = normalizeThreadsUrl(url.trim());

    // Текст поста пришёл с устройства (WebView) — к Threads не обращаемся
    let post: ThreadsPost | null = null;
    let method = "device-text+ai";
    if (typeof clientCaption === "string" && clientCaption.trim().length >= 20) {
      post = {
        text: clientCaption.trim(),
        imageUrl: typeof clientThumbnail === "string" && clientThumbnail ? clientThumbnail : undefined,
      };
    } else {
      method = "og+ai";
      try {
        post = await fetchThreadsPost(normalizedUrl);
      } catch (error) {
        console.warn("[threads] page fetch failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!post || post.text.length < 20) {
      return NextResponse.json(
        { error: "Не удалось получить текст поста Threads. Проверьте, что пост публичный." },
        { status: 422 }
      );
    }

    console.info("[threads] import", {
      url: normalizedUrl,
      method,
      textLength: post.text.length,
      hasImage: Boolean(post.imageUrl),
    });

    const inputText = post.text.slice(0, MAX_TEXT_LENGTH);
    const prompt = buildPrompt(inputText, normalizedUrl, "threads.com", post.imageUrl, language);

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: prompt, temperature: 0.2 }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return NextResponse.json({ error: "AI error", details: errorText }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const aiText = aiData?.output?.[0]?.content?.[0]?.text;
    if (!aiText) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(aiText));
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI", raw: aiText }, { status: 500 });
    }

    const recipe = normalizeRecipe(parsed, {
      title: post.text.split("\n")[0]?.trim().slice(0, 120) || "Threads recipe",
      description: post.text.slice(0, 300),
      imageUrl: post.imageUrl,
      sourceUrl: normalizedUrl,
      sourceDomain: "threads.com",
    });

    return NextResponse.json({
      recipe,
      meta: {
        method,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
