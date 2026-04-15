import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  const { cuisineId } = await params;
  const { data, error } = await supabaseAdmin
    .from("catalog_landings")
    .select("*")
    .eq("cuisine_id", cuisineId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  try {
    const { cuisineId } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {
      cuisine_id: cuisineId,
      preview_card: body.preview_card ?? {},
      hero: body.hero ?? {},
      inside_section: body.inside_section ?? null,
      recipe_showcase: body.recipe_showcase ?? null,
      audience_section: body.audience_section ?? null,
      transformation_section: body.transformation_section ?? null,
      benefits_section: body.benefits_section ?? null,
      faq_items: body.faq_items ?? [],
      purchase_cta: body.purchase_cta ?? null,
      theme: body.theme ?? {},
      recipe_preview_ids: body.recipe_preview_ids ?? [],
      is_published: body.is_published ?? false,
      sort_order: body.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    };

    // Include translations if provided (e.g. after AI generation)
    if (body.translations !== undefined) {
      payload.translations = body.translations;
    }

    const { data, error } = await supabaseAdmin
      .from("catalog_landings")
      .upsert(payload, { onConflict: "cuisine_id" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  const { cuisineId } = await params;
  const { error } = await supabaseAdmin
    .from("catalog_landings")
    .delete()
    .eq("cuisine_id", cuisineId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
