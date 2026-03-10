import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Add a synonym to the product
  if (body.add_synonym) {
    const synonym = String(body.add_synonym).trim().toLowerCase();
    if (!synonym) return NextResponse.json({ ok: false, error: "empty synonym" }, { status: 400 });

    const { data: product } = await supabaseAdmin
      .from("product_dictionary")
      .select("synonyms")
      .eq("id", id)
      .single();

    if (!product) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const existing: string[] = product.synonyms ?? [];
    if (existing.map((s: string) => s.toLowerCase()).includes(synonym)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({ synonyms: [...existing, synonym] })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, synonym });
  }

  // Approve product (clear needs_moderation flag)
  if (body.approve) {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({ needs_moderation: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown operation" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabaseAdmin
    .from("product_dictionary")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
