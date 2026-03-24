import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
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

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
}

function normalizeRecipe(parsed: any, fallback: Partial<ImportedRecipe>): ImportedRecipe {
  const title = String(parsed.title || fallback.title || "Рецепт из Pinterest").trim();

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
      { name: "Основной ингредиент", amount: "по вкусу", unit: "", note: "Уточните по источнику" }
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
    ingredients,
    steps,
    sourceUrl: String(parsed.sourceUrl || fallback.sourceUrl || "").trim(),
    sourceDomain: parsed.sourceDomain || fallback.sourceDomain || "pinterest.com",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

interface PinterestData {
  title?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;  // Original source link from pin
}

async function extractPinterestData(url: string): Promise<PinterestData> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for content to render
    await new Promise((r) => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const result: {
        title?: string;
        description?: string;
        imageUrl?: string;
        sourceUrl?: string;
      } = {};

      // Extract title from various selectors
      const titleEl =
        document.querySelector('h1[data-test-id="pin-title"]') ||
        document.querySelector('h1') ||
        document.querySelector('[data-test-id="pinTitle"]');
      if (titleEl) {
        result.title = titleEl.textContent?.trim();
      }

      // Extract description
      const descEl =
        document.querySelector('[data-test-id="pin-description"]') ||
        document.querySelector('[data-test-id="truncated-description"]') ||
        document.querySelector('[data-test-id="CloseupDetails"] span');
      if (descEl) {
        result.description = descEl.textContent?.trim();
      }

      // Extract image
      const imgEl =
        document.querySelector('[data-test-id="pin-closeup-image"] img') ||
        document.querySelector('[data-test-id="closeup-image"] img') ||
        document.querySelector('img[src*="pinimg.com"]');
      if (imgEl) {
        result.imageUrl = (imgEl as HTMLImageElement).src;
      }

      // Extract source URL (the original link the pin points to)
      const sourceLinkEl =
        document.querySelector('a[data-test-id="pin-attribution-link"]') ||
        document.querySelector('a[rel="nofollow noopener"][data-test-id]') ||
        document.querySelector('a[href*="pin.it"]');
      if (sourceLinkEl) {
        const href = (sourceLinkEl as HTMLAnchorElement).href;
        // Skip pinterest internal links
        if (href && !href.includes("pinterest.com")) {
          result.sourceUrl = href;
        }
      }

      // Fallback: check og:tags
      if (!result.title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) result.title = ogTitle.getAttribute("content") || undefined;
      }
      if (!result.description) {
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) result.description = ogDesc.getAttribute("content") || undefined;
      }
      if (!result.imageUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) result.imageUrl = ogImage.getAttribute("content") || undefined;
      }

      // Check for source URL in og:see_also or pinterestapp:source
      if (!result.sourceUrl) {
        const sourceEl = document.querySelector('meta[property="pinterestapp:source"]');
        if (sourceEl) {
          const src = sourceEl.getAttribute("content");
          if (src && !src.includes("pinterest.com")) {
            result.sourceUrl = src;
          }
        }
      }

      return result;
    });

    return data;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function importFromWebEndpoint(sourceUrl: string, baseUrl: string): Promise<any> {
  // Call our own import-recipe endpoint to parse the source website
  const importUrl = new URL("/api/import-recipe", baseUrl).toString();
  const response = await fetch(importUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.recipe || null;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.info("[pinterest] extracting data from:", url);

    // Step 1: Extract Pinterest pin data with Puppeteer
    let pinData: PinterestData;
    try {
      pinData = await extractPinterestData(url.trim());
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to load Pinterest page", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }

    console.info("[pinterest] extracted", {
      title: pinData.title?.slice(0, 60),
      hasDescription: Boolean(pinData.description?.trim()),
      hasImage: Boolean(pinData.imageUrl),
      sourceUrl: pinData.sourceUrl || null,
    });

    // Step 2: If pin has a source URL, try importing from that website
    if (pinData.sourceUrl) {
      console.info("[pinterest] found source URL, trying web import:", pinData.sourceUrl);
      try {
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
        const webRecipe = await importFromWebEndpoint(pinData.sourceUrl, baseUrl);

        if (webRecipe && webRecipe.title && webRecipe.ingredients?.length > 0) {
          console.info("[pinterest] recipe imported from source URL");
          // Override image with Pinterest's higher quality image if available
          if (pinData.imageUrl && !webRecipe.imageUrl) {
            webRecipe.imageUrl = pinData.imageUrl;
          }
          return NextResponse.json({
            recipe: webRecipe,
            meta: {
              method: "pinterest+source+web",
              sourceUrl: pinData.sourceUrl,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        console.info("[pinterest] source URL import failed, falling back to description parsing");
      }
    }

    // Step 3: Fallback — parse pin description + title with AI
    const descriptionText = (pinData.description || "").trim();
    const titleText = (pinData.title || "").trim();

    const combinedText = [
      titleText ? `Название: ${titleText}` : "",
      descriptionText ? `Описание:\n${descriptionText}` : "",
    ].filter(Boolean).join("\n\n").trim();

    if (!combinedText) {
      return NextResponse.json({ error: "No text to parse from Pinterest pin" }, { status: 500 });
    }

    console.info("[pinterest] parsing description with AI, length:", combinedText.length);

    const prompt = `Extract recipe from Pinterest pin description. Return VALID JSON only.

INPUT TEXT:
${combinedText}

REQUIRED OUTPUT FORMAT (copy structure exactly):
{
  "title": "Recipe name from text or generate descriptive title",
  "description": "Brief description",
  "imageUrl": ${pinData.imageUrl ? `"${pinData.imageUrl}"` : "null"},
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "cuisine": "international",
  "tags": ["quick", "dinner"],
  "ingredients": [
    { "name": "ingredient name", "amount": "100", "unit": "г", "note": "" }
  ],
  "steps": [
    { "text": "Step description" }
  ],
  "sourceUrl": "${url}",
  "sourceDomain": "pinterest.com",
  "confidence": "medium"
}

CRITICAL RULES:
1. ALWAYS return valid JSON - no markdown, no comments, no extra text
2. NEVER return empty arrays for ingredients or steps - ALWAYS extract or infer
3. If cooking mentioned but amounts unclear: use "по вкусу" or estimate typical amounts
4. If only dish name known: infer typical ingredients and basic cooking steps
5. Keep ORIGINAL language
6. confidence: "high" if clear recipe, "medium" if inferred, "low" if mostly guessed
7. TAGS — choose only from this list (pick all that apply):
   Time: "quick" (≤20 min total), "special occasion" (>60 min total)
   Calories: "light" (<300 kcal/serving), "hearty" (>650 kcal/serving)
   Meal: "breakfast", "lunch", "dinner", "snack"
   Diet: "vegetarian", "vegan", "gluten-free", "dairy-free"
   Type: "soup", "salad", "pasta", "grill", "baking", "raw"
   If total time unknown but dish looks quick → add "quick". Do NOT add tags not in this list.`;

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: prompt, temperature: 0.2 }),
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

    const fallback: Partial<ImportedRecipe> = {
      title: titleText || "Pinterest recipe",
      description: descriptionText.slice(0, 300),
      imageUrl: pinData.imageUrl,
      sourceUrl: url,
      sourceDomain: "pinterest.com",
    };

    const recipe = normalizeRecipe(parsed, fallback);

    return NextResponse.json({
      recipe,
      meta: {
        method: "pinterest+description+ai",
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
