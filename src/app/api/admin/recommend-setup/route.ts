import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const MOOD_TAGS = ["comfort", "light", "energizing", "festive", "quick", "cozy"];

const MIGRATION_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS mood_tags text[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_role text[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fridge_life_days int DEFAULT 1;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS main_ingredient text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS budget_level smallint;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS season text[] DEFAULT ARRAY['all']::text[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_compound_safe boolean DEFAULT true;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS goal_tags text[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS kid_friendly boolean DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS spicy_level smallint DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS recipes_embedding_idx ON recipes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS recipes_mood_tags_idx ON recipes USING gin (mood_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_role ON recipes USING gin (meal_role);
CREATE INDEX IF NOT EXISTS idx_recipes_season ON recipes USING gin (season);
CREATE INDEX IF NOT EXISTS idx_recipes_main_ingredient ON recipes (main_ingredient);
CREATE INDEX IF NOT EXISTS idx_recipes_goal_tags ON recipes USING gin (goal_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_kid_friendly ON recipes (kid_friendly);
CREATE INDEX IF NOT EXISTS idx_recipes_spicy_level ON recipes (spicy_level);
DROP FUNCTION IF EXISTS match_recipes(vector, integer, integer, text, uuid[]);
CREATE OR REPLACE FUNCTION match_recipes(
  query_embedding vector(1536),
  match_count     int DEFAULT 40,
  filter_cook_time int DEFAULT NULL,
  filter_mood     text DEFAULT NULL,
  exclude_ids     uuid[] DEFAULT '{}',
  filter_budget   int DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, description text, image_url text,
  cook_time int, prep_time int, servings int, difficulty text,
  diet_tags text[], mood_tags text[], cuisine_id uuid, similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.title, r.description, r.image_url,
    r.cook_time, r.prep_time, r.servings, r.difficulty,
    r.diet_tags, r.mood_tags, r.cuisine_id,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM recipes r
  WHERE r.is_user_defined = false
    AND r.image_url IS NOT NULL
    AND r.embedding IS NOT NULL
    AND (filter_cook_time IS NULL OR r.cook_time <= filter_cook_time)
    AND (filter_mood IS NULL OR r.mood_tags @> ARRAY[filter_mood])
    AND (filter_budget IS NULL OR r.budget_level = filter_budget)
    AND (array_length(exclude_ids, 1) IS NULL OR r.id != ALL(exclude_ids))
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
`;

async function classifyRecipe(recipe: { id: string; title: string; description: string | null }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a food categorization assistant. Given a recipe, assign one or more mood tags from: comfort, light, energizing, festive, quick, cozy.
- comfort: warming, familiar, rich, soothing dishes
- light: salads, vegetables, fish, low-calorie, fresh dishes
- energizing: high-protein, balanced, bright, breakfast-friendly dishes
- festive: celebration, special occasion, impressive dishes
- quick: simple dishes that are fast to cook
- cozy: soups, stews, baked dishes, cold-weather food
Return ONLY a JSON array, e.g.: ["light"] No explanation.`,
        },
        { role: "user", content: `Recipe: ${recipe.title}\nDescription: ${recipe.description ?? "none"}` },
      ],
      max_tokens: 30,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() ?? '["comfort"]';
  try {
    const tags = JSON.parse(raw);
    const filtered = (tags as string[]).filter((t) => MOOD_TAGS.includes(t));
    return filtered.length ? filtered : ["comfort"];
  } catch {
    return ["comfort"];
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}`);
  const json = await res.json();
  return json.data.map((d: any) => d.embedding);
}

export async function POST(req: NextRequest) {
  const { action } = await req.json();

  // --- Run migration ---
  if (action === "migrate") {
    const statements = MIGRATION_SQL
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    const errors: string[] = [];
    for (const sql of statements) {
      const { error } = await supabaseAdmin.rpc("exec_sql", { sql_query: sql + ";" });
      if (error && !error.message.includes("already exists")) {
        errors.push(error.message);
      }
    }
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors });
    }
    return NextResponse.json({ ok: true, message: "Migration applied" });
  }

  // --- Tag recipes ---
  if (action === "tag") {
    if (!OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const { data: recipes, error } = await supabaseAdmin
      .from("recipes")
      .select("id, title, description")
      .or("mood_tags.is.null,mood_tags.eq.{}")
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!recipes || recipes.length === 0) return NextResponse.json({ ok: true, tagged: 0, message: "All recipes already tagged" });

    let tagged = 0;
    const errors: string[] = [];
    const BATCH = 10;

    for (let i = 0; i < recipes.length; i += BATCH) {
      const batch = recipes.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const tags = await classifyRecipe(r);
          await supabaseAdmin.from("recipes").update({ mood_tags: tags }).eq("id", r.id);
          return tags;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") tagged++;
        else errors.push(String(r.reason));
      }
      if (i + BATCH < recipes.length) await new Promise((r) => setTimeout(r, 1000));
    }

    return NextResponse.json({ ok: true, tagged, total: recipes.length, errors });
  }

  // --- Embed recipes ---
  if (action === "embed") {
    if (!OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const { data: recipes, error } = await supabaseAdmin
      .from("recipes")
      .select("id, title, description, mood_tags, diet_tags, difficulty, cook_time")
      .is("embedding", null)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!recipes || recipes.length === 0) return NextResponse.json({ ok: true, embedded: 0, message: "All recipes already embedded" });

    let embedded = 0;
    const errors: string[] = [];
    const BATCH = 20;

    for (let i = 0; i < recipes.length; i += BATCH) {
      const batch = recipes.slice(i, i + BATCH);
      const texts = batch.map((r: any) =>
        [r.title, r.description, r.mood_tags?.length ? `Mood: ${r.mood_tags.join(", ")}` : "", r.diet_tags?.length ? `Diet: ${r.diet_tags.join(", ")}` : "", r.difficulty ? `Difficulty: ${r.difficulty}` : "", r.cook_time ? `Cook time: ${r.cook_time} min` : ""]
          .filter(Boolean).join(". ")
      );
      try {
        const embeddings = await embedBatch(texts);
        await Promise.all(batch.map((r: any, idx: number) => supabaseAdmin.from("recipes").update({ embedding: embeddings[idx] }).eq("id", r.id)));
        embedded += batch.length;
      } catch (err) {
        errors.push(String(err));
      }
      if (i + BATCH < recipes.length) await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({ ok: true, embedded, total: recipes.length, errors });
  }

  // --- Stats ---
  if (action === "stats") {
    const [total, untagged, unembedded] = await Promise.all([
      supabaseAdmin.from("recipes").select("id", { count: "exact", head: true }).eq("is_user_defined", false),
      supabaseAdmin.from("recipes").select("id", { count: "exact", head: true }).eq("is_user_defined", false).or("mood_tags.is.null,mood_tags.eq.{}"),
      supabaseAdmin.from("recipes").select("id", { count: "exact", head: true }).eq("is_user_defined", false).is("embedding", null),
    ]);
    return NextResponse.json({
      total: total.count ?? 0,
      untagged: untagged.count ?? 0,
      unembedded: unembedded.count ?? 0,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
