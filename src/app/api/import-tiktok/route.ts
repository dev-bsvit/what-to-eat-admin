import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const LANG_NAMES: Record<string, string> = {
  ru: "Russian", uk: "Ukrainian", en: "English", de: "German",
  es: "Spanish", fr: "French", it: "Italian", "pt-BR": "Portuguese",
};

// ─── TikTok page scraper ──────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Referer": "https://www.tiktok.com/",
};

interface TikTokPageData {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  author: string | null;
}

async function scrapeTikTokPage(url: string): Promise<TikTokPageData | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // og:description (contains video caption)
    const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/) ||
                      html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:description"/);
    const description = descMatch ? decodeHtmlEntities(descMatch[1]) : "";

    // og:title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/) ||
                       html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "";

    // og:image
    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/) ||
                     html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/);
    const thumbnailUrl = imgMatch ? imgMatch[1] : null;

    // author from title or page
    const authorMatch = html.match(/"author"[^}]*"uniqueId":"([^"]+)"/) ||
                        html.match(/@([A-Za-z0-9_.]+)/);
    const author = authorMatch ? authorMatch[1] : null;

    return { title, description, thumbnailUrl, author };
  } catch {
    return null;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ─── Normalise recipe JSON from GPT ──────────────────────────────────────────

function extractJson(content: string): string {
  const m = content.match(/\{[\s\S]*\}/);
  return m ? m[0] : content;
}

function normalizeArr(v: unknown, fb: string[] = []): string[] {
  return Array.isArray(v) ? v.map((t) => String(t).trim()).filter(Boolean) : fb;
}

function normalizeNum(v: unknown, fb?: number): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function normalizeRecipe(parsed: any, sourceUrl: string, imageUrl?: string | null) {
  let ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients
        .map((i: any) => ({ name: String(i.name || "").trim(), amount: String(i.amount || "").trim(), unit: String(i.unit || "").trim(), note: i.note ? String(i.note).trim() : undefined }))
        .filter((i: any) => i.name.length > 0)
    : [];
  let steps = Array.isArray(parsed.steps)
    ? parsed.steps.map((s: any) => ({ text: String(s.text || s || "").trim() })).filter((s: any) => s.text.length > 0)
    : [];

  if (!ingredients.length) ingredients = [{ name: "Основной ингредиент", amount: "по вкусу", unit: "", note: "Уточните по видео" }];
  if (!steps.length) steps = [{ text: "Следуйте инструкциям из видео" }];

  return {
    title: String(parsed.title || "TikTok рецепт").trim(),
    description: parsed.description ? String(parsed.description).trim() : undefined,
    imageUrl: parsed.imageUrl || imageUrl || undefined,
    prepTime: normalizeNum(parsed.prepTime, 15),
    cookTime: normalizeNum(parsed.cookTime, 20),
    servings: normalizeNum(parsed.servings, 2),
    cuisine: parsed.cuisine ? String(parsed.cuisine).trim() : "international",
    tags: normalizeArr(parsed.tags),
    meal_role: normalizeArr(parsed.meal_role),
    fridge_life_days: normalizeNum(parsed.fridge_life_days, 1),
    mood_tags: normalizeArr(parsed.mood_tags),
    main_ingredient: parsed.main_ingredient ? String(parsed.main_ingredient).trim() : undefined,
    budget_level: normalizeNum(parsed.budget_level),
    season: normalizeArr(parsed.season, ["all"]),
    is_compound_safe: typeof parsed.is_compound_safe === "boolean" ? parsed.is_compound_safe : true,
    goal_tags: normalizeArr(parsed.goal_tags),
    kid_friendly: typeof parsed.kid_friendly === "boolean" ? parsed.kid_friendly : false,
    spicy_level: normalizeNum(parsed.spicy_level, 0),
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: "tiktok.com",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

function buildPrompt(inputText: string, sourceUrl: string, langName: string, imageUrl?: string | null): string {
  return `Extract recipe from TikTok video caption/description. Return VALID JSON only, no markdown.

OUTPUT LANGUAGE: ${langName}. Translate ALL user-visible text (title, ingredient names, steps, description) into ${langName}.

INPUT:
${inputText}

OUTPUT FORMAT:
{
  "title": "Recipe name in ${langName}",
  "description": "2-3 sentence description in ${langName}",
  "imageUrl": ${imageUrl ? `"${imageUrl}"` : "null"},
  "prepTime": 10, "cookTime": 20, "servings": 2,
  "cuisine": "international",
  "tags": ["quick","dinner"],
  "meal_role": ["dinner"],
  "fridge_life_days": 1,
  "mood_tags": ["quick"],
  "main_ingredient": "chicken",
  "budget_level": 2,
  "season": ["all"],
  "is_compound_safe": true,
  "goal_tags": ["balanced"],
  "kid_friendly": false,
  "spicy_level": 0,
  "ingredients": [{"name":"ingredient in ${langName}","amount":"100","unit":"г","note":""}],
  "steps": [{"text":"Step in ${langName}"}],
  "sourceUrl": "${sourceUrl}",
  "sourceDomain": "tiktok.com",
  "confidence": "medium"
}

RULES:
1. ALL user-visible text MUST be in ${langName}.
2. NEVER return empty arrays for ingredients or steps.
3. confidence: "high" if full recipe found, "medium" if partially inferred, "low" if mostly guessed.
4. TikTok captions are often short — infer typical recipe steps and amounts from dish name.
5. tags: quick, special occasion, light, hearty, breakfast, lunch, dinner, snack, vegetarian, vegan, gluten-free, dairy-free, soup, salad, pasta, grill, baking, raw.
6. meal_role: breakfast, lunch_main, lunch_side, dinner, snack, dessert.
7. mood_tags: comfort, light, energizing, festive, quick, cozy.
8. main_ingredient: chicken, beef, fish, pasta, rice, vegetables, eggs, legumes.
9. budget_level: 1 cheap, 2 medium, 3 expensive.
10. goal_tags: weight_loss, muscle_gain, balanced, quick, budget, variety, meal_prep.`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const body = await request.json();
    const { url, metaOnly = false, caption: clientCaption, thumbnail_url: clientThumbnail, language = "ru" } =
      body as { url?: string; metaOnly?: boolean; caption?: string; thumbnail_url?: string; language?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const langName = LANG_NAMES[language] ?? "Russian";
    const sourceUrl = url.trim();

    console.info("[tiktok] import request", { url: sourceUrl, metaOnly, hasClientCaption: Boolean(clientCaption) });

    // Step 1: get caption + thumbnail
    // Priority: client-provided caption > scraped page
    let caption = clientCaption?.trim() || "";
    let thumbnailUrl: string | null = clientThumbnail?.trim() || null;
    let title = "";

    if (!caption) {
      const pageData = await scrapeTikTokPage(sourceUrl);
      if (pageData) {
        caption = pageData.description || pageData.title || "";
        title = pageData.title || "";
        thumbnailUrl = thumbnailUrl || pageData.thumbnailUrl;
      }
    }

    // metaOnly — just return preview info
    if (metaOnly) {
      return NextResponse.json({
        title: title || caption.split("\n")[0]?.slice(0, 80) || "TikTok",
        thumbnail_url: thumbnailUrl,
        source_url: sourceUrl,
      });
    }

    const inputText = [
      title ? `Название: ${title}` : "",
      caption ? `Описание/подпись:\n${caption}` : "",
    ].filter(Boolean).join("\n\n") || "TikTok рецепт (подробности из видео)";

    console.info("[tiktok] scraped", { captionLen: caption.length, hasThumbnail: Boolean(thumbnailUrl) });

    // Step 2: GPT structuring
    const prompt = buildPrompt(inputText, sourceUrl, langName, thumbnailUrl);

    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return NextResponse.json({ error: "AI error", details: txt }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const aiText: string | undefined = aiData?.choices?.[0]?.message?.content?.trim();
    if (!aiText) return NextResponse.json({ error: "Empty AI response" }, { status: 502 });

    let parsed: any;
    try { parsed = JSON.parse(extractJson(aiText)); }
    catch { return NextResponse.json({ error: "Invalid JSON from AI", raw: aiText }, { status: 502 }); }

    const recipe = normalizeRecipe(parsed, sourceUrl, thumbnailUrl);

    return NextResponse.json({
      recipe,
      meta: { method: "tiktok+page+ai", timestamp: new Date().toISOString() },
    });
  } catch (err) {
    console.error("[tiktok] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
