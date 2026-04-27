import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeText, parseBoolean, parseJson, parseNumber, parseTextArray } from "@/lib/parseFields";
import {
  CATALOG_DIETARY_VALUES,
  CATALOG_GENERAL_TAG_VALUES,
  CATALOG_LEVEL_VALUES,
  CATALOG_TIME_VALUES,
} from "@/lib/catalogRecommendationTags";

const onlyAllowed = (items: string[] | null, allowed: string[]) => {
  if (!items) return [];
  const allowedSet = new Set(allowed);
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && allowedSet.has(item));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  let query = supabaseAdmin
    .from("cuisines")
    .select("*")
    .order("name", { ascending: true });

  if (id) {
    query = query.eq("id", id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Валидация обязательных полей
    if (!body.name) {
      return NextResponse.json(
        { error: "Обязательное поле: name" },
        { status: 400 }
      );
    }

    const type = normalizeText(body.type);
    const recommendationLevels = onlyAllowed(parseTextArray(body.recommendation_levels), CATALOG_LEVEL_VALUES);
    const recommendationTimes = onlyAllowed(parseTextArray(body.recommendation_times), CATALOG_TIME_VALUES);
    const recommendationDietary = onlyAllowed(parseTextArray(body.recommendation_dietary), CATALOG_DIETARY_VALUES);
    const recommendationTags = onlyAllowed(parseTextArray(body.recommendation_tags), CATALOG_GENERAL_TAG_VALUES);

    if ((type === "premium" || type === "gift") && (
      recommendationLevels.length === 0 ||
      recommendationTimes.length === 0 ||
      recommendationTags.length === 0
    )) {
      return NextResponse.json(
        { error: "Для premium/gift каталога обязательны recommendation_levels, recommendation_times и recommendation_tags" },
        { status: 400 }
      );
    }

    const payload = {
      id: normalizeText(body.id),
      name: normalizeText(body.name),
      description: normalizeText(body.description),
      image_url: normalizeText(body.image_url),
      landing_image_url: normalizeText(body.landing_image_url),
      catalog_id: normalizeText(body.catalog_id),
      type,
      price: parseNumber(body.price),
      is_default: parseBoolean(body.is_default),
      unlock_conditions: parseJson(body.unlock_conditions),
      owner_id: normalizeText(body.owner_id),
      is_user_generated: parseBoolean(body.is_user_generated),
      moderation_status: normalizeText(body.moderation_status),
      status: normalizeText(body.status),
      popularity_score: parseNumber(body.popularity_score),
      downloads_count: parseNumber(body.downloads_count),
      purchases_count: parseNumber(body.purchases_count),
      tags: parseTextArray(body.tags),
      recommendation_levels: recommendationLevels,
      recommendation_times: recommendationTimes,
      recommendation_dietary: recommendationDietary,
      recommendation_tags: recommendationTags,
      revenue_share: parseNumber(body.revenue_share),
    };

    if (!payload.id) {
      delete (payload as { id?: string | null }).id;
    }

    console.log("API: Сохранение кухни:", payload);

    const { data, error } = await supabaseAdmin
      .from("cuisines")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("cuisines")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
