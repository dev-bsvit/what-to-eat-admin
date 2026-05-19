import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveLandingTable } from "@/lib/landingStorage";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  try {
    const { cuisineId } = await params;
    const landingTable = await resolveLandingTable();
    if (!landingTable) {
      return NextResponse.json({ error: "Landing table not found" }, { status: 404 });
    }

    const { data: landing, error } = await supabaseAdmin
      .from(landingTable)
      .select("translations")
      .eq("cuisine_id", cuisineId)
      .maybeSingle();

    if (error || !landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }

    const translations = landing.translations as Record<string, unknown> | null;
    if (!translations) {
      return NextResponse.json({ error: "No translations found — translate first" }, { status: 400 });
    }

    const nameRows = Object.entries(translations)
      .flatMap(([lang, t]) => {
        const title = (t as unknown as { hero?: { title?: string } })?.hero?.title;
        if (!title?.trim()) return [];
        return [{ cuisine_id: cuisineId, language_code: lang, name: title }];
      });

    if (nameRows.length === 0) {
      return NextResponse.json({ error: "No translated titles found in existing translations" }, { status: 400 });
    }

    const { error: upsertError } = await supabaseAdmin
      .from("cuisine_translations")
      .upsert(nameRows, { onConflict: "cuisine_id,language_code" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, synced: nameRows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
