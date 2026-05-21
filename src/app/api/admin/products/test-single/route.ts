import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APP_LANGUAGES, translateBatch } from "@/lib/translate";
import { normalize } from "@/lib/stringUtils";

export const maxDuration = 120;

const OPENAI_URL  = "https://api.openai.com/v1/chat/completions";
const NVIDIA_URL  = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "google/gemma-3n-e2b-it";
const PRICE_IN  = 0.15  / 1_000_000;
const PRICE_OUT = 0.60  / 1_000_000;

const CATEGORIES = [
  "grains", "meat", "dairy", "vegetables", "fruits",
  "bakery", "fish", "frozen", "drinks", "spices",
  "canned", "snacks", "other",
] as const;

const LATIN_LANGUAGES = ["en", "de", "it", "fr", "es", "pt-BR"];

function hasCyrillic(s: string) { return /[Ѐ-ӿ]/.test(s); }
const asNum = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

// ── GET: search or load product with translations ─────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const productId = searchParams.get("productId");

  if (q) {
    const { data } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, category, icon")
      .ilike("canonical_name", `%${q}%`)
      .order("usage_count", { ascending: false, nullsFirst: false })
      .limit(12);
    return NextResponse.json({ products: data ?? [] });
  }

  if (productId) {
    const [productRes, transRes] = await Promise.all([
      supabaseAdmin.from("product_dictionary").select("*").eq("id", productId).single(),
      supabaseAdmin.from("product_translations").select("*").eq("product_id", productId),
    ]);
    if (!productRes.data) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const before: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }> = {};
    for (const t of transRes.data ?? []) {
      before[t.language_code] = { name: t.name, synonyms: t.synonyms ?? [], description: t.description ?? null, storage_tips: t.storage_tips ?? null };
    }
    return NextResponse.json({ product: productRes.data, before });
  }

  return NextResponse.json({ error: "Provide ?q= or ?productId=" }, { status: 400 });
}

// ── DeepL + AI hybrid (GPT or NVIDIA for synonyms) ───────────────────────────

type TranslationMap = Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }>;

async function callDeepLHybrid(
  canonicalName: string,
  existingTranslations: TranslationMap,
  synonymsProvider: "openai" | "nvidia" = "openai"
): Promise<{ translations: TranslationMap; inputTokens: number; outputTokens: number; timeTaken: number }> {
  const startMs = Date.now();
  const isNv = synonymsProvider === "nvidia";
  const apiKey = isNv ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`${isNv ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} is not set`);

  // Step 1: DeepL — translate name to all 8 languages in parallel
  const names = await Promise.all(
    APP_LANGUAGES.map(lang =>
      translateBatch([canonicalName], lang, "RU")
        .then(r => ({ lang, name: r[0] ?? canonicalName }))
        .catch(() => ({ lang, name: existingTranslations[lang]?.name ?? canonicalName }))
    )
  );
  const nameMap: Record<string, string> = Object.fromEntries(names.map(n => [n.lang, n.name]));

  // Step 2: AI model — synonyms, description, storage_tips only (short prompt)
  const translationsList = APP_LANGUAGES.map(l => `${l}: "${nameMap[l]}"`).join(", ");

  const prompt = `Ты генерируешь синонимы для продуктов кулинарного приложения.

Продукт: "${canonicalName}"
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

  const translations: TranslationMap = {};
  for (const lang of APP_LANGUAGES) {
    const g = parsed[lang] ?? {};
    translations[lang] = {
      name: nameMap[lang],
      synonyms: Array.isArray(g.synonyms) ? g.synonyms.filter(Boolean) : [],
      description: g.description ?? null,
      storage_tips: g.storage_tips ?? null,
    };
  }

  return { translations, inputTokens, outputTokens, timeTaken: Date.now() - startMs };
}

// ── POST: run model on single product ─────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productId, provider = "openai", apply = false, translations: precomputed } = body as {
      productId: string; provider: "openai" | "nvidia" | "deepl" | "deepl-nvidia"; apply: boolean; translations?: TranslationMap;
    };

    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

    // ── Fast-apply: save pre-computed translations without re-running the model ─
    if (apply && precomputed) {
      const { error: delErr } = await supabaseAdmin.from("product_translations").delete().eq("product_id", productId);
      if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
      const rows = Object.entries(precomputed).map(([language_code, t]) => ({ product_id: productId, language_code, ...t }));
      const { error: insErr } = await supabaseAdmin.from("product_translations").insert(rows);
      if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
      return NextResponse.json({ applied: true, after: precomputed });
    }

    const [productRes, transRes] = await Promise.all([
      supabaseAdmin.from("product_dictionary").select("*").eq("id", productId).single(),
      supabaseAdmin.from("product_translations").select("*").eq("product_id", productId),
    ]);
    if (!productRes.data) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const product = productRes.data;

    const before: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }> = {};
    for (const t of transRes.data ?? []) {
      before[t.language_code] = { name: t.name, synonyms: t.synonyms ?? [], description: t.description ?? null, storage_tips: t.storage_tips ?? null };
    }

    // Detect issues for context
    const issues: string[] = [];
    for (const [lang, t] of Object.entries(before)) {
      if (LATIN_LANGUAGES.includes(lang) && hasCyrillic(t.name)) issues.push(`${lang}: кириллица`);
    }
    const missingLangs = (APP_LANGUAGES as readonly string[]).filter(l => !before[l]);
    if (missingLangs.length > 0) issues.push(`нет языков: ${missingLangs.join(", ")}`);

    // ── DeepL hybrid branch ───────────────────────────────────────────────────
    if (provider === "deepl" || provider === "deepl-nvidia") {
      const synonymsProvider = provider === "deepl-nvidia" ? "nvidia" : "openai";
      const { translations: after, inputTokens, outputTokens, timeTaken } = await callDeepLHybrid(product.canonical_name, before, synonymsProvider);

      if (apply) {
        const { error: delErr } = await supabaseAdmin.from("product_translations").delete().eq("product_id", productId);
        if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
        const rows = Object.entries(after).map(([language_code, t]) => ({ product_id: productId, language_code, ...t }));
        const { error: insErr } = await supabaseAdmin.from("product_translations").insert(rows);
        if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
      }

      return NextResponse.json({
        product: { id: product.id, name: product.canonical_name, canonicalAfter: product.canonical_name },
        before,
        after,
        inputTokens,
        outputTokens,
        costUsd: inputTokens * PRICE_IN + outputTokens * PRICE_OUT,
        timeTaken,
        applied: apply,
        issues,
      });
    }

    const isNvidia = provider === "nvidia";
    const apiKey = isNvidia ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: `${isNvidia ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} not set` }, { status: 500 });

    const latinWarning = issues.some(i => i.includes("кириллица"))
      ? "\n⚠️ EN/DE/IT/FR/ES/PT-BR ОБЯЗАТЕЛЬНО только латиница (a-z). Если не знаешь точный перевод — используй транслитерацию латиницей или описательный аналог.\n"
      : "";

    const prompt = `Ты нормализуешь и переводишь продукты для кулинарного приложения.
${latinWarning}
Продукт: "${product.canonical_name}"
Категория: ${product.category ?? "неизвестна"}
${issues.length ? `Проблемы с текущими переводами: ${issues.join("; ")}` : ""}

ЗАДАЧА — Верни переводы на 8 языков (en, ru, de, it, fr, es, pt-BR, uk).
Для каждого языка:
• name: нативное название на ЭТОМ языке
• synonyms: 5-8 синонимов (множественное число, региональные варианты, рыночные названия, разговорные формы)
• description: 1 предложение
• storage_tips: 1 предложение
ВАЖНО: EN, DE, IT, FR, ES, PT-BR — ТОЛЬКО латиница! ru и uk — кириллица.

Верни ТОЛЬКО валидный JSON:
{
  "canonical_name": "...",
  "category": "${product.category ?? "other"}",
  "icon": "${product.icon ?? "📦"}",
  "preferred_unit": ${product.preferred_unit ? `"${product.preferred_unit}"` : "null"},
  "calories": ${product.calories ?? "null"}, "protein": ${product.protein ?? "null"}, "fat": ${product.fat ?? "null"}, "carbohydrates": ${product.carbohydrates ?? "null"}, "fiber": ${product.fiber ?? "null"},
  "typical_serving": ${product.typical_serving ?? "null"},
  "requires_expiry": ${product.requires_expiry ?? "false"},
  "default_shelf_life_days": ${product.default_shelf_life_days ?? "null"},
  "seasonal_months": [],
  "description": "...", "storage_tips": "...", "synonyms": ["..."],
  "translations": {
    "en": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "ru": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "de": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "it": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "fr": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "es": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "pt-BR": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."},
    "uk": {"name":"...","synonyms":["..."],"description":"...","storage_tips":"..."}
  }
}`;

    const startMs = Date.now();

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

    if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const inputTokens: number = data?.usage?.prompt_tokens ?? 0;
    const outputTokens: number = data?.usage?.completion_tokens ?? 0;
    const timeTaken = Date.now() - startMs;

    if (!content) throw new Error("Empty response from model");

    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

    const after: Record<string, { name: string; synonyms: string[]; description: string | null; storage_tips: string | null }> = {};
    const safeCategory = CATEGORIES.includes(parsed.category) ? parsed.category : (product.category ?? "other");

    for (const lang of APP_LANGUAGES) {
      const t = parsed.translations?.[lang] ?? {};
      after[lang] = {
        name: t.name ?? parsed.canonical_name ?? product.canonical_name,
        synonyms: Array.isArray(t.synonyms) ? t.synonyms.filter(Boolean) : [],
        description: t.description ?? null,
        storage_tips: t.storage_tips ?? null,
      };
    }

    if (apply) {
      const { error: delErr } = await supabaseAdmin.from("product_translations").delete().eq("product_id", productId);
      if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
      const rows = Object.entries(after).map(([language_code, t]) => ({ product_id: productId, language_code, ...t }));
      const { error: insErr } = await supabaseAdmin.from("product_translations").insert(rows);
      if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

      await supabaseAdmin.from("product_dictionary").update({
        category: safeCategory,
        icon: parsed.icon ?? product.icon ?? "📦",
        canonical_name: normalize(parsed.canonical_name ?? product.canonical_name),
        calories: asNum(parsed.calories), protein: asNum(parsed.protein),
        fat: asNum(parsed.fat), carbohydrates: asNum(parsed.carbohydrates),
        updated_at: new Date().toISOString(),
      }).eq("id", productId);
    }

    return NextResponse.json({
      product: { id: product.id, name: product.canonical_name, canonicalAfter: parsed.canonical_name },
      before,
      after,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * PRICE_IN + outputTokens * PRICE_OUT,
      timeTaken,
      applied: apply,
      issues,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
