import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isLandingTableMissingError,
  LANDING_TABLE_MISSING_WARNING,
} from "@/lib/landingErrors";
import { resolveLandingTable } from "@/lib/landingStorage";

// Fix invalid UUIDs (e.g. "4xxx" placeholder from AI-generated content) by replacing them with real UUIDs.
// Swift UUID decoder is strict — any malformed UUID causes the entire record to fail decoding.
const INVALID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fixUuids(obj: unknown): unknown {
  if (typeof obj === "string") {
    // Check if it looks like a UUID but contains non-hex chars
    if (obj.length === 36 && obj.includes("-") && !INVALID_UUID_RE.test(obj)) {
      return crypto.randomUUID();
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(fixUuids);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, fixUuids(v)]));
  }
  return obj;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  const { cuisineId } = await params;
  const landingTable = await resolveLandingTable();
  if (!landingTable) {
    return NextResponse.json({
      data: null,
      warning: LANDING_TABLE_MISSING_WARNING,
      message: "Таблица catalog_landings отсутствует в текущей БД.",
    });
  }

  const { data, error } = await supabaseAdmin
    .from(landingTable)
    .select("*")
    .eq("cuisine_id", cuisineId)
    .maybeSingle();

  if (error) {
    if (isLandingTableMissingError(error)) {
      return NextResponse.json({
        data: null,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cuisineId: string }> }
) {
  try {
    const { cuisineId } = await params;
    const body = await request.json();
    const landingTable = await resolveLandingTable();
    if (!landingTable) {
      return NextResponse.json({
        data: null,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }

    const payload: Record<string, unknown> = fixUuids({
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
      ...(body.translations !== undefined && { translations: body.translations }),
    }) as Record<string, unknown>;

    const { data, error } = await supabaseAdmin
      .from(landingTable)
      .upsert(payload, { onConflict: "cuisine_id" })
      .select()
      .single();

    if (error) {
      if (isLandingTableMissingError(error)) {
        return NextResponse.json({
          data: null,
          warning: LANDING_TABLE_MISSING_WARNING,
          message: "Таблица catalog_landings отсутствует в текущей БД.",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
  const landingTable = await resolveLandingTable();
  if (!landingTable) {
    return NextResponse.json({
      success: true,
      warning: LANDING_TABLE_MISSING_WARNING,
      message: "Таблица catalog_landings отсутствует в текущей БД.",
    });
  }

  const { error } = await supabaseAdmin
    .from(landingTable)
    .delete()
    .eq("cuisine_id", cuisineId);

  if (error) {
    if (isLandingTableMissingError(error)) {
      return NextResponse.json({
        success: true,
        warning: LANDING_TABLE_MISSING_WARNING,
        message: "Таблица catalog_landings отсутствует в текущей БД.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
