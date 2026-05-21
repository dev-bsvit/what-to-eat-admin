import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APP_LANGUAGES } from "@/lib/translate";
import { normalize } from "@/lib/stringUtils";

export const maxDuration = 300;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const CATEGORIES = [
  "grains", "meat", "dairy", "vegetables", "fruits",
  "bakery", "fish", "frozen", "drinks", "spices",
  "canned", "snacks", "other",
] as const;

const LATIN_LANGUAGES = ["en", "de", "it", "fr", "es", "pt-BR"];

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductRow = {
  id: string;
  canonical_name: string;
  category?: string | null;
  icon?: string | null;
  synonyms?: string[] | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbohydrates?: number | null;
  fiber?: number | null;
  preferred_unit?: string | null;
  typical_serving?: number | null;
  requires_expiry?: boolean | null;
  default_shelf_life_days?: number | null;
  seasonal_months?: number[] | null;
  description?: string | null;
  storage_tips?: string | null;
  needs_moderation?: boolean | null;
  moderation_status?: string | null;
  usage_count?: number | null;
};

type ProcessResult = {
  productId: string;
  name: string;
  action: string;
  changed: boolean;
  inputTokens: number;
  outputTokens: number;
  error?: string;
};

// GPT-4o-mini pricing per token
const PRICE_IN  = 0.15  / 1_000_000; // $0.15 per 1M input tokens
const PRICE_OUT = 0.60  / 1_000_000; // $0.60 per 1M output tokens

type SmartStats = {
  total: number;
  badTranslations: number;
  missingLanguages: number;
  poorSynonyms: number;
  pendingModeration: number;
  totalIssues: number;
  isClean: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasCyrillic(s: string): boolean {
  return /[Ѐ-ӿ]/.test(s);
}

const asNum = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

// ── Stats ─────────────────────────────────────────────────────────────────────

async function getSmartStats(): Promise<SmartStats> {
  const [
    { count: total },
    allTranslationsRaw,
    pendingIdsRes,
    allIdsRes,
  ] = await Promise.all([
    supabaseAdmin.from("product_dictionary").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("product_translations").select("product_id, language_code, name, synonyms").limit(10000),
    supabaseAdmin.from("product_dictionary").select("id").or("needs_moderation.eq.true,moderation_status.eq.pending"),
    supabaseAdmin.from("product_dictionary").select("id").limit(5000),
  ]);

  const translations = allTranslationsRaw.data ?? [];

  // Bad translations: Cyrillic in Latin languages
  const badTranslationIds = new Set(
    translations.filter(t => LATIN_LANGUAGES.includes(t.language_code) && hasCyrillic(t.name)).map(t => t.product_id)
  );

  // Missing languages: product doesn't have all 8
  const productLangs: Record<string, Set<string>> = {};
  for (const t of translations) {
    if (!productLangs[t.product_id]) productLangs[t.product_id] = new Set();
    productLangs[t.product_id].add(t.language_code);
  }
  const allRequired = new Set(APP_LANGUAGES as readonly string[]);
  const missingLangIds = new Set(
    (allIdsRes.data ?? []).filter(p => {
      const has = productLangs[p.id] ?? new Set();
      return [...allRequired].some(l => !has.has(l));
    }).map(p => p.id)
  );

  // Poor synonyms: any language translation with < 3 synonyms
  const poorSynonymIds = new Set(
    translations.filter(t => !t.synonyms || t.synonyms.length < 3).map(t => t.product_id)
  );

  const pendingIds = new Set((pendingIdsRes.data ?? []).map(p => p.id));

  const badTranslations = badTranslationIds.size;
  const missingLanguages = missingLangIds.size;
  const poorSynonyms = poorSynonymIds.size;
  const pendingModeration = pendingIds.size;

  // Unique products with at least one issue (avoids double-counting)
  const uniqueAffected = new Set([...badTranslationIds, ...missingLangIds, ...poorSynonymIds, ...pendingIds]);

  return {
    total: total ?? 0,
    badTranslations,
    missingLanguages,
    poorSynonyms,
    pendingModeration,
    totalIssues: uniqueAffected.size,
    isClean: uniqueAffected.size === 0,
  };
}

// ── Fetch batches by mode ─────────────────────────────────────────────────────

async function fetchBatch(mode: string, limit: number): Promise<ProductRow[]> {
  const { data: allProducts } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .order("usage_count", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (!allProducts?.length) return [];

  const { data: allTranslations } = await supabaseAdmin
    .from("product_translations")
    .select("product_id, language_code, name, synonyms")
    .limit(10000);
  const translations = allTranslations ?? [];

  if (mode === "fix-translations") {
    const badIds = new Set(
      translations.filter(t => LATIN_LANGUAGES.includes(t.language_code) && hasCyrillic(t.name)).map(t => t.product_id)
    );
    return (allProducts as ProductRow[]).filter(p => badIds.has(p.id)).slice(0, limit);
  }

  if (mode === "fill-languages") {
    const productLangs: Record<string, Set<string>> = {};
    for (const t of translations) {
      if (!productLangs[t.product_id]) productLangs[t.product_id] = new Set();
      productLangs[t.product_id].add(t.language_code);
    }
    const allRequired = new Set(APP_LANGUAGES as readonly string[]);
    return (allProducts as ProductRow[])
      .filter(p => !badIds_check(p.id, translations) && [...allRequired].some(l => !(productLangs[p.id] ?? new Set()).has(l)))
      .slice(0, limit);
  }

  if (mode === "enrich-synonyms") {
    const poorIds = new Set(
      translations.filter(t => !t.synonyms || t.synonyms.length < 3).map(t => t.product_id)
    );
    // Only enrich products that already have all 8 languages (don't waste tokens on incomplete products)
    const productLangs: Record<string, Set<string>> = {};
    for (const t of translations) {
      if (!productLangs[t.product_id]) productLangs[t.product_id] = new Set();
      productLangs[t.product_id].add(t.language_code);
    }
    const allRequired = new Set(APP_LANGUAGES as readonly string[]);
    return (allProducts as ProductRow[])
      .filter(p => poorIds.has(p.id) && [...allRequired].every(l => (productLangs[p.id] ?? new Set()).has(l)))
      .slice(0, limit);
  }

  // "pending" mode: user-submitted products needing moderation
  if (mode === "pending") {
    return (allProducts as ProductRow[])
      .filter(p => p.needs_moderation || p.moderation_status === "pending")
      .slice(0, limit);
  }

  return [];
}

// Helper to avoid double-processing bad translation products in fill-languages
function badIds_check(productId: string, translations: Array<{ product_id: string; language_code: string; name: string }>): boolean {
  return translations.some(t => t.product_id === productId && LATIN_LANGUAGES.includes(t.language_code) && hasCyrillic(t.name));
}

// ── Auto mode: pick highest priority task ─────────────────────────────────────

async function getAutoMode(): Promise<string | null> {
  const stats = await getSmartStats();
  if (stats.badTranslations > 0) return "fix-translations";
  if (stats.missingLanguages > 0) return "fill-languages";
  if (stats.pendingModeration > 0) return "pending";
  if (stats.poorSynonyms > 0) return "enrich-synonyms";
  return null;
}

// ── GPT: full translate + normalize ──────────────────────────────────────────

type GPTResult = {
  canonical_name: string;
  category: string;
  icon: string;
  preferred_unit: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  fiber: number | null;
  typical_serving: number | null;
  requires_expiry: boolean;
  default_shelf_life_days: number | null;
  seasonal_months: number[];
  description: string | null;
  storage_tips: string | null;
  synonyms: string[];
  translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }>;
  inputTokens: number;
  outputTokens: number;
};

async function callGPTTranslate(product: ProductRow): Promise<GPTResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const prompt = `Ты нормализуешь и переводишь продукты для кулинарного приложения.

Продукт: "${product.canonical_name}"
Категория: ${product.category ?? "неизвестна"}

ЗАДАЧА 1 — Верни чистое русское название (убери мусор, оставь суть).
КРИТИЧЕСКИ: НЕ заменяй специфический продукт на общий. "Соус цую" ≠ "Соевый соус". "Дижонская горчица" ≠ "Горчица".

ЗАДАЧА 2 — Категория из: ${CATEGORIES.join(", ")}. Иконка-эмодзи. Единица: g/kg/ml/l/pcs/null.

ЗАДАЧА 3 — Переводы на 8 языков (en, ru, de, it, fr, es, pt-BR, uk).
Для каждого языка:
• name: нативное название на ЭТОМ языке (en → English, de → Deutsch, etc.)
• synonyms: 5-8 синонимов включая: множественное число, региональные варианты, рыночные названия, разговорные формы, варианты нарезки/подачи
  Пример для "Куриная четверть": ru=["окорочка","четвертинка","куриный окорочок"], en=["quarter chicken","chicken leg quarter","drumstick quarter"]
• description: 1 предложение
• storage_tips: 1 предложение

ЗАДАЧА 4 — КБЖУ на 100г (только если уверен, иначе null).

Верни ТОЛЬКО валидный JSON:
{
  "canonical_name": "...",
  "category": "...",
  "icon": "...",
  "preferred_unit": "g",
  "calories": 0, "protein": 0, "fat": 0, "carbohydrates": 0, "fiber": 0,
  "typical_serving": 100,
  "requires_expiry": true,
  "default_shelf_life_days": 7,
  "seasonal_months": [],
  "description": "...",
  "storage_tips": "...",
  "synonyms": ["..."],
  "translations": {
    "en": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "ru": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "de": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "it": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "fr": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "es": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "pt-BR": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."},
    "uk": {"name": "...", "synonyms": ["...","...","...","...","..."], "description": "...", "storage_tips": "..."}
  }
}`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");
  const inputTokens: number = data?.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data?.usage?.completion_tokens ?? 0;

  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

  const safeCategory = CATEGORIES.includes(parsed.category) ? parsed.category : (product.category ?? "other");

  const translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }> = {};
  APP_LANGUAGES.forEach((lang) => {
    const t = parsed.translations?.[lang] ?? {};
    translations[lang] = {
      name: t.name ?? parsed.canonical_name ?? product.canonical_name,
      synonyms: Array.isArray(t.synonyms) ? t.synonyms.filter(Boolean) : [],
      description: t.description ?? null,
      storage_tips: t.storage_tips ?? null,
    };
  });

  return {
    canonical_name: parsed.canonical_name ?? product.canonical_name,
    category: safeCategory,
    icon: parsed.icon ?? product.icon ?? "📦",
    preferred_unit: parsed.preferred_unit ?? product.preferred_unit ?? null,
    calories: asNum(parsed.calories),
    protein: asNum(parsed.protein),
    fat: asNum(parsed.fat),
    carbohydrates: asNum(parsed.carbohydrates),
    fiber: asNum(parsed.fiber),
    typical_serving: asNum(parsed.typical_serving),
    requires_expiry: typeof parsed.requires_expiry === "boolean" ? parsed.requires_expiry : (product.requires_expiry ?? false),
    default_shelf_life_days: asNum(parsed.default_shelf_life_days),
    seasonal_months: Array.isArray(parsed.seasonal_months) ? parsed.seasonal_months : [],
    description: parsed.description ?? null,
    storage_tips: parsed.storage_tips ?? null,
    synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms.filter(Boolean) : [],
    translations,
    inputTokens,
    outputTokens,
  };
}

// ── Apply: translations only (upsert, don't touch product_dictionary) ─────────

async function applyTranslations(productId: string, translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }>) {
  const rows = Object.entries(translations).map(([language_code, t]) => ({
    product_id: productId,
    language_code,
    name: t.name,
    synonyms: t.synonyms,
    description: t.description,
    storage_tips: t.storage_tips,
  }));

  const { error } = await supabaseAdmin
    .from("product_translations")
    .upsert(rows, { onConflict: "product_id,language_code" });

  if (error) throw new Error(error.message);
}

// ── Apply: full update (for pending/new products) ─────────────────────────────

async function applyFull(productId: string, data: Awaited<ReturnType<typeof callGPTTranslate>>) {
  const payload = {
    category: data.category,
    icon: data.icon,
    preferred_unit: data.preferred_unit,
    calories: data.calories,
    protein: data.protein,
    fat: data.fat,
    carbohydrates: data.carbohydrates,
    fiber: data.fiber,
    typical_serving: data.typical_serving,
    requires_expiry: data.requires_expiry,
    default_shelf_life_days: data.default_shelf_life_days,
    seasonal_months: data.seasonal_months,
    description: data.description,
    storage_tips: data.storage_tips,
    synonyms: data.synonyms,
    moderation_status: "manually_approved",
    needs_moderation: false,
    updated_at: new Date().toISOString(),
  };

  const { error: dictErr } = await supabaseAdmin
    .from("product_dictionary")
    .update({ canonical_name: data.canonical_name, ...payload })
    .eq("id", productId);

  if (dictErr) {
    if (dictErr.message.includes("product_dictionary_canonical_name_key")) {
      const { error: retry } = await supabaseAdmin.from("product_dictionary").update(payload).eq("id", productId);
      if (retry) throw new Error(retry.message);
    } else {
      throw new Error(dictErr.message);
    }
  }

  await applyTranslations(productId, data.translations);
}

// ── Process one product ───────────────────────────────────────────────────────

async function processOne(product: ProductRow, mode: string): Promise<ProcessResult> {
  const gpt = await callGPTTranslate(product);
  const changed = normalize(gpt.canonical_name) !== normalize(product.canonical_name);

  if (mode === "fix-translations" || mode === "fill-languages" || mode === "enrich-synonyms") {
    await applyTranslations(product.id, gpt.translations);
  } else {
    await applyFull(product.id, gpt);
  }

  return {
    productId: product.id,
    name: product.canonical_name,
    action: mode,
    changed,
    inputTokens: gpt.inputTokens,
    outputTokens: gpt.outputTokens,
  };
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const previewMode = searchParams.get("preview");

    if (previewMode) {
      const products = await fetchBatch(previewMode, 200);
      return NextResponse.json({
        success: true,
        mode: previewMode,
        count: products.length,
        products: products.map(p => ({ id: p.id, name: p.canonical_name, category: p.category, icon: p.icon ?? "📦" })),
      });
    }

    const stats = await getSmartStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(body.limit ?? 5, 1), 20);
    const dryRun = body.dryRun === true;
    let mode: string = body.mode ?? "auto";

    // Resolve auto mode
    if (mode === "auto") {
      const resolved = await getAutoMode();
      if (!resolved) {
        const stats = await getSmartStats();
        return NextResponse.json({ success: true, mode: "auto", resolved: null, processed: 0, remaining: 0, results: [], stats });
      }
      mode = resolved;
    }

    const products = await fetchBatch(mode, limit);

    if (products.length === 0) {
      const stats = await getSmartStats();
      return NextResponse.json({ success: true, mode, processed: 0, remaining: 0, results: [], stats });
    }

    const results = await Promise.all(
      products.map(async (product) => {
        try {
          if (!dryRun) return await processOne(product, mode);
          return { productId: product.id, name: product.canonical_name, action: mode, changed: false, inputTokens: 0, outputTokens: 0 };
        } catch (err) {
          return {
            productId: product.id,
            name: product.canonical_name,
            action: mode,
            changed: false,
            inputTokens: 0,
            outputTokens: 0,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    const totalIn  = results.reduce((s, r) => s + r.inputTokens, 0);
    const totalOut = results.reduce((s, r) => s + r.outputTokens, 0);
    const costUsd  = totalIn * PRICE_IN + totalOut * PRICE_OUT;

    const stats = await getSmartStats();

    return NextResponse.json({
      success: true,
      mode,
      dryRun,
      processed: results.length,
      errors: results.filter(r => r.error).length,
      remaining: stats.totalIssues,
      resolvedMode: mode,
      results,
      stats,
      usage: { inputTokens: totalIn, outputTokens: totalOut, costUsd },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
