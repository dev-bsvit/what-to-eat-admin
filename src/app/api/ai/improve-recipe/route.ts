// POST /api/ai/improve-recipe
// AI улучшение импортированного рецепта.
// Free: 2 использования (lifetime). Premium: без ограничений.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUser, logTokenUsage, AuthError } from "@/lib/verifyUser";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const FREE_IMPROVE_LIMIT = 2; // lifetime uses for free users

const LANG_NAMES: Record<string, string> = {
  ru: "Russian", uk: "Ukrainian", en: "English", de: "German",
  es: "Spanish", fr: "French", it: "Italian", "pt-BR": "Portuguese",
};

// ─── Supabase admin client ────────────────────────────────────────────────────

function makeAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Lifetime usage check for free users ─────────────────────────────────────

async function checkImproveLimit(userId: string): Promise<void> {
  const admin = makeAdmin();
  // Sum all daily counts for this user+endpoint across all dates
  const { data } = await admin
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("endpoint", "improve-recipe");

  const total = (data ?? []).reduce((s: number, r: { count: number }) => s + (r.count ?? 0), 0);
  if (total >= FREE_IMPROVE_LIMIT) {
    throw new AuthError(
      "Improve limit reached. Upgrade to Premium for unlimited improvements.",
      403,
      "improve_limit_reached"
    );
  }
}

async function incrementImproveUsage(userId: string): Promise<void> {
  const admin = makeAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("endpoint", "improve-recipe")
    .maybeSingle();

  const cur = (data?.count ?? 0) as number;
  await admin.from("ai_usage").upsert(
    { user_id: userId, date: today, endpoint: "improve-recipe", count: cur + 1 },
    { onConflict: "user_id,date,endpoint" }
  );
}

// ─── Fetch recipe from Supabase ───────────────────────────────────────────────

interface DBIngredient {
  id: string;
  order_index: number;
  amount: number | null;
  unit: string | null;
  note: string | null;
  name: string | null;         // from recipe_ingredients_view join
}

interface DBStep {
  id: string;
  order_index: number;
  text: string;
  timer_seconds: number | null;
}

interface DBRecipe {
  id: string;
  title: string;
  description: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  tips: string | null;
  serving_tips: string | null;
  storage_tips: string | null;
  ingredients: DBIngredient[];
  steps: DBStep[];
}

async function fetchRecipeForImprove(recipeId: string): Promise<DBRecipe | null> {
  const admin = makeAdmin();

  const { data: recipe, error } = await admin
    .from("recipes")
    .select("id, title, description, prep_time, cook_time, servings, tips, serving_tips, storage_tips")
    .eq("id", recipeId)
    .single();

  if (error || !recipe) return null;

  // Fetch ingredients with names from view
  const { data: ingRows } = await admin
    .from("recipe_ingredients_view")
    .select("id, order_index, amount, unit, note, name")
    .eq("recipe_id", recipeId)
    .order("order_index", { ascending: true });

  // Fetch steps
  const { data: stepRows } = await admin
    .from("recipe_steps")
    .select("id, order_index, text, timer_seconds")
    .eq("recipe_id", recipeId)
    .order("order_index", { ascending: true });

  return {
    ...recipe,
    ingredients: (ingRows ?? []) as DBIngredient[],
    steps: (stepRows ?? []) as DBStep[],
  };
}

// ─── Save improved recipe back to Supabase ────────────────────────────────────

interface ImprovedData {
  title: string;
  description: string | null;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  tips: string | null;
  servingTips: string | null;
  storageTips: string | null;
  ingredients: Array<{ amount: number | null; unit: string; note: string | null }>;
  steps: Array<{ text: string }>;
}

async function saveImprovedRecipe(recipeId: string, improved: ImprovedData, original: DBRecipe) {
  const admin = makeAdmin();

  // 1. Update basic recipe fields + tips
  await admin
    .from("recipes")
    .update({
      title: improved.title,
      description: improved.description,
      prep_time: improved.prepTime,
      cook_time: improved.cookTime,
      servings: improved.servings,
      tips: improved.tips,
      serving_tips: improved.servingTips,
      storage_tips: improved.storageTips,
    })
    .eq("id", recipeId);

  // 2. Update ingredient amounts/units/notes in-place (keep product_dictionary_ids)
  //    Match by order_index position; if GPT returned fewer, skip extras.
  for (let i = 0; i < Math.min(improved.ingredients.length, original.ingredients.length); i++) {
    const orig = original.ingredients[i];
    const imp = improved.ingredients[i];
    await admin
      .from("recipe_ingredients")
      .update({ amount: imp.amount, unit: imp.unit || null, note: imp.note || null })
      .eq("id", orig.id);
  }

  // 3. Replace steps entirely (text only)
  await admin.from("recipe_steps").delete().eq("recipe_id", recipeId);
  if (improved.steps.length > 0) {
    await admin.from("recipe_steps").insert(
      improved.steps.map((s, i) => ({
        recipe_id: recipeId,
        text: s.text,
        order_index: i,
        timer_seconds: null,
      }))
    );
  }
}

// ─── GPT prompt ──────────────────────────────────────────────────────────────

function buildPrompt(recipe: DBRecipe, langName: string): string {
  const ingLines = recipe.ingredients.length
    ? recipe.ingredients
        .map((ing, i) => `${i + 1}. ${ing.name ?? "—"} | ${ing.amount ?? "?"} ${ing.unit ?? ""} ${ing.note ? `(${ing.note})` : ""}`.trimEnd())
        .join("\n")
    : "(нет ингредиентов)";

  const stepLines = recipe.steps.length
    ? recipe.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")
    : "(нет шагов)";

  return `You are a professional culinary editor. This recipe was imported from social media (Instagram/TikTok/YouTube) and needs thorough improvement to become a complete, high-quality recipe.

OUTPUT LANGUAGE: ${langName}. Every text field must be in ${langName}.

═══ INPUT RECIPE ═══
Title: ${recipe.title}
Description: ${recipe.description ?? "(отсутствует)"}
Prep time: ${recipe.prep_time ?? "?"} min | Cook time: ${recipe.cook_time ?? "?"} min | Servings: ${recipe.servings ?? "?"}
Tips: ${recipe.tips ?? "(отсутствуют)"}
Serving tips: ${recipe.serving_tips ?? "(отсутствуют)"}
Storage tips: ${recipe.storage_tips ?? "(отсутствуют)"}

INGREDIENTS (${recipe.ingredients.length} items — return EXACTLY this count, same order):
${ingLines}

STEPS:
${stepLines}
═══════════════════

YOUR TASKS — be thorough, not conservative:

TITLE: Fix duplicate words, typos, garbled transliteration. Make it clean and appetizing.

DESCRIPTION (2-3 sentences): Write a mouth-watering description highlighting the dish's appeal, key flavors, and occasion. If it's missing or generic, create a good one from scratch.

TIMES: Set realistic values. Salads: prep 10-15 min, cook 0 min. Soups: prep 20 min, cook 40-60 min. Don't use 0 for cook_time of hot dishes.

INGREDIENTS: For each ingredient in the same order:
- Fill in missing amounts with realistic culinary values (e.g. 2 яйца, 135 г курицы, 150 г грибов)
- Normalize units: г / кг / мл / л / шт / ст.л. / ч.л. / стакан
- Add helpful notes where useful (e.g. "нарезанные кубиками", "вареные вкрутую")
- Do NOT rename, add, or remove ingredients

STEPS: Rewrite to be detailed and clear:
- Each step should be a complete action with specific details (temp, time, technique)
- Add missing obvious steps (пред-нагрев, отдых, подача)
- Remove vague placeholders ("следуйте рецепту", "готовьте как обычно")
- Aim for 4-8 well-written steps

TIPS (tips): 1-2 useful cooking tips that help avoid common mistakes or improve the result. Example: "Не пережаривайте грибы — достаточно 3-4 минуты на сильном огне для золотистой корочки."

SERVING_TIPS (serving_tips): How best to serve the dish — temperature, garnish, pairing. Example: "Подавайте сразу после приготовления, украсив зеленью. Хорошо сочетается с тостами."

STORAGE_TIPS (storage_tips): Storage instructions. Example: "Хранить в холодильнике до 24 часов. Не заправляйте салат заранее — заправляйте перед подачей."

RESPOND WITH VALID JSON ONLY (no markdown, no explanation):
{
  "title": "...",
  "description": "...",
  "prepTime": 15,
  "cookTime": 0,
  "servings": 4,
  "tips": "...",
  "servingTips": "...",
  "storageTips": "...",
  "ingredients": [
    { "amount": 135, "unit": "г", "note": "консервированная" }
  ],
  "steps": [
    { "text": "Detailed step text." }
  ]
}

ingredients array MUST have EXACTLY ${recipe.ingredients.length} elements in the original order.`;
}

// ─── Parse GPT response ───────────────────────────────────────────────────────

function parseImproved(raw: string, original: DBRecipe): ImprovedData {
  const m = raw.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : JSON.parse(raw);

  const ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients.slice(0, original.ingredients.length).map((i: any) => ({
        amount: typeof i.amount === "number" ? i.amount : (parseFloat(i.amount) || null),
        unit: String(i.unit ?? "").trim(),
        note: i.note ? String(i.note).trim() : null,
      }))
    : original.ingredients.map(() => ({ amount: null, unit: "", note: null }));

  // Pad if GPT returned fewer ingredients
  while (ingredients.length < original.ingredients.length) {
    const orig = original.ingredients[ingredients.length];
    ingredients.push({ amount: orig.amount ?? null, unit: orig.unit ?? "", note: orig.note ?? null });
  }

  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.map((s: any) => ({ text: String(s.text ?? s ?? "").trim() })).filter((s: any) => s.text)
    : original.steps.map((s) => ({ text: s.text }));

  return {
    title: String(parsed.title ?? original.title).trim() || original.title,
    description: parsed.description ? String(parsed.description).trim() : original.description,
    prepTime: typeof parsed.prepTime === "number" ? parsed.prepTime : original.prep_time,
    cookTime: typeof parsed.cookTime === "number" ? parsed.cookTime : original.cook_time,
    servings: typeof parsed.servings === "number" ? parsed.servings : original.servings,
    tips: parsed.tips ? String(parsed.tips).trim() : original.tips,
    servingTips: parsed.servingTips ? String(parsed.servingTips).trim() : original.serving_tips,
    storageTips: parsed.storageTips ? String(parsed.storageTips).trim() : original.storage_tips,
    ingredients,
    steps,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const user = await verifyUser(request);

    // Free users: lifetime limit check
    if (!user.isPremium) {
      await checkImproveLimit(user.userId);
    }

    const body = await request.json();
    const { recipeId, language = "ru" } = body as { recipeId?: string; language?: string };

    if (!recipeId) {
      return NextResponse.json({ error: "recipeId is required" }, { status: 400 });
    }

    const recipe = await fetchRecipeForImprove(recipeId);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const langName = LANG_NAMES[language] ?? "Russian";
    const prompt = buildPrompt(recipe, langName);

    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.15,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(40_000),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return NextResponse.json({ error: "AI error", details: txt }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const aiText: string | undefined = aiData?.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    const improved = parseImproved(aiText, recipe);
    await saveImprovedRecipe(recipeId, improved, recipe);

    if (aiData.usage) {
      after(() => logTokenUsage(user.userId, "improve-recipe", aiData.usage));
    }
    if (!user.isPremium) {
      after(() => incrementImproveUsage(user.userId));
    }

    return NextResponse.json({ success: true, title: improved.title });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message, reason: e.reason }, { status: e.status });
    }
    console.error("[improve-recipe] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
