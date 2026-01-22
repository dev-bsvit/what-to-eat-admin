import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get products missing key fields (calories, protein, fat, carbohydrates, description)
    const { data, error, count } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, category, icon, calories, protein, fat, carbohydrates, description, auto_created, needs_moderation", { count: "exact" })
      .or("calories.is.null,protein.is.null,fat.is.null,carbohydrates.is.null,description.is.null")
      .order("canonical_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Calculate completeness for each product
    const productsWithCompleteness = (data || []).map((product) => {
      const fields = ["calories", "protein", "fat", "carbohydrates", "description"];
      const filled = fields.filter((f) => product[f as keyof typeof product] !== null).length;
      const completeness = Math.round((filled / fields.length) * 100);
      const missingFields = fields.filter((f) => product[f as keyof typeof product] === null);
      return { ...product, completeness, missingFields };
    });

    return NextResponse.json({
      data: productsWithCompleteness,
      count: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
