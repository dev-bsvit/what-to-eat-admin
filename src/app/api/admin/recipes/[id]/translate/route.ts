/**
 * POST /api/admin/recipes/[id]/translate
 *
 * Translate an existing recipe to all supported languages and save to DB.
 *
 * Body: { source_language: "ru" }
 *
 * Reads recipe title/description/tips/instructions from DB,
 * translates to all other 7 languages via DeepL Free API,
 * then upserts rows in recipe_translations + recipe_instruction_translations.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  translateRecipeToAllLanguages,
  type RecipeContent,
} from "@/lib/translate";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params;
    const body = await request.json();
    const sourceLang: string = body.source_language || "ru";

    // ── 1. Load recipe from DB ─────────────────────────────────────────────
    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, description, tips, serving_tips, storage_tips, recipe_note")
      .eq("id", recipeId)
      .single();

    if (recipeError || !recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // ── 2. Load instructions from recipe_steps ─────────────────────────────
    const { data: steps } = await supabaseAdmin
      .from("recipe_steps")
      .select("text, order_index")
      .eq("recipe_id", recipeId)
      .order("order_index");

    const instructions = steps?.map((s) => s.text).filter(Boolean) ?? [];

    const content: RecipeContent = {
      title: recipe.title,
      description: recipe.description,
      tips: recipe.tips,
      serving_tips: recipe.serving_tips,
      storage_tips: recipe.storage_tips,
      recipe_note: recipe.recipe_note,
      instructions,
    };

    // ── 3. Translate to all languages ──────────────────────────────────────
    const allTranslations = await translateRecipeToAllLanguages(content, sourceLang);

    // ── 4. Upsert recipe_translations ─────────────────────────────────────
    const translationRows = Object.entries(allTranslations).map(([lang, t]) => ({
      recipe_id: recipeId,
      language_code: lang,
      title: t.title,
      description: t.description ?? null,
      dish_type: null,
      course: null,
    }));

    const { error: translationsError } = await supabaseAdmin
      .from("recipe_translations")
      .upsert(translationRows, { onConflict: "recipe_id,language_code" });

    if (translationsError) {
      return NextResponse.json({ error: translationsError.message }, { status: 500 });
    }

    // ── 5. Upsert recipe_instruction_translations ──────────────────────────
    const instructionRows = Object.entries(allTranslations)
      .filter(([, t]) => t.instructions?.length)
      .map(([lang, t]) => ({
        recipe_id: recipeId,
        language_code: lang,
        instructions: t.instructions,
      }));

    if (instructionRows.length) {
      const { error: instrError } = await supabaseAdmin
        .from("recipe_instruction_translations")
        .upsert(instructionRows, { onConflict: "recipe_id,language_code" });

      if (instrError) {
        return NextResponse.json({ error: instrError.message }, { status: 500 });
      }
    }

    const languagesDone = Object.keys(allTranslations);
    return NextResponse.json({
      success: true,
      recipe_id: recipeId,
      languages: languagesDone,
      translations_saved: translationRows.length,
      instruction_translations_saved: instructionRows.length,
    });
  } catch (err) {
    console.error("[translate recipe]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
