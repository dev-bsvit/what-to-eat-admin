import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProductRow = {
  id: string;
  canonical_name: string | null;
  category: string | null;
  icon: string | null;
};

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

function resolveIcon(row: ProductRow) {
  const current = (row.icon || "").trim();
  if (current && current !== "🍽️") {
    return current;
  }
  const name = (row.canonical_name || "").toLowerCase();
  for (const rule of keywordIcons) {
    if (rule.match.test(name)) {
      return rule.icon;
    }
  }
  const category = (row.category || "other").toLowerCase();
  return categoryIcons[category] || "📦";
}

export async function POST() {
  try {
    const { data: nullIconRows, error: nullError } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, category, icon")
      .is("icon", null);

    if (nullError) {
      return NextResponse.json({ error: nullError.message }, { status: 400 });
    }

    const { data: placeholderRows, error: placeholderError } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, category, icon")
      .eq("icon", "🍽️");

    if (placeholderError) {
      return NextResponse.json({ error: placeholderError.message }, { status: 400 });
    }

    const rowMap = new Map<string, ProductRow>();
    (nullIconRows || []).forEach((row) => rowMap.set(row.id, row as ProductRow));
    (placeholderRows || []).forEach((row) => rowMap.set(row.id, row as ProductRow));
    const rows = Array.from(rowMap.values());
    const updates = rows
      .map((row) => ({
        id: row.id,
        canonical_name: row.canonical_name,
        category: row.category || "other",
        icon: resolveIcon(row),
      }))
      .filter((row) => row.icon && row.icon !== "🍽️" && row.canonical_name);

    if (updates.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("product_dictionary")
      .upsert(updates, { onConflict: "id" });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ updated: updates.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
