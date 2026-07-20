import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractProfileLanguage, type JsonRecord } from "@/lib/profileLanguage";

const DAY_MS = 24 * 60 * 60 * 1000;

function countById(rows: Array<Record<string, unknown>> | null | undefined, key: string) {
  return (rows || []).reduce((acc: Record<string, number>, item) => {
    const id = typeof item[key] === "string" ? item[key] : null;
    if (id) acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
}

function countByIdWhere(
  rows: Array<Record<string, unknown>> | null | undefined,
  key: string,
  predicate: (item: Record<string, unknown>) => boolean
) {
  return (rows || []).reduce((acc: Record<string, number>, item) => {
    const id = typeof item[key] === "string" ? item[key] : null;
    if (id && predicate(item)) acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
}

function addIdsToSet(rows: Array<Record<string, unknown>> | null | undefined, key: string, target: Set<string>) {
  for (const item of rows || []) {
    const id = typeof item[key] === "string" ? item[key] : null;
    if (id) target.add(id);
  }
}

function getOnboardingCompleted(settings: unknown) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;

  const onboarding = (settings as JsonRecord).onboarding;
  if (!onboarding || typeof onboarding !== "object" || Array.isArray(onboarding)) return false;

  const data = onboarding as JsonRecord;
  const priorityFields = ["priorities", "cooking_priorities", "cuisine_preferences"];
  const hasChoices = priorityFields.some((key) => Array.isArray(data[key]) && (data[key] as unknown[]).length > 0);

  return (
    data.completed === true ||
    hasChoices ||
    Boolean(data.cookingLevel || data.cooking_level || data.cookingTime || data.cooking_time)
  );
}

function isSince(value: unknown, timestamp: number) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= timestamp;
}

function countSince(rows: Array<Record<string, unknown>>, key: string, timestamp: number) {
  return rows.filter((row) => isSince(row[key], timestamp)).length;
}

function hasSourceUrl(row: Record<string, unknown>) {
  return typeof row.source_url === "string" && row.source_url.trim().length > 0;
}

async function selectRows(table: string, columns: string) {
  const { data } = await supabaseAdmin.from(table).select(columns).limit(10000);
  return toRows(data);
}

async function selectRowsIn(table: string, columns: string, key: string, values: string[]) {
  const { data } = await supabaseAdmin.from(table).select(columns).in(key, values).limit(10000);
  return toRows(data);
}

function toRows(data: unknown) {
  return ((data || []) as unknown) as Array<Record<string, unknown>>;
}

async function buildStats(totalCount: number | null) {
  const { data: allProfiles, count: allProfilesCount } = await supabaseAdmin
    .from("profiles")
    .select("id,settings,created_at,updated_at,subscription_status", { count: "exact" })
    .limit(10000);

  const profiles = (allProfiles || []) as Array<JsonRecord>;
  const [
    allCuisines,
    allFavorites,
    allRecipes,
    allImports,
    allShoppingLists,
    allShoppingItems,
    allPantryItems,
    allMealPlans,
    allCookingHistory,
  ] = await Promise.all([
    selectRows("cuisines", "owner_id"),
    selectRows("favorite_recipes", "user_id"),
    selectRows("recipes", "owner_id,source_url,created_at"),
    selectRows("user_recipe_imports", "user_id,created_at,source_type"),
    selectRows("shopping_lists", "user_id,created_at,status"),
    selectRows("shopping_list_items", "user_id,created_at,checked"),
    selectRows("pantry_items", "user_id,created_at"),
    selectRows("meal_plans", "user_id,created_at"),
    selectRows("cooking_history", "user_id,cooked_at"),
  ]);

  const activeIds = new Set<string>();
  addIdsToSet(allCuisines, "owner_id", activeIds);
  addIdsToSet(allFavorites, "user_id", activeIds);
  addIdsToSet(allRecipes, "owner_id", activeIds);
  addIdsToSet(allImports, "user_id", activeIds);
  addIdsToSet(allShoppingLists, "user_id", activeIds);
  addIdsToSet(allShoppingItems, "user_id", activeIds);
  addIdsToSet(allPantryItems, "user_id", activeIds);
  addIdsToSet(allMealPlans, "user_id", activeIds);
  addIdsToSet(allCookingHistory, "user_id", activeIds);

  const now = Date.now();
  const since24h = now - DAY_MS;
  const since7d = now - DAY_MS * 7;
  const since30d = now - DAY_MS * 30;
  const languageCounts = new Map<string, { code: string | null; label: string; count: number }>();

  let withOnboarding = 0;
  let freeUsers = 0;
  let paidUsers = 0;
  let created24h = 0;
  let created7d = 0;
  let created30d = 0;
  let updated24h = 0;

  for (const profile of profiles) {
    if (getOnboardingCompleted(profile.settings)) withOnboarding += 1;

    const subscriptionStatus = typeof profile.subscription_status === "string" ? profile.subscription_status : "free";
    if (subscriptionStatus && subscriptionStatus !== "free") {
      paidUsers += 1;
    } else {
      freeUsers += 1;
    }

    if (isSince(profile.created_at, since24h)) created24h += 1;
    if (isSince(profile.created_at, since7d)) created7d += 1;
    if (isSince(profile.created_at, since30d)) created30d += 1;
    if (isSince(profile.updated_at || profile.created_at, since24h)) updated24h += 1;

    const language = extractProfileLanguage(profile);
    const key = language.status === "confirmed" && language.code ? language.code : "unknown";
    const current = languageCounts.get(key) || {
      code: language.status === "confirmed" ? language.code : null,
      label: language.status === "confirmed" ? language.label : "Неизвестно",
      count: 0,
    };
    current.count += 1;
    languageCounts.set(key, current);
  }

  return {
    total: allProfilesCount ?? totalCount ?? profiles.length,
    scanned: profiles.length,
    created_24h: created24h,
    created_7d: created7d,
    created_30d: created30d,
    updated_24h: updated24h,
    with_activity: activeIds.size,
    with_onboarding: withOnboarding,
    free_users: freeUsers,
    paid_users: paidUsers,
    usage_totals: {
      imports: allImports.length,
      imported_recipes: allRecipes.filter(hasSourceUrl).length,
      shopping_lists: allShoppingLists.length,
      shopping_items: allShoppingItems.length,
      shopping_items_checked: allShoppingItems.filter((row) => row.checked === true).length,
      pantry_items: allPantryItems.length,
      meal_plans: allMealPlans.length,
      cooked_recipes: allCookingHistory.length,
    },
    usage_24h: {
      imports: countSince(allImports, "created_at", since24h),
      imported_recipes: countSince(allRecipes.filter(hasSourceUrl), "created_at", since24h),
      shopping_lists: countSince(allShoppingLists, "created_at", since24h),
      shopping_items: countSince(allShoppingItems, "created_at", since24h),
      pantry_items: countSince(allPantryItems, "created_at", since24h),
      meal_plans: countSince(allMealPlans, "created_at", since24h),
      cooked_recipes: countSince(allCookingHistory, "cooked_at", since24h),
    },
    language_counts: Array.from(languageCounts.values()).sort((a, b) => b.count - a.count),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  let query = supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (search) {
    const term = `%${search}%`;
    query = query.or(`name.ilike.${term},id.ilike.${term}`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const stats = await buildStats(count ?? null);

  // Для каждого профиля получаем количество пользовательских сущностей и действий
  if (data && data.length > 0) {
    const userIds = data.map(profile => profile.id);

    // Получаем количество каталогов для каждого пользователя
    const { data: cuisinesData } = await supabaseAdmin
      .from("cuisines")
      .select("owner_id")
      .in("owner_id", userIds);

    // Получаем количество избранного для каждого пользователя
    const { data: favoritesData } = await supabaseAdmin
      .from("favorite_recipes")
      .select("user_id")
      .in("user_id", userIds);

    // Получаем количество рецептов для каждого пользователя
    const { data: recipesData } = await supabaseAdmin
      .from("recipes")
      .select("owner_id,source_url")
      .in("owner_id", userIds);

    const [
      importsData,
      shoppingListsData,
      shoppingItemsData,
      pantryItemsData,
      mealPlansData,
      cookingHistoryData,
    ] = await Promise.all([
      selectRowsIn("user_recipe_imports", "user_id,source_type", "user_id", userIds),
      selectRowsIn("shopping_lists", "user_id,status", "user_id", userIds),
      selectRowsIn("shopping_list_items", "user_id,checked", "user_id", userIds),
      selectRowsIn("pantry_items", "user_id", "user_id", userIds),
      selectRowsIn("meal_plans", "user_id", "user_id", userIds),
      selectRowsIn("cooking_history", "user_id", "user_id", userIds),
    ]);

    // Подсчитываем для каждого пользователя
    const recipesRows = toRows(recipesData);
    const shoppingItemsRows = shoppingItemsData;
    const cuisinesCounts = countById(toRows(cuisinesData), "owner_id");
    const favoritesCounts = countById(toRows(favoritesData), "user_id");
    const recipesCounts = countById(recipesRows, "owner_id");
    const importedRecipesCounts = countByIdWhere(
      recipesRows,
      "owner_id",
      hasSourceUrl
    );
    const importsCounts = countById(importsData, "user_id");
    const shoppingListsCounts = countById(shoppingListsData, "user_id");
    const shoppingItemsCounts = countById(shoppingItemsRows, "user_id");
    const shoppingItemsCheckedCounts = countByIdWhere(
      shoppingItemsRows,
      "user_id",
      (row) => row.checked === true
    );
    const pantryItemsCounts = countById(pantryItemsData, "user_id");
    const mealPlansCounts = countById(mealPlansData, "user_id");
    const cookedCounts = countById(cookingHistoryData, "user_id");

    // Добавляем данные к профилям
    const enrichedData = data.map(profile => {
      const language = extractProfileLanguage(profile as JsonRecord);

      return {
        ...profile,
        cuisines_count: cuisinesCounts[profile.id] || 0,
        favorites_count: favoritesCounts[profile.id] || 0,
        recipes_count: recipesCounts[profile.id] || 0,
        imports_count: importsCounts[profile.id] || 0,
        imported_recipes_count: importedRecipesCounts[profile.id] || 0,
        shopping_lists_count: shoppingListsCounts[profile.id] || 0,
        shopping_items_count: shoppingItemsCounts[profile.id] || 0,
        shopping_items_checked_count: shoppingItemsCheckedCounts[profile.id] || 0,
        pantry_items_count: pantryItemsCounts[profile.id] || 0,
        meal_plans_count: mealPlansCounts[profile.id] || 0,
        cooked_count: cookedCounts[profile.id] || 0,
        language_code: language.code,
        language_label: language.label,
        language_source: language.source,
        language_raw: language.raw,
        language_status: language.status,
        language_note: language.note,
      };
    });

    return NextResponse.json({ data: enrichedData, count, page, limit, stats });
  }

  return NextResponse.json({ data, count, page, limit, stats });
}
