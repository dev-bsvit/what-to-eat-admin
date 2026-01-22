import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // Получаем избранное с информацией о рецептах
    const { data: favorites, error: favError } = await supabaseAdmin
      .from("favorite_recipes")
      .select("recipe_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });

    if (favError) {
      // Если таблица не существует, возвращаем пустой массив
      if (favError.message.includes("schema cache") || favError.code === "42P01") {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: favError.message }, { status: 400 });
    }

    if (!favorites || favorites.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Получаем информацию о рецептах
    const recipeIds = favorites.map(f => f.recipe_id);
    const { data: recipes, error: recError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, image_url, cook_time, difficulty")
      .in("id", recipeIds);

    if (recError) {
      return NextResponse.json({ error: recError.message }, { status: 400 });
    }

    // Объединяем данные
    const enrichedFavorites = favorites.map(fav => {
      const recipe = recipes?.find(r => r.id === fav.recipe_id);
      return {
        ...fav,
        recipe: recipe || null
      };
    });

    return NextResponse.json({ data: enrichedFavorites });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
