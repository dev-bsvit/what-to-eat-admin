import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanIngredientName, isUuid } from "@/lib/stringUtils";
import { normalizeText, parseBoolean, parseNumber, parseTextArray } from "@/lib/parseFields";

const resolveProductId = async (name: string | null | undefined): Promise<string | null> => {
  const raw = (name || "").trim();
  if (!raw) return null;
  const cleaned = cleanIngredientName(raw);

  for (const term of [cleaned, raw]) {
    const { data } = await supabaseAdmin
      .from("product_dictionary")
      .select("id")
      .ilike("canonical_name", term)
      .limit(1);
    if (data?.length) return data[0].id as string;
  }

  for (const term of [cleaned, raw]) {
    const { data } = await supabaseAdmin
      .from("product_dictionary")
      .select("id")
      .ilike("canonical_name", `%${term}%`)
      .limit(1);
    if (data?.length) return data[0].id as string;
  }

  return null;
};

const ensureProductId = async (name: string | null | undefined): Promise<string | null> => {
  const cleaned = (name || "").trim();
  if (!cleaned) return null;

  const existing = await resolveProductId(cleaned);
  if (existing) return existing;

  const { data } = await supabaseAdmin
    .from("product_dictionary")
    .upsert(
      { canonical_name: cleaned, category: "other", auto_created: true, needs_moderation: true },
      { onConflict: "canonical_name" }
    )
    .select("id")
    .single();

  return data?.id || null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cuisine_id, recipes } = body;

    if (!cuisine_id) {
      return NextResponse.json({ error: "cuisine_id required" }, { status: 400 });
    }
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: "recipes array required" }, { status: 400 });
    }

    let imported = 0;
    const errors: { index: number; title: string; error: string }[] = [];

    for (let i = 0; i < recipes.length; i++) {
      const r = recipes[i];
      try {
        const title = normalizeText(r.title);
        if (!title) {
          errors.push({ index: i, title: `Рецепт #${i + 1}`, error: "Пустое название" });
          continue;
        }

        const payload = {
          cuisine_id,
          title,
          description: normalizeText(r.description),
          image_url: normalizeText(r.image_url),
          prep_time: parseNumber(r.prep_time),
          cook_time: parseNumber(r.cook_time),
          servings: parseNumber(r.servings),
          difficulty: normalizeText(r.difficulty) || "medium",
          tags: parseTextArray(r.tags),
          meal_role: parseTextArray(r.meal_role),
          main_ingredient: normalizeText(r.main_ingredient),
          budget_level: parseNumber(r.budget_level),
          kid_friendly: parseBoolean(r.kid_friendly) ?? false,
          spicy_level: parseNumber(r.spicy_level) ?? 0,
          calories: parseNumber(r.calories),
          protein: parseNumber(r.protein),
          carbs: parseNumber(r.carbs),
          fat: parseNumber(r.fat),
          fiber: parseNumber(r.fiber),
          tips: normalizeText(r.tips),
          serving_tips: normalizeText(r.serving_tips),
          storage_tips: normalizeText(r.storage_tips),
          recipe_note: normalizeText(r.recipe_note),
          source_url: normalizeText(r.source_url),
          is_public: r.is_public !== false,
        };

        const { data: recipeData, error: recipeError } = await supabaseAdmin
          .from("recipes")
          .insert(payload)
          .select("id")
          .single();

        if (recipeError || !recipeData) {
          errors.push({ index: i, title, error: recipeError?.message || "DB insert error" });
          continue;
        }

        const recipeId = recipeData.id as string;

        // Insert ingredients
        const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
        if (ingredients.length > 0) {
          const ingredientRows = await Promise.all(
            ingredients.map(async (ing: any, idx: number) => {
              const productId = isUuid(ing.id ?? "") ? ing.id : await ensureProductId(ing.name);
              return {
                recipe_id: recipeId,
                product_dictionary_id: productId,
                amount: parseNumber(ing.quantity ?? ing.amount),
                unit: normalizeText(ing.unit),
                note: normalizeText(ing.note),
                optional: parseBoolean(ing.optional) ?? false,
                order_index: idx,
              };
            })
          );
          const filtered = ingredientRows.filter((row) => row.product_dictionary_id);
          if (filtered.length > 0) {
            await supabaseAdmin.from("recipe_ingredients").insert(filtered);
          }
        }

        // Insert steps
        const steps = Array.isArray(r.steps) ? r.steps : [];
        if (steps.length > 0) {
          const stepRows = steps
            .map((step: any, idx: number) => ({
              recipe_id: recipeId,
              text: normalizeText(typeof step === "string" ? step : step?.text),
              order_index: idx,
            }))
            .filter((s: { recipe_id: string; text: string | null; order_index: number }) => s.text);
          if (stepRows.length > 0) {
            await supabaseAdmin.from("recipe_steps").insert(stepRows);
          }
        }

        imported++;
      } catch (err: any) {
        errors.push({
          index: i,
          title: normalizeText(r.title) || `Рецепт #${i + 1}`,
          error: err.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
