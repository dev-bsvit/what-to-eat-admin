/**
 * POST /api/admin/products/translate-batch
 *
 * Translate all products that are missing translations for one or more languages.
 * Processes products in batches to stay within DeepL rate limits.
 *
 * Body: {
 *   source_language?: string   // default: "ru"
 *   limit?: number             // max products to process, default 50
 *   product_ids?: string[]     // if set, only translate these products
 * }
 *
 * Returns: { processed: number, skipped: number, errors: string[] }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  translateProductToAllLanguages,
  APP_LANGUAGES,
  type ProductContent,
} from "@/lib/translate";

const BATCH_SIZE = 10; // products translated concurrently

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceLang: string = body.source_language || "ru";
    const limit: number = Math.min(body.limit ?? 50, 200);
    const explicitIds: string[] | undefined = Array.isArray(body.product_ids)
      ? body.product_ids
      : undefined;

    if (!process.env.DEEPL_API_KEY) {
      return NextResponse.json({ error: "DEEPL_API_KEY is not set" }, { status: 500 });
    }

    // ── 1. Find products that need translations ────────────────────────────
    let productQuery = supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, description, storage_tips, synonyms")
      .limit(limit);

    if (explicitIds?.length) {
      productQuery = productQuery.in("id", explicitIds);
    }

    const { data: allProducts, error: productsError } = await productQuery;
    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }
    if (!allProducts?.length) {
      return NextResponse.json({ processed: 0, skipped: 0, errors: [] });
    }

    // ── 2. Find which products already have ALL languages translated ───────
    const { data: existingTranslations } = await supabaseAdmin
      .from("product_translations")
      .select("product_id, language_code")
      .in("product_id", allProducts.map((p) => p.id));

    const translatedMap = new Map<string, Set<string>>();
    existingTranslations?.forEach(({ product_id, language_code }) => {
      if (!translatedMap.has(product_id)) translatedMap.set(product_id, new Set());
      translatedMap.get(product_id)!.add(language_code);
    });

    const products = allProducts.filter((p) => {
      const langs = translatedMap.get(p.id);
      // Keep if missing ANY language
      return !langs || APP_LANGUAGES.some((l) => !langs.has(l));
    });

    if (!products.length) {
      return NextResponse.json({
        processed: 0,
        skipped: allProducts.length,
        errors: [],
        message: "All products already have complete translations",
      });
    }

    // ── 3. Translate in batches ────────────────────────────────────────────
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (product) => {
          try {
            const existingLangs = translatedMap.get(product.id) ?? new Set<string>();

            const content: ProductContent = {
              name: product.canonical_name,
              description: product.description,
              storage_tips: product.storage_tips,
              synonyms: product.synonyms ?? [],
            };

            const allTranslations = await translateProductToAllLanguages(content, sourceLang);

            // Only upsert languages that are missing
            const rows = Object.entries(allTranslations)
              .filter(([lang]) => !existingLangs.has(lang))
              .map(([lang, t]) => ({
                product_id: product.id,
                language_code: lang,
                name: t.name,
                synonyms: t.synonyms ?? [],
                description: t.description ?? null,
                storage_tips: t.storage_tips ?? null,
              }));

            if (rows.length) {
              const { error } = await supabaseAdmin
                .from("product_translations")
                .upsert(rows, { onConflict: "product_id,language_code" });

              if (error) throw new Error(error.message);
            }

            processed++;
          } catch (err) {
            const msg = `${product.canonical_name}: ${err instanceof Error ? err.message : String(err)}`;
            errors.push(msg);
            console.error("[translate-batch]", msg);
          }
        })
      );
    }

    return NextResponse.json({
      processed,
      skipped: allProducts.length - products.length,
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
