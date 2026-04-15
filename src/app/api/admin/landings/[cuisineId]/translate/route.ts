/**
 * POST /api/admin/landings/[cuisineId]/translate
 *
 * Translate a catalog landing to all 7 other app languages via DeepL.
 * Reads the landing from DB, translates, saves translations back into
 * the `translations` JSONB column.
 *
 * Body: { source_language: "ru" }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { translateLandingToAllLanguages } from "@/lib/translate";
import {
  isLandingTableMissingError,
  LANDING_TABLE_MISSING_WARNING,
} from "@/lib/landingErrors";
import { resolveLandingTable } from "@/lib/landingStorage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  try {
    const { cuisineId } = await params;
    const body = await request.json();
    const sourceLang: string = body.source_language || "ru";
    const landingTable = await resolveLandingTable();

    if (!landingTable) {
      return NextResponse.json({
        success: false,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }

    // ── 1. Load landing ────────────────────────────────────────────────────
    const { data: landing, error } = await supabaseAdmin
      .from(landingTable)
      .select("*")
      .eq("cuisine_id", cuisineId)
      .maybeSingle();

    if (error && isLandingTableMissingError(error)) {
      return NextResponse.json({
        success: false,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }

    if (error || !landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }

    // ── 2. Translate to all languages ──────────────────────────────────────
    const allTranslations = await translateLandingToAllLanguages(
      landing as Record<string, unknown>,
      sourceLang
    );

    // ── 3. Save translations back to DB ───────────────────────────────────
    const { error: saveError } = await supabaseAdmin
      .from(landingTable)
      .update({
        translations: allTranslations,
        updated_at: new Date().toISOString(),
      })
      .eq("cuisine_id", cuisineId);

    if (saveError && isLandingTableMissingError(saveError)) {
      return NextResponse.json({
        success: false,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cuisine_id: cuisineId,
      source_language: sourceLang,
      languages_translated: Object.keys(allTranslations).filter((l) => l !== sourceLang),
    });
  } catch (err) {
    console.error("[translate landing]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
