// POST /api/ai/improve-recipe
// Доводит импортированный рецепт до качества каталога:
// заполняет все теги, бюджет, роль, эмбеддинг — как вручную через админку.
// Free: 2 использования (lifetime). Premium: без ограничений.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUser, logTokenUsage, AuthError } from "@/lib/verifyUser";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";
const FREE_IMPROVE_LIMIT = 2;

const LANG_NAMES: Record<string, string> = {
  ru: "Russian", uk: "Ukrainian", en: "English", de: "German",
  es: "Spanish", fr: "French", it: "Italian", "pt-BR": "Portuguese",
};

function makeAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Usage limit ──────────────────────────────────────────────────────────────

async function checkImproveLimit(userId: string): Promise<void> {
  const admin = makeAdmin();
  const { data } = await admin
    .from("ai_usage").select("count")
    .eq("user_id", userId).eq("endpoint", "improve-recipe");
  const total = (data ?? []).reduce((s: number, r: { count: number }) => s + (r.count ?? 0), 0);
  if (total >= FREE_IMPROVE_LIMIT) {
    throw new AuthError("Improve limit reached. Upgrade to Premium.", 403, "improve_limit_reached");
  }
}

async function incrementImproveUsage(userId: string): Promise<void> {
  const admin = makeAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("ai_usage").select("count")
    .eq("user_id", userId).eq("date", today).eq("endpoint", "improve-recipe").maybeSingle();
  const cur = (data?.count ?? 0) as number;
  await admin.from("ai_usage").upsert(
    { user_id: userId, date: today, endpoint: "improve-recipe", count: cur + 1 },
    { onConflict: "user_id,date,endpoint" }
  );
}

// ─── Fetch recipe ─────────────────────────────────────────────────────────────

interface DBIngredient { id: string; order_index: number; amount: number | null; unit: string | null; note: string | null; name: string | null; }
interface DBStep { id: string; order_index: number; text: string; }

interface DBRecipe {
  id: string; title: string; description: string | null;
  prep_time: number | null; cook_time: number | null; servings: number | null;
  tips: string | null; serving_tips: string | null; storage_tips: string | null;
  ingredients: DBIngredient[]; steps: DBStep[];
}

async function fetchRecipe(recipeId: string): Promise<DBRecipe | null> {
  const admin = makeAdmin();
  const { data: recipe, error } = await admin
    .from("recipes")
    .select("id, title, description, prep_time, cook_time, servings, tips, serving_tips, storage_tips")
    .eq("id", recipeId).single();
  if (error || !recipe) return null;

  const { data: ingRows } = await admin.from("recipe_ingredients_view")
    .select("id, order_index, amount, unit, note, name")
    .eq("recipe_id", recipeId).order("order_index", { ascending: true });

  const { data: stepRows } = await admin.from("recipe_steps")
    .select("id, order_index, text")
    .eq("recipe_id", recipeId).order("order_index", { ascending: true });

  return { ...recipe, ingredients: (ingRows ?? []) as DBIngredient[], steps: (stepRows ?? []) as DBStep[] };
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

// ─── Comprehensive GPT prompt ─────────────────────────────────────────────────

function buildPrompt(recipe: DBRecipe, langName: string): string {
  const ingLines = recipe.ingredients.length
    ? recipe.ingredients.map((ing, i) =>
        `${i + 1}. ${ing.name ?? "—"} | ${ing.amount ?? "?"} ${ing.unit ?? ""} ${ing.note ? `(${ing.note})` : ""}`.trimEnd()
      ).join("\n")
    : "(нет)";

  const stepLines = recipe.steps.length
    ? recipe.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")
    : "(нет)";

  return `You are a professional culinary editor filling a recipe to CATALOG QUALITY — the same level as premium restaurant recipe databases.

OUTPUT LANGUAGE: ${langName}. Every user-visible text field must be in ${langName}.

═══ INPUT RECIPE ═══
Title: ${recipe.title}
Description: ${recipe.description ?? "(missing)"}
Prep: ${recipe.prep_time ?? "?"} min | Cook: ${recipe.cook_time ?? "?"} min | Servings: ${recipe.servings ?? "?"}

INGREDIENTS (${recipe.ingredients.length} items — return EXACTLY this count, same order, in ${langName}):
${ingLines}

STEPS:
${stepLines}
═══════════════════

PRODUCE A COMPLETE JSON with ALL fields below. Be thorough and accurate.

═══ REQUIRED OUTPUT JSON ═══
{
  "title": "Clean, appetizing title in ${langName}",
  "description": "2-3 sentences: what the dish is, key flavors, occasion/audience. Make it enticing.",
  "prepTime": <integer minutes>,
  "cookTime": <integer minutes, 0 for cold dishes>,
  "servings": <integer>,

  "dish_type": "<soup|salad|stir-fry|pasta|sandwich|curry|steak|casserole|baked|fried|grilled|dessert|smoothie|drink|other>",
  "course": "<main|side|appetizer|dessert|breakfast|snack>",

  "tags": ["<pick ALL that apply from: quick, special occasion, light, hearty, breakfast, lunch, dinner, snack, vegetarian, vegan, gluten-free, dairy-free, soup, salad, pasta, grill, baking, raw>"],
  "meal_role": ["<pick ALL that apply from: breakfast, lunch_main, lunch_side, dinner, snack, dessert>"],
  "mood_tags": ["<pick 1-3 from: comfort, light, energizing, festive, quick, cozy>"],
  "diet_tags": ["<pick applicable from: vegetarian, vegan, gluten-free, dairy-free, pescatarian, keto, low-carb — or [] if none>"],
  "goal_tags": ["<pick ALL that apply from: weight_loss, muscle_gain, balanced, quick, budget, variety, meal_prep>"],

  "main_ingredient": "<exactly one of: chicken, beef, fish, pasta, rice, vegetables, eggs, legumes>",
  "budget_level": <1=cheap (grains/eggs/vegetables), 2=medium (chicken/pork/cheese), 3=expensive (beef/seafood/premium)>,
  "season": ["<pick from: spring, summer, autumn, winter, all>"],
  "fridge_life_days": <0=same day, 1=default, 2=cutlets/casseroles, 3=soups/stews>,
  "is_compound_safe": <true if can be served with sides/salad; false if self-contained soup/stew>,
  "kid_friendly": <true only if mild, no alcohol, child-appropriate>,
  "spicy_level": <0=none, 1=mild, 2=medium, 3=hot>,

  "tips": "1-2 cooking tips that prevent common mistakes or elevate the dish.",
  "serving_tips": "How to serve: temperature, garnish, pairing suggestions.",
  "storage_tips": "Storage instructions: duration, container, reheating.",

  "ingredients": [
    <EXACTLY ${recipe.ingredients.length} objects, same order as input>
    { "amount": <number or null>, "unit": "<г|кг|мл|л|шт|ст.л.|ч.л.|стакан|зубчика|...>", "note": "<helpful prep note or empty string>" }
  ],
  "steps": [
    <4-8 detailed, actionable steps>
    { "text": "Detailed step with specific temperature, time, and technique." }
  ]
}

RULES:
- ingredients array MUST have EXACTLY ${recipe.ingredients.length} elements
- All text in ${langName}
- Do NOT rename ingredients — only improve amount/unit/note
- budget_level based on most expensive ingredient: beef/seafood/salmon→3, chicken/pork/cheese→2, eggs/rice/veg→1
- is_compound_safe: false for soups, stews, risotto; true for salads, cutlets, pasta
- Return ONLY the JSON object, no markdown fences`;
}

// ─── Parse GPT response ───────────────────────────────────────────────────────

function str(v: unknown, fb = ""): string { return v != null ? String(v).trim() : fb; }
function num(v: unknown, fb: number | null = null): number | null {
  const n = Number(v); return Number.isFinite(n) ? n : fb;
}
function arr(v: unknown, allowed?: string[], fb: string[] = []): string[] {
  if (!Array.isArray(v)) return fb;
  const mapped = v.map((x) => String(x).trim()).filter(Boolean);
  return allowed ? mapped.filter((x) => allowed.includes(x)) : mapped;
}

const VALID_MOOD = ["comfort", "light", "energizing", "festive", "quick", "cozy"];
const VALID_TAGS = ["quick", "special occasion", "light", "hearty", "breakfast", "lunch", "dinner", "snack",
  "vegetarian", "vegan", "gluten-free", "dairy-free", "soup", "salad", "pasta", "grill", "baking", "raw"];
const VALID_MEAL_ROLE = ["breakfast", "lunch_main", "lunch_side", "dinner", "snack", "dessert"];
const VALID_MAIN_ING = ["chicken", "beef", "fish", "pasta", "rice", "vegetables", "eggs", "legumes"];
const VALID_GOAL = ["weight_loss", "muscle_gain", "balanced", "quick", "budget", "variety", "meal_prep"];
const VALID_SEASON = ["spring", "summer", "autumn", "winter", "all"];

function parseResponse(raw: string, original: DBRecipe) {
  const m = raw.match(/\{[\s\S]*\}/);
  const p = JSON.parse(m ? m[0] : raw);

  // Ingredients: same count, update amounts/units/notes only
  const rawIng: unknown[] = Array.isArray(p.ingredients) ? p.ingredients : [];
  const ingredients = original.ingredients.map((orig, i) => {
    const imp = rawIng[i] as Record<string, unknown> | undefined;
    return {
      id: orig.id,
      amount: imp ? num(imp.amount, orig.amount) : orig.amount,
      unit: imp ? (str(imp.unit) || orig.unit || "") : (orig.unit ?? ""),
      note: imp ? str(imp.note) : (orig.note ?? ""),
    };
  });

  // Steps
  const steps = Array.isArray(p.steps)
    ? p.steps.map((s: unknown) => ({
        text: str((s as Record<string, unknown>)?.text ?? s, ""),
      })).filter((s: { text: string }) => s.text.length > 0)
    : original.steps.map((s) => ({ text: s.text }));

  return {
    // Basic
    title: str(p.title, original.title) || original.title,
    description: str(p.description, original.description ?? ""),
    prepTime: num(p.prepTime, original.prep_time),
    cookTime: num(p.cookTime, original.cook_time),
    servings: num(p.servings, original.servings),
    // Catalog metadata
    dish_type: str(p.dish_type),
    course: str(p.course),
    tags: arr(p.tags, VALID_TAGS),
    meal_role: arr(p.meal_role, VALID_MEAL_ROLE),
    mood_tags: arr(p.mood_tags, VALID_MOOD),
    diet_tags: arr(p.diet_tags),
    goal_tags: arr(p.goal_tags, VALID_GOAL),
    main_ingredient: VALID_MAIN_ING.includes(str(p.main_ingredient)) ? str(p.main_ingredient) : null,
    budget_level: [1, 2, 3].includes(Number(p.budget_level)) ? Number(p.budget_level) : null,
    season: arr(p.season, VALID_SEASON, ["all"]),
    fridge_life_days: num(p.fridge_life_days, original.steps.length > 0 ? 1 : null),
    is_compound_safe: typeof p.is_compound_safe === "boolean" ? p.is_compound_safe : null,
    kid_friendly: typeof p.kid_friendly === "boolean" ? p.kid_friendly : false,
    spicy_level: num(p.spicy_level, 0),
    // Tips
    tips: str(p.tips) || original.tips,
    serving_tips: str(p.serving_tips) || original.serving_tips,
    storage_tips: str(p.storage_tips) || original.storage_tips,
    // Content
    ingredients,
    steps,
  };
}

// ─── Save everything ──────────────────────────────────────────────────────────

async function saveRecipe(recipeId: string, data: ReturnType<typeof parseResponse>, embedding: number[] | null) {
  const admin = makeAdmin();

  // 1. Update recipes table — all catalog fields
  const updatePayload: Record<string, unknown> = {
    title: data.title,
    description: data.description || null,
    prep_time: data.prepTime,
    cook_time: data.cookTime,
    servings: data.servings,
    dish_type: data.dish_type || null,
    course: data.course || null,
    tags: data.tags,
    meal_role: data.meal_role,
    mood_tags: data.mood_tags,
    diet_tags: data.diet_tags,
    goal_tags: data.goal_tags,
    main_ingredient: data.main_ingredient,
    budget_level: data.budget_level,
    season: data.season,
    fridge_life_days: data.fridge_life_days,
    is_compound_safe: data.is_compound_safe,
    kid_friendly: data.kid_friendly,
    spicy_level: data.spicy_level,
    tips: data.tips || null,
    serving_tips: data.serving_tips || null,
    storage_tips: data.storage_tips || null,
  };
  if (embedding) updatePayload.embedding = JSON.stringify(embedding);

  await admin.from("recipes").update(updatePayload).eq("id", recipeId);

  // 2. Update ingredient amounts/units/notes (keep product_dictionary_ids)
  for (const ing of data.ingredients) {
    await admin.from("recipe_ingredients")
      .update({ amount: ing.amount, unit: ing.unit || null, note: ing.note || null })
      .eq("id", ing.id);
  }

  // 3. Replace steps
  await admin.from("recipe_steps").delete().eq("recipe_id", recipeId);
  if (data.steps.length > 0) {
    await admin.from("recipe_steps").insert(
      data.steps.map((s: { text: string }, i: number) => ({ recipe_id: recipeId, text: s.text, order_index: i, timer_seconds: null }))
    );
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() { return NextResponse.json({ ok: true }); }

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const user = await verifyUser(request);
    if (!user.isPremium) await checkImproveLimit(user.userId);

    const body = await request.json();
    const { recipeId, language = "ru" } = body as { recipeId?: string; language?: string };
    if (!recipeId) return NextResponse.json({ error: "recipeId is required" }, { status: 400 });

    const recipe = await fetchRecipe(recipeId);
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    const langName = LANG_NAMES[language] ?? "Russian";
    const prompt = buildPrompt(recipe, langName);

    console.info("[improve-recipe] request", {
      recipeId, language, ingCount: recipe.ingredients.length, stepCount: recipe.steps.length,
    });

    // GPT: fill everything
    const aiRes = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.15,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return NextResponse.json({ error: "AI error", details: txt }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const aiText: string | undefined = aiData?.choices?.[0]?.message?.content?.trim();
    if (!aiText) return NextResponse.json({ error: "Empty AI response" }, { status: 502 });

    const improved = parseResponse(aiText, recipe);

    // Embedding: title + description
    const embedText = [improved.title, improved.description].filter(Boolean).join(" ");
    const embedding = await generateEmbedding(embedText, apiKey);

    await saveRecipe(recipeId, improved, embedding);

    if (aiData.usage) after(() => logTokenUsage(user.userId, "improve-recipe", aiData.usage));
    if (!user.isPremium) after(() => incrementImproveUsage(user.userId));

    console.info("[improve-recipe] done", {
      recipeId, title: improved.title,
      tags: improved.tags, mood: improved.mood_tags, budget: improved.budget_level,
      hasEmbedding: Boolean(embedding),
    });

    return NextResponse.json({ success: true, title: improved.title });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message, reason: e.reason }, { status: e.status });
    }
    console.error("[improve-recipe] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
