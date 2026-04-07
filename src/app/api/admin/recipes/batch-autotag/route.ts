import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const ALLOWED_TAGS = [
  "quick", "special occasion",
  "light", "hearty",
  "breakfast", "lunch", "dinner", "snack",
  "vegetarian", "vegan", "gluten-free", "dairy-free",
  "soup", "salad", "pasta", "grill", "baking", "raw",
];

async function classifyTags(recipe: {
  title: string;
  description: string | null;
  difficulty: string | null;
  prep_time: number | null;
  cook_time: number | null;
}): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  // Auto-classify time tags without AI
  const autoTags: string[] = [];
  if (totalTime > 0) {
    if (totalTime <= 20) autoTags.push("quick");
    if (totalTime > 60) autoTags.push("special occasion");
  } else if (!totalTime) {
    if (recipe.difficulty === "easy") autoTags.push("quick");
    if (recipe.difficulty === "hard") autoTags.push("special occasion");
  }

  // Use AI only for the semantic tags (meal type, diet, dish type)
  const semanticTags = ALLOWED_TAGS.filter(
    (t) => !["quick", "special occasion", "light", "hearty"].includes(t)
  );

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You classify recipes. Pick tags from this list only: ${semanticTags.join(", ")}.
Rules:
- breakfast: morning dishes, oatmeal, eggs, pancakes, smoothies
- lunch/dinner: main meals, meat, fish, pasta, rice
- snack: small bites, appetizers, dips, crackers
- vegetarian: no meat/fish (eggs/dairy OK)
- vegan: no animal products at all
- gluten-free: no wheat/rye/barley
- dairy-free: no milk/cheese/cream
- soup: any liquid dish, broth, stew, chowder
- salad: cold mixed dishes with greens or vegetables
- pasta: pasta, noodles, spaghetti, lasagna
- grill: grilled, BBQ, skewers, roasted on open fire
- baking: cakes, cookies, bread, oven dishes
- raw: no cooking required, carpaccio, smoothies, fresh dishes
Return ONLY a JSON array. Example: ["dinner","vegetarian","soup"]`,
        },
        {
          role: "user",
          content: `Recipe: ${recipe.title}\nDescription: ${recipe.description ?? "none"}`,
        },
      ],
      max_tokens: 60,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";

  let aiTags: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      aiTags = parsed.filter((t: unknown) => typeof t === "string" && semanticTags.includes(t));
    }
  } catch {
    aiTags = [];
  }

  const all = [...new Set([...autoTags, ...aiTags])];
  return all;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const onlyEmpty = body.only_empty !== false; // default: only untagged

    let query = supabaseAdmin
      .from("recipes")
      .select("id, title, description, difficulty, prep_time, cook_time")
      .order("created_at", { ascending: true })
      .limit(200);

    if (onlyEmpty) {
      query = query.or("tags.is.null,tags.eq.{}");
    }

    const { data: recipes, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!recipes || recipes.length === 0) {
      return NextResponse.json({ ok: true, tagged: 0, message: "No recipes to tag" });
    }

    let tagged = 0;
    const errors: string[] = [];
    const BATCH = 5;

    for (let i = 0; i < recipes.length; i += BATCH) {
      const batch = recipes.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const tags = await classifyTags(r as any);
          if (tags.length > 0) {
            await supabaseAdmin.from("recipes").update({ tags }).eq("id", r.id);
          }
          return tags;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") tagged++;
        else errors.push(String(r.reason));
      }
      if (i + BATCH < recipes.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return NextResponse.json({ ok: true, tagged, total: recipes.length, errors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
