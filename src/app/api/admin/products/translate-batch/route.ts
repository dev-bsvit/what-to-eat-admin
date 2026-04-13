/**
 * POST /api/admin/products/translate-batch
 *
 * Translate all products efficiently:
 * - ONE DeepL request per language (all product names batched together)
 * - Total: 7 sequential requests for 7 languages
 * - No rate limit issues
 *
 * Body: {
 *   source_language?: string   // default: "ru"
 *   limit?: number             // max products, default 200
 *   product_ids?: string[]     // if set, only these products
 * }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { translateBatch, APP_LANGUAGES } from "@/lib/translate";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceLang: string = body.source_language || "ru";
    const limit: number = Math.min(body.limit ?? 200, 500);
    const explicitIds: string[] | undefined = Array.isArray(body.product_ids)
      ? body.product_ids
      : undefined;

    if (!process.env.DEEPL_API_KEY) {
      return NextResponse.json({ error: "DEEPL_API_KEY is not set" }, { status: 500 });
    }

    // ── 1. Load products ───────────────────────────────────────────────────
    let productQuery = supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, description, storage_tips, synonyms")
      .limit(limit);

    if (explicitIds?.length) {
      productQuery = productQuery.in("id", explicitIds);
    }

    const { data: allProducts, error: productsError } = await productQuery;
    if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });
    if (!allProducts?.length) return NextResponse.json({ processed: 0, skipped: 0, errors: [] });

    // ── 2. Find which products already have all languages ──────────────────
    const { data: existing } = await supabaseAdmin
      .from("product_translations")
      .select("product_id, language_code")
      .in("product_id", allProducts.map((p) => p.id));

    const translatedMap = new Map<string, Set<string>>();
    existing?.forEach(({ product_id, language_code }) => {
      if (!translatedMap.has(product_id)) translatedMap.set(product_id, new Set());
      translatedMap.get(product_id)!.add(language_code);
    });

    // Only process products missing at least one language
    const products = allProducts.filter((p) => {
      const langs = translatedMap.get(p.id);
      return !langs || APP_LANGUAGES.some((l) => !langs.has(l));
    });

    if (!products.length) {
      return NextResponse.json({
        processed: 0,
        skipped: allProducts.length,
        errors: [],
        message: "All products already translated",
      });
    }

    // ── 3. One request per language for ALL products ───────────────────────
    // Build texts array: just product names (descriptions are optional, skip for now)
    const names = products.map((p) => p.canonical_name);
    const targetLangs = APP_LANGUAGES.filter((l) => l !== sourceLang);

    // Map: lang → translated names array (parallel requests per language)
    const translationsByLang = new Map<string, string[]>();

    // Sequential to be safe with free tier
    for (const lang of targetLangs) {
      try {
        const translated = await translateBatch(names, lang, sourceLang);
        translationsByLang.set(lang, translated);
      } catch (err) {
        console.error(`[translate-batch] Failed for lang ${lang}:`, err);
        // Continue with other languages
      }
    }

    // ── 4. Build and upsert all rows ───────────────────────────────────────
    const rows: Array<{
      product_id: string;
      language_code: string;
      name: string;
      synonyms: string[];
      description: null;
      storage_tips: null;
    }> = [];

    products.forEach((product, index) => {
      const existingLangs = translatedMap.get(product.id) ?? new Set<string>();

      // Source language row
      if (!existingLangs.has(sourceLang)) {
        rows.push({
          product_id: product.id,
          language_code: sourceLang,
          name: product.canonical_name,
          synonyms: product.synonyms ?? [],
          description: null,
          storage_tips: null,
        });
      }

      // Translated languages
      for (const lang of targetLangs) {
        if (existingLangs.has(lang)) continue;
        const translatedName = translationsByLang.get(lang)?.[index];
        if (!translatedName) continue;

        rows.push({
          product_id: product.id,
          language_code: lang,
          name: translatedName,
          synonyms: [],
          description: null,
          storage_tips: null,
        });
      }
    });

    // Upsert in chunks of 100
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabaseAdmin
        .from("product_translations")
        .upsert(chunk, { onConflict: "product_id,language_code" });
      if (error) errors.push(error.message);
    }

    return NextResponse.json({
      processed: products.length,
      skipped: allProducts.length - products.length,
      rows_saved: rows.length,
      errors,
      total_products: allProducts.length,
    });
  } catch (err) {
    console.error("[translate-batch]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
