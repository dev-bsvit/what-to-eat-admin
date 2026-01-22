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

    // Получаем рецепты, созданные пользователем
    const { data: recipes, error: recipesError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, image_url, cook_time, difficulty, created_at, cuisine_id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (recipesError) {
      // Если таблица не существует или нет колонки owner_id, возвращаем пустой массив
      if (recipesError.message.includes("schema cache") || recipesError.code === "42P01" || recipesError.message.includes("owner_id")) {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: recipesError.message }, { status: 400 });
    }

    if (!recipes || recipes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Получаем информацию о каталогах для рецептов
    const cuisineIds = recipes.map(r => r.cuisine_id).filter(Boolean);
    let cuisinesMap: Record<string, any> = {};

    if (cuisineIds.length > 0) {
      const { data: cuisines } = await supabaseAdmin
        .from("cuisines")
        .select("id, name")
        .in("id", cuisineIds);

      if (cuisines) {
        cuisinesMap = cuisines.reduce((acc, cuisine) => {
          acc[cuisine.id] = cuisine;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Обогащаем рецепты информацией о каталогах
    const enrichedRecipes = recipes.map(recipe => ({
      ...recipe,
      cuisine: recipe.cuisine_id ? cuisinesMap[recipe.cuisine_id] : null
    }));

    return NextResponse.json({ data: enrichedRecipes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
