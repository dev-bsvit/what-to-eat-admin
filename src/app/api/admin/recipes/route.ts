import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanIngredientName } from "@/lib/stringUtils";
import {
  normalizeText,
  parseBoolean,
  parseJson,
  parseNumber,
  parseTextArray,
  parseUuidArray,
} from "@/lib/parseFields";
import {
  translateRecipeToAllLanguages,
  type RecipeContent,
} from "@/lib/translate";

const isUuid = (value: string | null | undefined) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const resolveProductId = async (name: string | null | undefined) => {
  const raw = (name || "").trim();
  if (!raw) return null;
  const cleaned = cleanIngredientName(raw);

  // Try exact match on cleaned name first, then original
  for (const term of [cleaned, raw]) {
    const exact = await supabaseAdmin
      .from("product_dictionary")
      .select("id")
      .ilike("canonical_name", term)
      .limit(1);
    if (exact.data?.length) return exact.data[0].id as string;
  }

  // Partial match: cleaned name contained in canonical, or canonical in cleaned
  for (const term of [cleaned, raw]) {
    const partial = await supabaseAdmin
      .from("product_dictionary")
      .select("id")
      .ilike("canonical_name", `%${term}%`)
      .limit(1);
    if (partial.data?.length) return partial.data[0].id as string;
  }

  return null;
};

const ensureProductId = async (name: string | null | undefined) => {
  const cleaned = (name || "").trim();
  if (!cleaned) return null;

  const existingId = await resolveProductId(cleaned);
  if (existingId) {
    return existingId;
  }

  const { data, error } = await supabaseAdmin
    .from("product_dictionary")
    .upsert(
      {
        canonical_name: cleaned,
        category: "other",
        auto_created: true,
        needs_moderation: true,
      },
      { onConflict: "canonical_name" }
    )
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data?.id || null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const id = searchParams.get("id");

  let query = supabaseAdmin
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (id) {
    query = query.eq("id", id);
  } else if (search) {
    query = query.ilike("title", `%${search}%`);
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

    const parsedIngredients = parseJson(body.ingredients);
    const parsedInstructions = parseJson(body.instructions);
    let normalizedIngredients = parsedIngredients;

    if (Array.isArray(parsedIngredients)) {
      normalizedIngredients = await Promise.all(
        parsedIngredients.map(async (item: any) => {
          const existingId = isUuid(item?.id) ? item.id : null;
          const resolvedId = existingId || (await resolveProductId(item?.name));
          return {
            ...item,
            ...(resolvedId ? { id: resolvedId } : {}),
          };
        })
      );
    }

    // Автоматическое создание/связывание каталога для пользовательских рецептов
    let cuisineId = normalizeText(body.cuisine_id);
    const ownerId = normalizeText(body.owner_id);
    const isUserDefined = parseBoolean(body.is_user_defined) ?? false;

    // Если это пользовательский рецепт без cuisine_id, создаем или находим каталог
    if (isUserDefined && ownerId && !cuisineId) {
      // Ищем существующий пользовательский каталог
      const { data: existingCuisine } = await supabaseAdmin
        .from("cuisines")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("is_user_generated", true)
        .eq("name", "Мои рецепты")
        .single();

      if (existingCuisine) {
        cuisineId = existingCuisine.id;

        // Убеждаемся, что статус каталога active
        await supabaseAdmin
          .from("cuisines")
          .update({ status: "active" })
          .eq("id", cuisineId)
          .neq("status", "active");
      } else {
        // Создаем новый каталог для пользователя
        const { data: newCuisine, error: cuisineError } = await supabaseAdmin
          .from("cuisines")
          .insert({
            name: "Мои рецепты",
            owner_id: ownerId,
            is_user_generated: true,
            status: "active",
            image_url: null,
          })
          .select("id")
          .single();

        if (!cuisineError && newCuisine) {
          cuisineId = newCuisine.id;
        }
      }
    }

    const recipeId = isUuid(body?.id) ? body.id : null;
    const payload = {
      title: normalizeText(body.title),
      description: normalizeText(body.description),
      image_url: normalizeText(body.image_url),
      step_images: parseJson(body.step_images),
      cuisine_id: cuisineId,
      dish_type: normalizeText(body.dish_type),
      course: normalizeText(body.course),
      owner_id: ownerId,
      is_user_defined: isUserDefined,
      author: normalizeText(body.author),
      contributor_ids: parseUuidArray(body.contributor_ids),
      servings: parseNumber(body.servings),
      prep_time: parseNumber(body.prep_time),
      cook_time: parseNumber(body.cook_time),
      difficulty: normalizeText(body.difficulty),
      tags: parseTextArray(body.tags),
      diet_tags: parseTextArray(body.diet_tags),
      allergen_tags: parseTextArray(body.allergen_tags),
      cuisine_tags: parseTextArray(body.cuisine_tags),
      equipment: parseTextArray(body.equipment),
      tools_optional: parseTextArray(body.tools_optional),
      calories: parseNumber(body.calories),
      protein: parseNumber(body.protein),
      fat: parseNumber(body.fat),
      carbs: parseNumber(body.carbs),
      fiber: parseNumber(body.fiber),
      sugar: parseNumber(body.sugar),
      salt: parseNumber(body.salt),
      saturated_fat: parseNumber(body.saturated_fat),
      cholesterol: parseNumber(body.cholesterol),
      sodium: parseNumber(body.sodium),
      nutrition_per_100g: parseJson(body.nutrition_per_100g),
      tips: normalizeText(body.tips),
      serving_tips: normalizeText(body.serving_tips),
      storage_tips: normalizeText(body.storage_tips),
      recipe_note: normalizeText(body.recipe_note),
      ingredients: normalizedIngredients,
      instructions: parsedInstructions,
      comments_enabled: parseBoolean(body.comments_enabled) ?? true,
      comments_count: parseNumber(body.comments_count),
      translations: parseJson(body.translations),
    };

    const payloadWithId = recipeId ? { ...payload, id: recipeId } : payload;
    const { data, error } = recipeId
      ? await supabaseAdmin
          .from("recipes")
          .upsert(payloadWithId, { onConflict: "id" })
          .select()
          .single()
      : await supabaseAdmin
          .from("recipes")
          .insert(payloadWithId)
          .select()
          .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const savedRecipeId = data.id as string;

    if (Array.isArray(normalizedIngredients)) {
      await supabaseAdmin
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", savedRecipeId);

      const ingredientsRows = await Promise.all(
        normalizedIngredients.map(async (item: any, index: number) => {
          const productId = isUuid(item?.id) ? item.id : await ensureProductId(item?.name);
          return {
            recipe_id: savedRecipeId,
            product_dictionary_id: productId,
            amount: typeof item?.quantity === "number" ? item.quantity : parseNumber(item?.quantity),
            unit: normalizeText(item?.unit),
            note: normalizeText(item?.note),
            optional: parseBoolean(item?.optional) ?? false,
            order_index: index,
          };
        })
      );

      const filteredIngredients = ingredientsRows.filter(row => row.product_dictionary_id);

      if (filteredIngredients.length) {
        const { error: ingredientsError } = await supabaseAdmin
          .from("recipe_ingredients")
          .insert(filteredIngredients);

        if (ingredientsError) {
          return NextResponse.json({ error: ingredientsError.message }, { status: 400 });
        }
      }
    }

    if (Array.isArray(parsedInstructions)) {
      await supabaseAdmin
        .from("recipe_steps")
        .delete()
        .eq("recipe_id", savedRecipeId);

      const stepsRows = parsedInstructions
        .map((step: any, index: number) => {
          const text = typeof step === "string" ? step : step?.text;
          return {
            recipe_id: savedRecipeId,
            text: normalizeText(text),
            order_index: index,
          };
        })
        .filter(step => step.text);

      if (stepsRows.length) {
        const { error: stepsError } = await supabaseAdmin
          .from("recipe_steps")
          .insert(stepsRows);

        if (stepsError) {
          return NextResponse.json({ error: stepsError.message }, { status: 400 });
        }
      }
    }

    // ── Auto-translate if source_language is provided ─────────────────────
    const sourceLang = normalizeText(body.source_language);
    if (sourceLang && process.env.DEEPL_API_KEY) {
      try {
        const instructionTexts = Array.isArray(parsedInstructions)
          ? parsedInstructions
              .map((s: unknown) => (typeof s === "string" ? s : (s as { text?: string })?.text))
              .filter((t): t is string => Boolean(t))
          : [];

        const content: RecipeContent = {
          title: normalizeText(body.title) ?? "",
          description: normalizeText(body.description),
          tips: normalizeText(body.tips),
          serving_tips: normalizeText(body.serving_tips),
          storage_tips: normalizeText(body.storage_tips),
          recipe_note: normalizeText(body.recipe_note),
          instructions: instructionTexts,
        };

        const allTranslations = await translateRecipeToAllLanguages(content, sourceLang);

        const translationRows = Object.entries(allTranslations).map(([lang, t]) => ({
          recipe_id: savedRecipeId,
          language_code: lang,
          title: t.title,
          description: t.description ?? null,
          dish_type: null,
          course: null,
        }));

        await supabaseAdmin
          .from("recipe_translations")
          .upsert(translationRows, { onConflict: "recipe_id,language_code" });

        const instructionRows = Object.entries(allTranslations)
          .filter(([, t]) => t.instructions?.length)
          .map(([lang, t]) => ({
            recipe_id: savedRecipeId,
            language_code: lang,
            instructions: t.instructions,
          }));

        if (instructionRows.length) {
          await supabaseAdmin
            .from("recipe_instruction_translations")
            .upsert(instructionRows, { onConflict: "recipe_id,language_code" });
        }
      } catch (translateErr) {
        // Translation failure must not block the recipe save response
        console.error("[auto-translate]", translateErr);
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
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
    const cuisineId = searchParams.get("cuisine_id");

    if (!id && !cuisineId) {
      return NextResponse.json(
        { error: "Either 'id' or 'cuisine_id' is required" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin.from("recipes").delete();

    if (id) {
      query = query.eq("id", id);
    } else if (cuisineId) {
      query = query.eq("cuisine_id", cuisineId);
    }

    const { error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
