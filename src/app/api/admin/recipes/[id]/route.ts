import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params;

    // Получаем рецепт с информацией о кухне
    const { data: recipe, error } = await supabaseAdmin
      .from("recipes")
      .select(`
        *,
        cuisine:cuisines(id, name)
      `)
      .eq("id", recipeId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const { data: ingredients, error: ingredientsError } = await supabaseAdmin
      .from("recipe_ingredients_view")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("order_index", { ascending: true });

    if (ingredientsError) {
      return NextResponse.json({ error: ingredientsError.message }, { status: 400 });
    }

    const { data: steps, error: stepsError } = await supabaseAdmin
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("order_index", { ascending: true });

    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 400 });
    }

    return NextResponse.json({ recipe, ingredients: ingredients ?? [], steps: steps ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
