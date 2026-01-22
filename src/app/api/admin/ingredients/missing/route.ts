import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RecipeRow = {
  id: string;
  title: string | null;
  ingredients: unknown;
};

type IngredientItem = {
  name?: string;
  productName?: string;
  title?: string;
  id?: string | null;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET() {
  try {
    const { data: products, error: productError } = await supabaseAdmin
      .from("product_dictionary")
      .select("canonical_name, synonyms");

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 400 });
    }

    const known = new Set<string>();
    (products || []).forEach((row) => {
      const canonical = (row as { canonical_name?: string | null }).canonical_name || "";
      if (canonical) {
        known.add(normalize(canonical));
      }
      const synonyms = (row as { synonyms?: string[] | null }).synonyms || [];
      synonyms.forEach((syn) => {
        if (syn) {
          known.add(normalize(syn));
        }
      });
    });

    const { data: recipes, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, ingredients");

    if (recipeError) {
      return NextResponse.json({ error: recipeError.message }, { status: 400 });
    }

    const missingMap = new Map<string, { count: number; recipeTitles: string[] }>();

    (recipes || []).forEach((row) => {
      const recipe = row as RecipeRow;
      const title = recipe.title || "Без названия";
      const ingredientsRaw = recipe.ingredients;
      if (!ingredientsRaw) {
        return;
      }
      let parsed: IngredientItem[] = [];
      try {
        parsed = typeof ingredientsRaw === "string" ? JSON.parse(ingredientsRaw) : (ingredientsRaw as IngredientItem[]);
      } catch (error) {
        return;
      }
      if (!Array.isArray(parsed)) {
        return;
      }
      parsed.forEach((ing: IngredientItem | string) => {
        if (ing && typeof ing === "object") {
          const idValue = String((ing as { id?: string | null }).id || "").trim();
          if (idValue && isUuid(idValue)) {
            return;
          }
        }
        const name =
          typeof ing === "string"
            ? ing.trim()
            : String((ing as IngredientItem)?.name || (ing as IngredientItem)?.productName || (ing as IngredientItem)?.title || "").trim();
        if (!name) {
          return;
        }
        const key = normalize(name);
        if (known.has(key)) {
          return;
        }
        const record = missingMap.get(name) || { count: 0, recipeTitles: [] };
        record.count += 1;
        if (record.recipeTitles.length < 3 && !record.recipeTitles.includes(title)) {
          record.recipeTitles.push(title);
        }
        missingMap.set(name, record);
      });
    });

    const items = Array.from(missingMap.entries())
      .map(([name, data]) => ({ name, count: data.count, recipeTitles: data.recipeTitles }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
