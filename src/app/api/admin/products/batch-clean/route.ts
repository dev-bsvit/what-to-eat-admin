import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APP_LANGUAGES } from "@/lib/translate";
import { normalize } from "@/lib/stringUtils";

export const maxDuration = 300;

const OPENAI_URL = "https://api.openai.com/v1/responses";

const CATEGORIES = [
  "grains", "meat", "dairy", "vegetables", "fruits",
  "bakery", "fish", "frozen", "drinks", "spices",
  "canned", "snacks", "other",
] as const;

// Words that indicate a dirty product name — not part of the product identity
// NOTE: no `g` flag — module-level regexes with `g` retain lastIndex between calls
const DIRTY_PATTERNS = [
  /для\s+подачи/i,
  /для\s+жарки/i,
  /для\s+варки/i,
  /для\s+заправки/i,
  /по\s+вкусу/i,
  /по\s+желанию/i,
  /необязательно/i,
  /по\s+необходимости/i,
  /\(.*?\)/,
  /\d+\s*(г|кг|мл|л|шт|штук|грамм|граммов)\b/i,
];

function isDirty(name: string): boolean {
  return DIRTY_PATTERNS.some((p) => p.test(name));
}

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
};

type CleanResult = {
  productId: string;
  originalName: string;
  cleanName: string;
  changed: boolean;
  error?: string;
};

// ── Stats query ───────────────────────────────────────────────────────────────

async function getStats() {
  // Count products missing English translation (proxy for "needs processing")
  const { count: total } = await supabaseAdmin
    .from("product_dictionary")
    .select("*", { count: "exact", head: true });

  const { data: translated } = await supabaseAdmin
    .from("product_translations")
    .select("product_id")
    .eq("language_code", "en");

  const translatedIds = new Set((translated ?? []).map((r) => r.product_id));

  const { data: allProducts } = await supabaseAdmin
    .from("product_dictionary")
    .select("id, canonical_name, moderation_status");

  const needsTranslation = (allProducts ?? []).filter(
    (p) => !translatedIds.has(p.id)
  ).length;

  const needsNormalization = (allProducts ?? []).filter(
    (p) => isDirty(p.canonical_name)
  ).length;

  return {
    total: total ?? 0,
    needsTranslation,
    needsNormalization,
    needsProcessing: (allProducts ?? []).filter((p) => {
      const hasTranslation = translatedIds.has(p.id);
      if (hasTranslation && p.moderation_status === "manually_approved") return false;
      return !hasTranslation || isDirty(p.canonical_name);
    }).length,
  };
}

// ── Fetch batch to process ────────────────────────────────────────────────────

async function fetchBatch(limit: number): Promise<ProductRow[]> {
  const { data: allProducts } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .order("usage_count", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (!allProducts?.length) return [];

  // Fetch without .in() filter — avoids URL length limits with large product sets
  const { data: translated } = await supabaseAdmin
    .from("product_translations")
    .select("product_id")
    .eq("language_code", "en")
    .limit(5000);

  const translatedIds = new Set((translated ?? []).map((r) => r.product_id));

  const needsWork = (allProducts as ProductRow[]).filter((p) => {
    const hasTranslation = translatedIds.has(p.id);
    // Already processed (approved + has translations) — skip even if name is still dirty
    if (hasTranslation && p.moderation_status === "manually_approved") return false;
    return isDirty(p.canonical_name) || !hasTranslation;
  });

  return needsWork.slice(0, limit);
}

// ── AI: normalize + translate ─────────────────────────────────────────────────

async function cleanAndTranslate(product: ProductRow): Promise<{
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
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const prompt = `Ты нормализуешь и переводишь продукты для кулинарного приложения.

Входные данные продукта:
- Название: "${product.canonical_name}"
- Категория: ${product.category ?? "неизвестна"}
- Иконка: ${product.icon ?? "нет"}
- Синонимы: ${(product.synonyms ?? []).join(", ") || "нет"}
- Калории: ${product.calories ?? "нет"}

ЗАДАЧА 1 — Очисти название продукта:
• Убери всё что не является частью имени продукта:
  - заметки о подаче: "для подачи", "для украшения", "для подачи к столу"
  - состояние: "варёный", "жареный", "очищенный", "нарезанный" (если не ключевое)
  - необязательность: "необязательно", "по желанию", "по вкусу", "по необходимости"
  - количества и единицы: "400 грамм", "1 штука", "500 мл"
  - скобки и уточнения в скобках
• Если название на иностранном языке — определи что это за продукт и дай правильное русское имя
  Примеры: "Uova" → "Яйцо", "Nori" → "Нори", "Soy Sauce" → "Соевый соус"
• Результат — чистое минимальное название продукта на русском

ЗАДАЧА 2 — Определи:
• Правильную категорию из: ${CATEGORIES.join(", ")}
• Подходящую иконку-эмодзи
• Единицу измерения: g/kg/ml/l/pcs или null

ЗАДАЧА 3 — Переводы на все 8 языков (en, ru, de, it, fr, es, pt-BR, uk):
• Для каждого языка: нативное название + 3-5 синонимов для поиска
• Описание: 1 предложение что это за продукт
• Советы по хранению: 1 предложение

ЗАДАЧА 4 — КБЖУ на 100г продукта:
• Только если уверен (стандартные продукты)
• Если не уверен — null

Верни ТОЛЬКО валидный JSON без markdown:
{
  "canonical_name": "Русское название",
  "category": "vegetables",
  "icon": "🥬",
  "preferred_unit": "g",
  "calories": 25,
  "protein": 1.5,
  "fat": 0.3,
  "carbohydrates": 4.0,
  "fiber": 1.2,
  "typical_serving": 100,
  "requires_expiry": true,
  "default_shelf_life_days": 7,
  "seasonal_months": [],
  "description": "Описание.",
  "storage_tips": "Совет.",
  "synonyms": ["синоним 1", "синоним 2"],
  "translations": {
    "en": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "ru": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "de": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "it": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "fr": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "es": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "pt-BR": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
    "uk": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."}
  }
}`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", input: prompt, temperature: 0.1 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.output?.[0]?.content?.[0]?.text;
  if (!content) throw new Error("Empty response from AI");

  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

  // Sanitize
  const category = parsed.category;
  const safeCategory = CATEGORIES.includes(category) ? category : (product.category ?? "other");

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

  const asNum = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

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
  };
}

// ── Apply clean data to DB ────────────────────────────────────────────────────

async function applyCleanData(productId: string, data: Awaited<ReturnType<typeof cleanAndTranslate>>) {
  const basePayload = {
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
    .update({ canonical_name: data.canonical_name, ...basePayload })
    .eq("id", productId);

  if (dictErr) {
    if (dictErr.message.includes("product_dictionary_canonical_name_key")) {
      // Clean name already exists as another product — save everything except canonical_name
      const { error: retryErr } = await supabaseAdmin
        .from("product_dictionary")
        .update(basePayload)
        .eq("id", productId);
      if (retryErr) throw new Error(retryErr.message);
    } else {
      throw new Error(dictErr.message);
    }
  }

  const rows = Object.entries(data.translations).map(([language_code, t]) => ({
    product_id: productId,
    language_code,
    name: t.name,
    synonyms: t.synonyms,
    description: t.description,
    storage_tips: t.storage_tips,
  }));

  const { error: transErr } = await supabaseAdmin
    .from("product_translations")
    .upsert(rows, { onConflict: "product_id,language_code" });

  if (transErr) throw new Error(transErr.message);
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);
    const dryRun = body.dryRun === true;

    const products = await fetchBatch(limit);

    if (products.length === 0) {
      const stats = await getStats();
      return NextResponse.json({ success: true, processed: 0, remaining: stats.needsProcessing, results: [], stats });
    }

    const results: CleanResult[] = [];

    for (const product of products) {
      try {
        const clean = await cleanAndTranslate(product);
        const changed = normalize(clean.canonical_name) !== normalize(product.canonical_name);

        if (!dryRun) {
          await applyCleanData(product.id, clean);
        }

        results.push({
          productId: product.id,
          originalName: product.canonical_name,
          cleanName: clean.canonical_name,
          changed,
        });
      } catch (err) {
        results.push({
          productId: product.id,
          originalName: product.canonical_name,
          cleanName: product.canonical_name,
          changed: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const stats = await getStats();

    return NextResponse.json({
      success: true,
      dryRun,
      processed: results.length,
      changed: results.filter((r) => r.changed).length,
      errors: results.filter((r) => r.error).length,
      remaining: stats.needsProcessing,
      results,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
