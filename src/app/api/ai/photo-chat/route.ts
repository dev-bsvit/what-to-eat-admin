// POST /api/ai/photo-chat
// One-shot photo cooking assistant: analyze products on the image, answer the user's
// cooking question, and optionally return matching recipe cards. Counts as one AI use.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { verifyUser, checkAndIncrementAiUsage, logTokenUsage, AuthError } from "@/lib/verifyUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";

interface RequestBody {
  imageBase64?: string;
  caption?: string | null;
  pantry_items?: string[];
  language?: string;
}

interface PhotoChatResult {
  products?: string[];
  ai_message?: string;
  search_query?: string | null;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function searchRecipes(query: string, apiKey: string) {
  const embedding = await getEmbedding(query, apiKey);
  let rows: any[] = [];

  if (embedding) {
    const { data } = await supabaseAdmin.rpc("match_recipes", {
      query_embedding: embedding,
      match_count: 5,
      filter_cook_time: null,
      filter_mood: null,
      exclude_ids: [],
    });
    if (data?.length) rows = data;
  }

  if (!rows.length) {
    const { data } = await supabaseAdmin
      .from("recipes")
      .select("id, title, description, image_url, cook_time, difficulty, cuisine_id")
      .eq("is_user_defined", false)
      .not("image_url", "is", null)
      .limit(5);
    rows = data ?? [];
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    cook_time: r.cook_time ?? null,
    difficulty: r.difficulty ?? null,
    cuisine_id: r.cuisine_id ?? null,
  }));
}

function parsePhotoChatResult(content: string): PhotoChatResult {
  const parsed = JSON.parse(content);
  return {
    products: Array.isArray(parsed.products) ? parsed.products.filter((p: unknown) => typeof p === "string") : [],
    ai_message: typeof parsed.ai_message === "string" ? parsed.ai_message.trim() : "",
    search_query: typeof parsed.search_query === "string" ? parsed.search_query.trim() : null,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let user: Awaited<ReturnType<typeof verifyUser>>;
  let body: RequestBody;

  try {
    user = await verifyUser(request);
    if (!user.isPremium) {
      await checkAndIncrementAiUsage(user.userId);
    }
    body = await request.json();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message, reason: e.reason }, { status: e.status });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { imageBase64, caption, pantry_items = [], language = "ru" } = body;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing imageBase64 field" }, { status: 400 });
  }

  const userQuestion = caption?.trim() || "Что можно приготовить из продуктов на фото?";
  const pantryContext = pantry_items.length
    ? `\n\nКонтекст холодильника пользователя: ${pantry_items.slice(0, 15).join(", ")}. Не используй его для этого фото-запроса, если пользователь явно не попросил добавить продукты из дома.`
    : "";

  const systemPrompt = `Ты кулинарный ассистент приложения «Что поесть».
Проанализируй фото продуктов и ответь на вопрос пользователя.

Правила:
- Слова «это», «этого», «из этого» относятся к продуктам на фото.
- Используй продукты на фото как основной контекст.
- Не используй список холодильника/«что есть дома», если пользователь явно не попросил добавить продукты оттуда.
- Если на фото не видно пищевых продуктов, ai_message должен сказать, что продукты не удалось распознать, products — пустой массив, search_query — null.
- Отвечай на языке интерфейса: ${language}, если пользователь явно не попросил другой язык.
- Будь кратким и конкретным.

Верни строго JSON:
{
  "products": ["название продукта", "..."],
  "ai_message": "ответ пользователю",
  "search_query": "3-5 English words for recipe search or null"
}

search_query заполняй только если пользователь просит что приготовить/рецепт/идею блюда.${pantryContext}`;

  try {
    const openAIRes = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userQuestion },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 700,
        temperature: 0.45,
        response_format: { type: "json_object" },
      }),
    });

    if (!openAIRes.ok) {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const json = await openAIRes.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }

    const result = parsePhotoChatResult(content);
    const recipes = result.search_query ? await searchRecipes(result.search_query, apiKey) : [];

    if (json.usage) {
      after(() => logTokenUsage(user.userId, "photo-chat", json.usage));
    }

    return NextResponse.json({
      products: result.products ?? [],
      ai_message: result.ai_message ?? "",
      recipes,
    });
  } catch (e) {
    console.error("[photo-chat] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
