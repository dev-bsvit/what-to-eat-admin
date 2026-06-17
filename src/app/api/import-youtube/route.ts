import { NextResponse } from "next/server";

export const runtime = "nodejs";
// YouTube pages can be large — increase limit to 60 s (Vercel hobby plan max)
export const maxDuration = 60;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

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
  ingredients: Array<{ name: string; amount: string; unit: string; note?: string }>;
  steps: Array<{ text: string }>;
  sourceUrl: string;
  sourceDomain?: string;
  confidence: "high" | "medium" | "low";
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch { /* ignore */ }
  return null;
}

function watchUrl(rawUrl: string): string {
  const id = extractVideoId(rawUrl);
  return id ? `https://www.youtube.com/watch?v=${id}` : rawUrl;
}

function getDomain(url: string) {
  try { return new URL(url).hostname; } catch { return "youtube.com"; }
}

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

// ─── YouTube page scraper (replaces yt-dlp) ───────────────────────────────────

const YT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

interface YTPageData {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  videoId: string | null;
}

/** Fetches the YouTube watch page and parses ytInitialData for title + description. */
async function scrapeYouTubePage(videoId: string): Promise<YTPageData | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: YT_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn("[youtube] page fetch failed", { status: res.status });
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.warn("[youtube] page fetch error", err);
    return null;
  }

  // ytInitialData is a large JSON assigned inside a <script> tag.
  // Match everything between the assignment and the first </script> boundary.
  const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) {
    console.warn("[youtube] ytInitialData not found in page HTML");
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[1]);
  } catch {
    console.warn("[youtube] ytInitialData JSON parse failed");
    return null;
  }

  // ── Title ──
  // twoColumnWatchNextResults → results → videoPrimaryInfoRenderer
  let title = "";
  try {
    const results = (data as any)
      ?.contents?.twoColumnWatchNextResults?.results?.results?.contents as any[];
    const primary = results?.find((c: any) => c?.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
    title = primary?.title?.runs?.map((r: any) => r.text).join("") ?? "";
  } catch { /* ignore */ }

  // ── Description ──
  let description = "";
  try {
    // Engagement panel path (new UI)
    const panels = (data as any)?.engagementPanels as any[] | undefined;
    const descPanel = panels?.find(
      (p: any) =>
        p?.engagementPanelSectionListRenderer?.targetId ===
        "engagement-panel-structured-description"
    );
    const items =
      descPanel?.engagementPanelSectionListRenderer?.content
        ?.structuredDescriptionContentRenderer?.items as any[];
    const bodyItem = items?.find((i: any) => i?.expandableVideoDescriptionBodyRenderer);
    const attrText =
      bodyItem?.expandableVideoDescriptionBodyRenderer?.attributedDescriptionBodyText;
    // attributedDescriptionBodyText.content is sometimes a plain string, sometimes runs
    if (typeof attrText?.content === "string") {
      description = attrText.content;
    } else {
      description = (attrText?.commandRuns ?? attrText?.runs ?? [])
        .map((r: any) => r.text ?? "")
        .join("");
    }
  } catch { /* ignore */ }

  // Fallback: secondary info renderer (old UI)
  if (!description) {
    try {
      const results = (data as any)
        ?.contents?.twoColumnWatchNextResults?.results?.results?.contents as any[];
      const secondary = results?.find((c: any) => c?.videoSecondaryInfoRenderer)
        ?.videoSecondaryInfoRenderer;
      description =
        secondary?.attributedDescription?.content ??
        secondary?.description?.runs?.map((r: any) => r.text).join("") ??
        "";
    } catch { /* ignore */ }
  }

  // ── Thumbnail (best quality) ──
  let thumbnailUrl: string | null = null;
  try {
    const results = (data as any)
      ?.contents?.twoColumnWatchNextResults?.results?.results?.contents as any[];
    const primary = results?.find((c: any) => c?.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
    const thumbs = primary?.thumbnail?.thumbnails as any[];
    thumbnailUrl = thumbs?.at(-1)?.url ?? null;
  } catch { /* ignore */ }
  // Fallback to standard maxresdefault
  if (!thumbnailUrl) thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return { title, description, thumbnailUrl, videoId };
}

/** oEmbed fallback — only title + thumbnail, NO description. */
async function oEmbedFallback(rawUrl: string): Promise<Pick<YTPageData, "title" | "thumbnailUrl"> | null> {
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
  try {
    const res = await fetch(oembed, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      title: String(d?.title ?? "").trim() || "YouTube",
      thumbnailUrl: d?.thumbnail_url ? String(d.thumbnail_url) : null,
    };
  } catch { return null; }
}

// ─── Recipe normaliser ────────────────────────────────────────────────────────

function normalizeRecipe(parsed: any, fb: Partial<ImportedRecipe>): ImportedRecipe {
  const title = String(parsed.title || fb.title || "Рецепт из YouTube").trim();
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
    ? parsed.steps.map((s: any) => ({ text: String(s.text || s || "").trim() })).filter((s: any) => s.text.length > 0)
    : [];

  if (!ingredients.length)
    ingredients = [{ name: "Основной ингредиент", amount: "по вкусу", unit: "", note: "Уточните по видео" }];
  if (!steps.length)
    steps = [{ text: "Следуйте инструкциям из видео" }];

  return {
    title,
    description: parsed.description ? String(parsed.description).trim() : fb.description,
    imageUrl: parsed.imageUrl || fb.imageUrl,
    prepTime: normalizeNum(parsed.prepTime, fb.prepTime ?? 15),
    cookTime: normalizeNum(parsed.cookTime, fb.cookTime ?? 30),
    servings: normalizeNum(parsed.servings, fb.servings ?? 4),
    cuisine: parsed.cuisine ? String(parsed.cuisine).trim() : (fb.cuisine ?? "international"),
    tags: normalizeArr(parsed.tags),
    meal_role: normalizeArr(parsed.meal_role, fb.meal_role),
    fridge_life_days: normalizeNum(parsed.fridge_life_days, fb.fridge_life_days ?? 1),
    mood_tags: normalizeArr(parsed.mood_tags, fb.mood_tags),
    main_ingredient: parsed.main_ingredient ? String(parsed.main_ingredient).trim() : fb.main_ingredient,
    budget_level: normalizeNum(parsed.budget_level, fb.budget_level),
    season: normalizeArr(parsed.season, fb.season ?? ["all"]),
    is_compound_safe: typeof parsed.is_compound_safe === "boolean" ? parsed.is_compound_safe : (fb.is_compound_safe ?? true),
    goal_tags: normalizeArr(parsed.goal_tags, fb.goal_tags ?? []),
    kid_friendly: typeof parsed.kid_friendly === "boolean" ? parsed.kid_friendly : (fb.kid_friendly ?? false),
    spicy_level: normalizeNum(parsed.spicy_level, fb.spicy_level ?? 0),
    ingredients,
    steps,
    sourceUrl: String(parsed.sourceUrl || fb.sourceUrl || "").trim(),
    sourceDomain: parsed.sourceDomain || fb.sourceDomain || "youtube.com",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

function buildPrompt(inputText: string, sourceUrl: string, sourceDomain: string, imageUrl?: string | null) {
  return `Extract recipe from YouTube video description. Return VALID JSON only, no markdown.

INPUT:
${inputText}

OUTPUT FORMAT:
{
  "title": "Recipe name",
  "description": "Brief description",
  "imageUrl": ${imageUrl ? `"${imageUrl}"` : "null"},
  "prepTime": 15, "cookTime": 30, "servings": 4,
  "cuisine": "international",
  "tags": ["quick","dinner"],
  "meal_role": ["dinner"],
  "fridge_life_days": 1,
  "mood_tags": ["comfort"],
  "main_ingredient": "chicken",
  "budget_level": 2,
  "season": ["all"],
  "is_compound_safe": true,
  "goal_tags": ["balanced"],
  "kid_friendly": false,
  "spicy_level": 0,
  "ingredients": [{"name":"ingredient","amount":"100","unit":"г","note":""}],
  "steps": [{"text":"Step text"}],
  "sourceUrl": "${sourceUrl}",
  "sourceDomain": "${sourceDomain}",
  "confidence": "medium"
}

RULES:
1. Keep ORIGINAL language — do NOT translate Russian↔English.
2. NEVER return empty arrays for ingredients or steps.
3. confidence: "high" if full recipe found, "medium" if partially inferred, "low" if mostly guessed.
4. tags: only from — quick, special occasion, light, hearty, breakfast, lunch, dinner, snack, vegetarian, vegan, gluten-free, dairy-free, soup, salad, pasta, grill, baking, raw.
5. meal_role: breakfast, lunch_main, lunch_side, dinner, snack, dessert.
6. mood_tags: comfort, light, energizing, festive, quick, cozy.
7. main_ingredient: chicken, beef, fish, pasta, rice, vegetables, eggs, legumes.
8. budget_level: 1 cheap, 2 medium, 3 expensive.
9. goal_tags: weight_loss, muscle_gain, balanced, quick, budget, variety, meal_prep.`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, metaOnly = false } = body as { url?: string; metaOnly?: boolean };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!metaOnly && !apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const videoId = extractVideoId(url.trim());
    const canonicalUrl = watchUrl(url.trim());
    const domain = getDomain(canonicalUrl);

    console.info("[youtube] import request", { url: url.trim(), videoId, metaOnly });

    // Step 1: scrape page for title + description + thumbnail
    const pageData = videoId ? await scrapeYouTubePage(videoId) : null;

    // metaOnly — just return preview, no GPT
    if (metaOnly) {
      if (pageData?.title || pageData?.thumbnailUrl) {
        return NextResponse.json({
          video_id: videoId,
          title: pageData.title || "YouTube",
          thumbnail_url: pageData.thumbnailUrl,
          source_url: canonicalUrl,
        });
      }
      const oembed = await oEmbedFallback(url.trim());
      if (oembed) {
        return NextResponse.json({ video_id: videoId, ...oembed, source_url: canonicalUrl });
      }
      return NextResponse.json({ error: "Could not fetch video preview" }, { status: 500 });
    }

    // Step 2: build input text for GPT
    let title = pageData?.title ?? "";
    let description = pageData?.description ?? "";
    let thumbnailUrl = pageData?.thumbnailUrl ?? null;

    // If page scrape got nothing, fall back to oEmbed for title/thumbnail only
    if (!title && !description) {
      const oembed = await oEmbedFallback(url.trim());
      title = oembed?.title ?? "";
      thumbnailUrl = oembed?.thumbnailUrl ?? thumbnailUrl;
    }

    const inputText = [
      title ? `Название: ${title}` : "",
      description ? `Описание:\n${description}` : "",
    ].filter(Boolean).join("\n\n").trim();

    console.info("[youtube] scraped", {
      videoId,
      titleLen: title.length,
      descLen: description.length,
      hasThumbnail: Boolean(thumbnailUrl),
    });

    if (!inputText) {
      return NextResponse.json(
        { error: "Could not extract any text from the YouTube page" },
        { status: 500 }
      );
    }

    // Step 3: GPT structuring
    const prompt = buildPrompt(inputText, canonicalUrl, domain, thumbnailUrl);

    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      return NextResponse.json({ error: "AI error", details: txt }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const aiText: string | undefined = aiData?.choices?.[0]?.message?.content?.trim();
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
      title: title || "YouTube recipe",
      description: description.slice(0, 300),
      imageUrl: thumbnailUrl ?? undefined,
      sourceUrl: canonicalUrl,
      sourceDomain: domain,
    });

    return NextResponse.json({
      recipe,
      meta: { method: "youtube+page+ai", timestamp: new Date().toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
