/**
 * POST /api/admin/products/[id]/translate
 *
 * Translate a single product to all supported languages and save to product_translations.
 * Body: { source_language: "ru" }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  translateProductToAllLanguages,
  type ProductContent,
} from "@/lib/translate";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const body = await request.json();
    const sourceLang: string = body.source_language || "ru";

    // 1. Load product from DB
    const { data: product, error } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, description, storage_tips, synonyms")
      .eq("id", productId)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const content: ProductContent = {
      name: product.canonical_name,
      description: product.description ?? null,
      storage_tips: product.storage_tips ?? null,
      synonyms: Array.isArray(product.synonyms) ? product.synonyms : [],
    };

    // 2. Translate to all languages
    const allTranslations = await translateProductToAllLanguages(content, sourceLang);

    // 3. Upsert into product_translations
    const rows = Object.entries(allTranslations).map(([lang, t]) => ({
      product_id: productId,
      language_code: lang,
      name: t.name,
      synonyms: t.synonyms ?? null,
      description: t.description ?? null,
      storage_tips: t.storage_tips ?? null,
    }));

    const { error: upsertError } = await supabaseAdmin
      .from("product_translations")
      .upsert(rows, { onConflict: "product_id,language_code" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product_id: productId,
      languages: Object.keys(allTranslations),
      rows_saved: rows.length,
    });
  } catch (err) {
    console.error("[translate product]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
