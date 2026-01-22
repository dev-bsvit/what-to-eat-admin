import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // Для каждого профиля получаем количество каталогов и избранного
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

    // Подсчитываем для каждого пользователя
    const cuisinesCounts = cuisinesData?.reduce((acc: Record<string, number>, item) => {
      if (item.owner_id) {
        acc[item.owner_id] = (acc[item.owner_id] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    const favoritesCounts = favoritesData?.reduce((acc: Record<string, number>, item) => {
      if (item.user_id) {
        acc[item.user_id] = (acc[item.user_id] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    // Добавляем данные к профилям
    const enrichedData = data.map(profile => ({
      ...profile,
      cuisines_count: cuisinesCounts[profile.id] || 0,
      favorites_count: favoritesCounts[profile.id] || 0
    }));

    return NextResponse.json({ data: enrichedData, count, page, limit });
  }

  return NextResponse.json({ data, count, page, limit });
}
