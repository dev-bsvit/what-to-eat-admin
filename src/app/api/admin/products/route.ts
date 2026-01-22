import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeText,
  parseBoolean,
  parseIntArray,
  parseNumber,
  parseTextArray,
} from "@/lib/parseFields";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const id = searchParams.get("id");
  const category = searchParams.get("category");
  const summary = searchParams.get("summary");
  const namesOnly = searchParams.get("names");
  const autoCreated = searchParams.get("auto_created");
  const needsModeration = searchParams.get("needs_moderation");
  const userCreated = searchParams.get("user_created");
  const includeSynonyms = searchParams.get("include_synonyms");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  if (summary) {
    let summaryQuery = supabaseAdmin.from("product_dictionary").select("category");
    if (category) {
      summaryQuery = summaryQuery.eq("category", category);
    }

    const { data, error } = await summaryQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row) => {
      const key = (row as { category?: string | null }).category || "other";
      counts[key] = (counts[key] || 0) + 1;
    });

    return NextResponse.json({ counts });
  }

  if (namesOnly) {
    let namesQuery = supabaseAdmin.from("product_dictionary").select("canonical_name,category");
    if (category) {
      namesQuery = namesQuery.eq("category", category);
    }
    if (search) {
      namesQuery = namesQuery.ilike("canonical_name", `%${search}%`);
    }
    if (id) {
      namesQuery = namesQuery.eq("id", id);
    }

    const { data, error } = await namesQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const names = (data || [])
      .map((row) => (row as { canonical_name?: string | null }).canonical_name)
      .filter(Boolean);

    return NextResponse.json({ names });
  }

  if (search && (includeSynonyms === "1" || includeSynonyms === "true")) {
    const { data: matches, error: matchError } = await supabaseAdmin
      .rpc("search_products", { search_term: search, max_results: limit });

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 400 });
    }

    const ids = (matches || [])
      .map((item: { id?: string | null }) => item.id)
      .filter(Boolean) as string[];

    if (ids.length === 0) {
      return NextResponse.json({ data: [], count: 0, page, limit });
    }

    let matchQuery = supabaseAdmin
      .from("product_dictionary")
      .select("*")
      .in("id", ids);

    if (category) {
      matchQuery = matchQuery.eq("category", category);
    }

    const { data: matchProducts, error: matchProductsError } = await matchQuery;
    if (matchProductsError) {
      return NextResponse.json({ error: matchProductsError.message }, { status: 400 });
    }

    const productMap = new Map(matchProducts?.map((item) => [item.id, item]) || []);
    const ordered = ids.map((id) => productMap.get(id)).filter(Boolean);

    return NextResponse.json({ data: ordered, count: ordered.length, page, limit });
  }

  let query = supabaseAdmin
    .from("product_dictionary")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (id) {
    query = query.eq("id", id);
  } else if (search) {
    query = query.ilike("canonical_name", `%${search}%`);
  }
  if (category) {
    query = query.eq("category", category);
  }
  if (autoCreated === "1" || autoCreated === "true") {
    query = query.eq("auto_created", true);
  }
  if (needsModeration === "1" || needsModeration === "true") {
    query = query.eq("needs_moderation", true);
  }
  if (userCreated === "1" || userCreated === "true") {
    query = query.not("created_by_user_id", "is", null);
  }

  if (!id) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, count, page, limit });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const resolveIcon = (item: { icon?: string | null; category?: string | null; canonical_name?: string | null }) => {
      const current = (item.icon || "").trim();
      if (current && current !== "🍽️") {
        return current;
      }
      const name = (item.canonical_name || "").toLowerCase();
      const category = (item.category || "other").toLowerCase();
      const keywordIcons: Array<{ match: RegExp; icon: string }> = [
        { match: /(молок|кефир|йогурт|сливк|ряженк)/i, icon: "🥛" },
        { match: /(сыр|творог)/i, icon: "🧀" },
        { match: /(яйц|egg)/i, icon: "🥚" },
        { match: /(хлеб|батон|булк|лаваш)/i, icon: "🍞" },
        { match: /(макарон|паста|спагет)/i, icon: "🍝" },
        { match: /(рис|греч|овсян|перлов|пшено|манка|крупа)/i, icon: "🌾" },
        { match: /(куриц|индейк|утк|гусь|бедро|филе)/i, icon: "🍗" },
        { match: /(говядин|свин|колбас|ветчин|бекон)/i, icon: "🥩" },
        { match: /(рыб|лосос|тунец|сельд|треск|форел)/i, icon: "🐟" },
        { match: /(кревет|мид|кальмар)/i, icon: "🦐" },
        { match: /(яблок|груш|банан|апельс|мандари|виноград|ягод|клубник|малина|черник)/i, icon: "🍎" },
        { match: /(помидор|томат)/i, icon: "🍅" },
        { match: /(картоф)/i, icon: "🥔" },
        { match: /(лук|порей)/i, icon: "🧅" },
        { match: /(чеснок)/i, icon: "🧄" },
        { match: /(огурц)/i, icon: "🥒" },
        { match: /(перец)/i, icon: "🌶️" },
        { match: /(кукуруз)/i, icon: "🌽" },
        { match: /(баклажан)/i, icon: "🍆" },
        { match: /(тыкв|тыква)/i, icon: "🎃" },
        { match: /(авокад)/i, icon: "🥑" },
        { match: /(салат|шпинат|зелень|капуст|брокколи|цветн)/i, icon: "🥬" },
        { match: /(гриб|шампиньон)/i, icon: "🍄" },
        { match: /(морков)/i, icon: "🥕" },
        { match: /(масло сливочн)/i, icon: "🧈" },
        { match: /(масло|оливк|подсолнеч)/i, icon: "🫒" },
        { match: /(кофе|кофей)/i, icon: "☕" },
        { match: /(чай|зеленый чай|черный чай)/i, icon: "🍵" },
        { match: /(сок|напит|лимонад|вода)/i, icon: "🥤" },
        { match: /(соль|перец|спец|паприк|кориандр|куркум)/i, icon: "🌶️" },
        { match: /(консер|тушен|шпрот)/i, icon: "🥫" },
        { match: /(мороз|заморож)/i, icon: "❄️" },
        { match: /(орех|миндал|фундук|грецк|арахис|фисташ)/i, icon: "🥜" },
        { match: /(шоколад|конфет|слад|печен|десерт)/i, icon: "🍫" },
      ];
      for (const rule of keywordIcons) {
        if (rule.match.test(name)) {
          return rule.icon;
        }
      }
      const categoryIcons: Record<string, string> = {
        grains: "🌾",
        meat: "🥩",
        dairy: "🥛",
        vegetables: "🥕",
        fruits: "🍎",
        bakery: "🍞",
        fish: "🐟",
        frozen: "❄️",
        drinks: "🥤",
        spices: "🌶️",
        canned: "🥫",
        snacks: "🍿",
        other: "📦",
      };
      return categoryIcons[category] || "📦";
    };

    const buildPayload = (item: Record<string, unknown>) => {
      const payload = {
        id: normalizeText(item.id),
        canonical_name: normalizeText(item.canonical_name),
        synonyms: parseTextArray(item.synonyms),
        category: normalizeText(item.category),
        calories: parseNumber(item.calories),
        protein: parseNumber(item.protein),
        fat: parseNumber(item.fat),
        carbohydrates: parseNumber(item.carbohydrates),
        fiber: parseNumber(item.fiber),
        preferred_unit: normalizeText(item.preferred_unit),
        typical_serving: parseNumber(item.typical_serving),
        requires_expiry: parseBoolean(item.requires_expiry) ?? false,
        default_shelf_life_days: parseNumber(item.default_shelf_life_days),
        seasonal_months: parseIntArray(item.seasonal_months),
        description: normalizeText(item.description),
        storage_tips: normalizeText(item.storage_tips),
        image_url: normalizeText(item.image_url),
        icon: normalizeText(item.icon),
        auto_created: parseBoolean(item.auto_created),
        needs_moderation: parseBoolean(item.needs_moderation),
        created_by_user_id: normalizeText(item.created_by_user_id),
      };

      payload.icon = resolveIcon({
        icon: payload.icon,
        category: payload.category || undefined,
        canonical_name: payload.canonical_name || undefined,
      });

      if (!payload.id) {
        delete (payload as { id?: string | null }).id;
      }

      return payload;
    };

    const rawItems: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [body];
    const normalized = rawItems
      .map((item: unknown) => buildPayload((item || {}) as Record<string, unknown>))
      .filter((item) => item.canonical_name);

    if (normalized.length === 0) {
      return NextResponse.json({ error: "No valid items provided" }, { status: 400 });
    }

    const seen = new Set<string>();
    const items = normalized.filter((item) => {
      const key = (item.canonical_name || "").toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    const { data, error } = await supabaseAdmin
      .from("product_dictionary")
      .upsert(items, { onConflict: "canonical_name" })
      .select("id, canonical_name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, count: data?.length || 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
