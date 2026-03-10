import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Wake-up ping (Render free tier cold-start)
export async function GET() {
  return NextResponse.json({ ok: true });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";

interface RecommendationAnswers {
  maxCookTime?: number | null;
  mood: "light" | "hearty" | "new" | "junk" | "usual";
  pantryIngredients: string[];
  excludedIngredients: string[];
  servings: number;
}

interface RequestBody {
  answers: RecommendationAnswers;
  favoriteRecipeTitles: string[];
  excludedRecipeIds: string[];
  language: string;
}

const MOOD_LABELS: Record<string, string> = {
  light:  "лёгкое и полезное",
  hearty: "сытное",
  new:    "что-то новое",
  junk:   "фастфуд или что-то вредное",
  usual:  "как обычно",
};

// Build a natural-language query for embedding from user answers
function buildQueryText(answers: RecommendationAnswers): string {
  const moodMap: Record<string, string> = {
    light:  "light healthy food, salad, soup, vegetables, low calorie",
    hearty: "hearty filling meal, meat, pasta, stew, satisfying",
    junk:   "junk food, fast food, burger, pizza, fried snacks",
    usual:  "simple everyday home cooking",
    new:    "interesting new dish, something different",
  };
  const parts = [
    moodMap[answers.mood] ?? answers.mood,
    answers.maxCookTime ? `ready in ${answers.maxCookTime} minutes` : "",
    answers.pantryIngredients.length ? `using ${answers.pantryIngredients.join(", ")}` : "",
    answers.excludedIngredients.length ? `without ${answers.excludedIngredients.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

// Get embedding vector for a text
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[recommend] unhandled error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { answers: rawAnswers, favoriteRecipeTitles = [], excludedRecipeIds = [], language = "ru" } = body;
  const answers: RecommendationAnswers = {
    ...rawAnswers,
    pantryIngredients: rawAnswers.pantryIngredients ?? [],
    excludedIngredients: rawAnswers.excludedIngredients ?? [],
  };
  if (!answers) {
    return NextResponse.json({ error: "missing_answers" }, { status: 400 });
  }

  // --- Run embedding + fallback DB query in parallel ---
  const queryText = buildQueryText(answers);

  let fallbackQuery = supabaseAdmin
    .from("recipes")
    .select("id, title, description, image_url, cook_time, prep_time, servings, difficulty, diet_tags, cuisine_id, translations")
    .eq("is_user_defined", false)
    .not("image_url", "is", null);
  if (answers.mood !== "new" && answers.mood !== "usual") {
    fallbackQuery = fallbackQuery.contains("mood_tags", [answers.mood]);
  }
  if (answers.maxCookTime) {
    fallbackQuery = fallbackQuery.lte("cook_time", answers.maxCookTime);
  }
  if (answers.mood === "new" && excludedRecipeIds.length > 0) {
    fallbackQuery = fallbackQuery.not("id", "in", `(${excludedRecipeIds.join(",")})`);
  }

  const [embedding, fallbackResult] = await Promise.all([
    getEmbedding(queryText),
    fallbackQuery.limit(40),
  ]);

  let rows: any[] | null = null;

  if (embedding) {
    const { data, error } = await supabaseAdmin.rpc("match_recipes", {
      query_embedding: embedding,
      match_count: 40,
      filter_cook_time: answers.maxCookTime ?? null,
      filter_mood: answers.mood !== "new" ? answers.mood : null,
      exclude_ids: answers.mood === "new" && excludedRecipeIds.length > 0 ? excludedRecipeIds : [],
    });
    if (!error && data && data.length > 0) rows = data;
  }

  if (!rows || rows.length === 0) {
    rows = (!fallbackResult.error && fallbackResult.data?.length) ? fallbackResult.data : null;
  }

  // --- Last fallback: any 8 recipes ---
  if (!rows || rows.length === 0) {
    const { data } = await supabaseAdmin
      .from("recipes")
      .select("id, title, description, image_url, cook_time, prep_time, servings, difficulty, diet_tags, cuisine_id, translations")
      .not("image_url", "is", null)
      .limit(8);
    rows = data ?? [];
  }

  // Shuffle and pick 8
  const selected = rows.sort(() => Math.random() - 0.5).slice(0, 8);

  const aiMessage = await generateAiMessage(answers, selected, favoriteRecipeTitles, language);
  return buildResponse(selected, aiMessage, answers);
}

function buildResponse(rows: any[], aiMessage: string, answers: RecommendationAnswers) {
  const recipes = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    imageUrl: r.image_url ?? null,
    cookTime: r.cook_time ?? null,
    prepTime: r.prep_time ?? null,
    servings: r.servings ?? null,
    difficulty: r.difficulty ?? null,
    dietTags: r.diet_tags ?? [],
    cuisineId: r.cuisine_id ?? null,
  }));
  return NextResponse.json({
    recipes,
    ai_message: aiMessage || `Нашёл ${recipes.length} рецептов под настроение «${MOOD_LABELS[answers.mood] ?? "разное"}». Выбирай!`,
  });
}

async function generateAiMessage(
  answers: RecommendationAnswers,
  recipes: any[],
  favTitles: string[],
  language: string
): Promise<string> {
  if (!OPENAI_API_KEY) return "";
  const langNames: Record<string, string> = {
    ru: "русском", uk: "украинском", en: "английском", de: "немецком",
    es: "испанском", fr: "французском", it: "итальянском", "pt-BR": "португальском",
  };
  const prompt = `Пользователь хочет поесть. Контекст:
- Настроение: ${MOOD_LABELS[answers.mood] ?? answers.mood}
- Время: ${answers.maxCookTime ? `до ${answers.maxCookTime} мин` : "неважно"}
- Холодильник: ${answers.pantryIngredients.join(", ") || "не указано"}
- Не хочет: ${answers.excludedIngredients.join(", ") || "ничего"}
- Любимые рецепты: ${favTitles.slice(0, 5).join(", ") || "нет данных"}
- Найденные рецепты: ${recipes.map((r) => r.title).join(", ")}

Напиши 1–2 дружелюбных предложения на ${langNames[language] ?? "русском"} языке о найденных рецептах. Без emoji. Коротко.`;

  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}
