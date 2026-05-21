import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APP_LANGUAGES, translateBatch } from "@/lib/translate";
import { normalize } from "@/lib/stringUtils";

export const maxDuration = 300;

const OPENAI_URL  = "https://api.openai.com/v1/chat/completions";
const NVIDIA_URL  = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "google/gemma-3n-e2b-it";

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
  savedRows?: number;
  translations?: Record<string, string>; // lang → name, for verification
};

// GPT-4o-mini pricing per token
const PRICE_IN  = 0.15  / 1_000_000; // $0.15 per 1M input tokens
const PRICE_OUT = 0.60  / 1_000_000; // $0.60 per 1M output tokens

type SmartStats = {
  total: number;
  badNames: number;
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

function hasBadName(name: string): boolean {
  if (/\p{Emoji_Presentation}/u.test(name)) return true;
  if (/[—–]\s*\d/.test(name)) return true;
  if (/[\d,\.]+\s*(кг|г\b|мл|л\b|килограмм|грамм|кило|kg\b|g\b|ml\b|l\b)/i.test(name)) return true;
  return false;
}

const asNum = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

// Fetch ALL translation rows using pagination (Supabase default max_rows=1000)
type TranslationRow = { product_id: string; language_code: string; name: string; synonyms: string[] | null };

async function fetchAllTranslations(): Promise<TranslationRow[]> {
  const PAGE = 1000;
  let from = 0;
  const all: TranslationRow[] = [];
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("product_translations")
      .select("product_id, language_code, name, synonyms")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...(data as TranslationRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function getSmartStats(): Promise<SmartStats> {
  const [
    { count: total },
    translations,
    pendingIdsRes,
    allIdsRes,
  ] = await Promise.all([
    supabaseAdmin.from("product_dictionary").select("*", { count: "exact", head: true }),
    fetchAllTranslations(),
    supabaseAdmin.from("product_dictionary").select("id").or("needs_moderation.eq.true,moderation_status.eq.pending"),
    supabaseAdmin.from("product_dictionary").select("id, canonical_name").limit(5000),
  ]);

  // Bad names: emoji, weight/quantity in canonical_name
  const badNameIds = new Set(
    (allIdsRes.data ?? []).filter(p => hasBadName((p as { id: string; canonical_name: string }).canonical_name)).map(p => p.id)
  );

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

  const badNames = badNameIds.size;
  const badTranslations = badTranslationIds.size;
  const missingLanguages = missingLangIds.size;
  const poorSynonyms = poorSynonymIds.size;
  const pendingModeration = pendingIds.size;

  // Unique products with at least one issue (avoids double-counting)
  const uniqueAffected = new Set([...badNameIds, ...badTranslationIds, ...missingLangIds, ...poorSynonymIds, ...pendingIds]);

  return {
    total: total ?? 0,
    badNames,
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

  const translations = await fetchAllTranslations();

  if (mode === "fix-names") {
    return (allProducts as ProductRow[]).filter(p => hasBadName(p.canonical_name)).slice(0, limit);
  }

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
  if (stats.badNames > 0) return "fix-names";
  if (stats.badTranslations > 0) return "fix-translations";
  if (stats.missingLanguages > 0) return "fill-languages";
  if (stats.pendingModeration > 0) return "pending";
  if (stats.poorSynonyms > 0) return "enrich-synonyms";
  return null;
}

// ── DeepL + AI hybrid batch ───────────────────────────────────────────────────

async function callDeepLBatch(
  product: ProductRow,
  synonymsProvider: "openai" | "nvidia" = "openai"
): Promise<{
  translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }>;
  inputTokens: number; outputTokens: number;
}> {
  const isNv = synonymsProvider === "nvidia";
  const apiKey = isNv ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`${isNv ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} not set`);

  // Step 1: DeepL — 8 language names in parallel
  const names = await Promise.all(
    APP_LANGUAGES.map(lang =>
      translateBatch([product.canonical_name], lang, "RU")
        .then(r => {
          const raw = r[0] ?? product.canonical_name;
          return { lang, name: raw.charAt(0).toUpperCase() + raw.slice(1) };
        })
        .catch(() => ({ lang, name: product.canonical_name }))
    )
  );
  const nameMap: Record<string, string> = Object.fromEntries(names.map(n => [n.lang, n.name]));

  // Step 2: AI — synonyms + description + storage_tips (short prompt)
  const translationsList = APP_LANGUAGES.map(l => `${l}: "${nameMap[l]}"`).join(", ");
  const prompt = `Ты генерируешь синонимы для продуктов кулинарного приложения.

Продукт: "${product.canonical_name}"
Переводы: ${translationsList}

Для каждого из 8 языков верни 5-8 синонимов: множественное число, региональные варианты, рыночные названия, разговорные формы.
Также добавь: description (1 предложение) и storage_tips (1 предложение) для каждого языка.

Верни ТОЛЬКО валидный JSON:
{
  "en": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "ru": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "de": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "it": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "fr": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "es": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "pt-BR": {"synonyms":["..."],"description":"...","storage_tips":"..."},
  "uk": {"synonyms":["..."],"description":"...","storage_tips":"..."}
}`;

  const res = await fetch(isNv ? NVIDIA_URL : OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: isNv ? NVIDIA_MODEL : "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: isNv ? 0.2 : 0.1,
      ...(isNv ? { max_tokens: 2048, top_p: 0.7 } : {}),
    }),
  });

  if (!res.ok) throw new Error(`${isNv ? "NVIDIA" : "OpenAI"} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const inputTokens: number = data?.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data?.usage?.completion_tokens ?? 0;

  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

  const translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }> = {};
  for (const lang of APP_LANGUAGES) {
    const g = parsed[lang] ?? {};
    translations[lang] = {
      name: nameMap[lang],
      synonyms: Array.isArray(g.synonyms) ? g.synonyms.filter(Boolean) : [],
      description: g.description ?? null,
      storage_tips: g.storage_tips ?? null,
    };
  }

  return { translations, inputTokens, outputTokens };
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

async function callGPTTranslate(product: ProductRow, provider: "openai" | "nvidia" = "openai", mode = "auto"): Promise<GPTResult> {
  const isNvidia = provider === "nvidia";
  const apiKey = isNvidia ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`${isNvidia ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} is not set`);

  const fixTranslationsWarning = mode === "fix-translations"
    ? `\n⚠️ КРИТИЧЕСКИ ВАЖНО: Переводы на EN, DE, IT, FR, ES, PT-BR содержат кириллицу — это ОШИБКА. Исправь их.\nПравило: EN/DE/IT/FR/ES/PT-BR ОБЯЗАТЕЛЬНО должны использовать ТОЛЬКО латинские буквы (a-z, A-Z).\nЕсли не знаешь точный перевод — используй описательный аналог или транслитерацию латиницей. НИКОГДА не оставляй кириллицу в этих языках.\n`
    : "";

  const prompt = `Ты нормализуешь и переводишь продукты для кулинарного приложения.
${fixTranslationsWarning}
Продукт: "${product.canonical_name}"
Категория: ${product.category ?? "неизвестна"}

ЗАДАЧА 1 — Верни чистое русское название (убери мусор, оставь суть).
КРИТИЧЕСКИ: НЕ заменяй специфический продукт на общий. "Соус цую" ≠ "Соевый соус". "Дижонская горчица" ≠ "Горчица".

ЗАДАЧА 2 — Категория из: ${CATEGORIES.join(", ")}. Иконка-эмодзи. Единица: g/kg/ml/l/pcs/null.

ЗАДАЧА 3 — Переводы на 8 языков (en, ru, de, it, fr, es, pt-BR, uk).
ВАЖНО: EN, DE, IT, FR, ES, PT-BR — ТОЛЬКО латиница! ru и uk — кириллица.
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

  const response = await fetch(isNvidia ? NVIDIA_URL : OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: isNvidia ? NVIDIA_MODEL : "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: isNvidia ? 0.2 : 0.1,
      max_tokens: isNvidia ? 4096 : undefined,
      top_p: isNvidia ? 0.7 : undefined,
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

// ── Apply: translations (delete + insert — avoids upsert constraint issues) ───

async function applyTranslations(
  productId: string,
  translations: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }>
): Promise<number> {
  const { error: delError, count: delCount } = await supabaseAdmin
    .from("product_translations")
    .delete()
    .eq("product_id", productId);

  if (delError) throw new Error(`Delete failed: ${delError.message}`);
  console.log(`[translations] DELETE ${productId}: removed ${delCount ?? "?"} rows`);

  const rows = Object.entries(translations).map(([language_code, t]) => ({
    product_id: productId,
    language_code,
    name: t.name,
    synonyms: t.synonyms,
    description: t.description,
    storage_tips: t.storage_tips,
  }));

  const { error, data } = await supabaseAdmin
    .from("product_translations")
    .insert(rows)
    .select("language_code, name");

  if (error) throw new Error(`Insert failed: ${error.message}`);
  const saved = data?.length ?? rows.length;
  console.log(`[translations] INSERT ${productId}: saved ${saved} rows — EN="${translations.en?.name}" DE="${translations.de?.name}"`);
  return saved;
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

  const saved = await applyTranslations(productId, data.translations);
  console.log(`[applyFull] ${productId} translations saved: ${saved} rows`);
}

// ── Fix-names: regex clean + duplicate check (no GPT needed) ─────────────────

function cleanName(name: string): string {
  return name
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/[—–-]\s*\d[\d,.]*/g, "")
    .replace(/\d[\d,.]*\s*(кг|г\b|мл|л\b|килограмм|грамм|кило|kg\b|g\b|ml\b|l\b)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function processFixName(product: ProductRow): Promise<ProcessResult> {
  const cleaned = cleanName(product.canonical_name);
  console.log(`[fix-names] "${product.canonical_name}" → "${cleaned}"`);

  if (cleaned === product.canonical_name) {
    return { productId: product.id, name: product.canonical_name, action: "fix-names", changed: false, inputTokens: 0, outputTokens: 0, error: "Имя уже чистое" };
  }

  // Check for duplicate
  const { data: dup } = await supabaseAdmin
    .from("product_dictionary")
    .select("id, canonical_name")
    .eq("canonical_name", cleaned)
    .neq("id", product.id)
    .maybeSingle();

  if (dup) {
    console.log(`[fix-names] DUPLICATE: "${cleaned}" already exists (${dup.id})`);
    return { productId: product.id, name: product.canonical_name, action: "fix-names", changed: false, inputTokens: 0, outputTokens: 0, error: `Дубликат: "${cleaned}" уже есть в базе` };
  }

  // Update canonical_name
  const { error: updErr } = await supabaseAdmin
    .from("product_dictionary")
    .update({ canonical_name: cleaned, updated_at: new Date().toISOString() })
    .eq("id", product.id);
  if (updErr) throw new Error(`Name update failed: ${updErr.message}`);

  // Regenerate translations with cleaned name via DeepL
  const updated = { ...product, canonical_name: cleaned };
  const { translations, inputTokens, outputTokens } = await callDeepLBatch(updated, "openai");
  const savedRows = await applyTranslations(product.id, translations);
  const translationNames = Object.fromEntries(Object.entries(translations).map(([l, t]) => [l, t.name]));
  console.log(`[fix-names] OK "${cleaned}" saved=${savedRows} EN="${translations.en?.name}"`);

  return { productId: product.id, name: cleaned, action: "fix-names", changed: true, inputTokens, outputTokens, savedRows, translations: translationNames };
}

// ── Process one product ───────────────────────────────────────────────────────

async function processOne(product: ProductRow, mode: string, provider: "openai" | "nvidia" | "deepl" | "deepl-nvidia" = "openai"): Promise<ProcessResult> {
  console.log(`[processOne] START "${product.canonical_name}" mode=${mode} provider=${provider}`);

  // fix-names: deterministic regex clean, no GPT, with duplicate detection
  if (mode === "fix-names") {
    return await processFixName(product);
  }

  // DeepL hybrid: accurate names via DeepL + AI for synonyms only
  if (provider === "deepl" || provider === "deepl-nvidia") {
    const synonymsProvider = provider === "deepl-nvidia" ? "nvidia" : "openai";
    const { translations, inputTokens, outputTokens } = await callDeepLBatch(product, synonymsProvider);
    const savedRows = await applyTranslations(product.id, translations);
    const translationNames = Object.fromEntries(Object.entries(translations).map(([l, t]) => [l, t.name]));
    console.log(`[processOne] DONE DeepL "${product.canonical_name}" saved=${savedRows} EN="${translations.en?.name}" DE="${translations.de?.name}"`);
    return { productId: product.id, name: product.canonical_name, action: mode, changed: false, inputTokens, outputTokens, savedRows, translations: translationNames };
  }

  const gpt = await callGPTTranslate(product, provider, mode);
  const changed = normalize(gpt.canonical_name) !== normalize(product.canonical_name);
  const translationNames = Object.fromEntries(Object.entries(gpt.translations).map(([l, t]) => [l, t.name]));

  let savedRows = 0;
  if (mode === "fix-translations" || mode === "fill-languages" || mode === "enrich-synonyms") {
    savedRows = await applyTranslations(product.id, gpt.translations);
  } else {
    await applyFull(product.id, gpt);
    savedRows = 8;
  }

  console.log(`[processOne] DONE GPT "${product.canonical_name}" → "${gpt.canonical_name}" saved=${savedRows} EN="${translationNames.en}" DE="${translationNames.de}"`);
  return { productId: product.id, name: product.canonical_name, action: mode, changed, inputTokens: gpt.inputTokens, outputTokens: gpt.outputTokens, savedRows, translations: translationNames };
}

function getModeRemaining(mode: string, stats: SmartStats): number {
  switch (mode) {
    case "fix-names":       return stats.badNames;
    case "fix-translations": return stats.badTranslations;
    case "fill-languages":  return stats.missingLanguages;
    case "pending":         return stats.pendingModeration;
    case "enrich-synonyms": return stats.poorSynonyms;
    default:                return stats.totalIssues;
  }
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

    const [stats, { count: translationRows }] = await Promise.all([
      getSmartStats(),
      supabaseAdmin.from("product_translations").select("*", { count: "exact", head: true }),
    ]);
    return NextResponse.json({ success: true, stats, debug: { translationRows } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(body.limit ?? 5, 1), 20);
    const dryRun = body.dryRun === true;
    const provider: "openai" | "nvidia" | "deepl" | "deepl-nvidia" =
      body.provider === "nvidia" ? "nvidia" :
      body.provider === "deepl" ? "deepl" :
      body.provider === "deepl-nvidia" ? "deepl-nvidia" : "openai";
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
          if (!dryRun) return await processOne(product, mode, provider);
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
      modeRemaining: getModeRemaining(mode, stats),
      resolvedMode: mode,
      results,
      stats,
      usage: { inputTokens: totalIn, outputTokens: totalOut, costUsd },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
