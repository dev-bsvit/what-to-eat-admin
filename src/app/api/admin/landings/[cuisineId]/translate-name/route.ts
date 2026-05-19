import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { translateBatch, APP_LANGUAGES } from "@/lib/translate";
import { resolveLandingTable } from "@/lib/landingStorage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  try {
    const { cuisineId } = await params;
    const body = await request.json().catch(() => ({}));
    const sourceLang: string = body.source_language || "ru";

    const landingTable = await resolveLandingTable();
    if (!landingTable) {
      return NextResponse.json({ error: "Landing table not found" }, { status: 404 });
    }

    // Load landing to get hero.title and existing translations
    const { data: landing, error } = await supabaseAdmin
      .from(landingTable)
      .select("hero, translations")
      .eq("cuisine_id", cuisineId)
      .maybeSingle();

    if (error || !landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }

    const sourceName = (landing.hero as Record<string, unknown>)?.title as string;
    if (!sourceName?.trim()) {
      return NextResponse.json({ error: "hero.title is empty" }, { status: 400 });
    }

    // Translate name to all other languages in parallel (one DeepL call per lang)
    const targets = APP_LANGUAGES.filter((l) => l !== sourceLang);
    const nameByLang: Record<string, string> = { [sourceLang]: sourceName };
    await Promise.all(
      targets.map(async (lang) => {
        const [result] = await translateBatch([sourceName], lang, sourceLang);
        nameByLang[lang] = result;
      })
    );

    // Merge translated names into existing translations
    const existing = (landing.translations as Record<string, unknown>) ?? {};
    const updatedTranslations: Record<string, unknown> = { ...existing };
    for (const [lang, name] of Object.entries(nameByLang)) {
      const langTx = (updatedTranslations[lang] as Record<string, unknown>) ?? {};
      updatedTranslations[lang] = {
        ...langTx,
        hero: { ...(langTx.hero as Record<string, unknown> ?? {}), title: name },
        preview_card: { ...(langTx.preview_card as Record<string, unknown> ?? {}), title: name },
      };
    }

    // Save updated translations back to landing
    const { error: saveError } = await supabaseAdmin
      .from(landingTable)
      .update({ translations: updatedTranslations, updated_at: new Date().toISOString() })
      .eq("cuisine_id", cuisineId);

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    // Sync to cuisine_translations
    const nameRows = Object.entries(nameByLang)
      .filter(([lang]) => lang !== sourceLang)
      .map(([lang, name]) => ({ cuisine_id: cuisineId, language_code: lang, name }));

    if (nameRows.length > 0) {
      const { error: syncError } = await supabaseAdmin
        .from("cuisine_translations")
        .upsert(nameRows, { onConflict: "cuisine_id,language_code" });
      if (syncError) {
        console.warn("[translate-name] cuisine_translations sync failed:", syncError.message);
      }
    }

    return NextResponse.json({
      success: true,
      source_name: sourceName,
      name_by_lang: nameByLang,
      full_translations: updatedTranslations,
      synced: nameRows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
