// POST /api/ai/chat
// Потоковый AI-чат для кулинарного ассистента.
// Возвращает SSE: сначала чанки текста, потом рецепты (если AI решил их показать).

import { after } from "next/server";
import { verifyUser, checkAndIncrementAiUsage, logTokenUsage, AuthError } from "@/lib/verifyUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";

// AI сам решает когда показывать рецепты и что именно искать.
// Тег [SEARCH: ...] вырезается из отображаемого текста и используется для embedding-поиска.
const SYSTEM_PROMPT = `Ты кулинарный ассистент приложения «Что поесть». Отвечай ТОЛЬКО на кулинарные вопросы:
— рецепты и способы приготовления
— ингредиенты, замены, сочетания продуктов
— техники готовки и кухонное оборудование
— диеты, питание и калорийность
— хранение продуктов и планирование меню

На любые НЕкулинарные вопросы (политика, история, знаменитости, спорт, медицина вне питания и т.д.) — вежливо откажи одним предложением и предложи спросить про еду.

ВАЖНО — теги для поиска рецептов:
Если пользователь хочет конкретные рецепты или блюда — в самом конце своего ответа добавь тег:
[SEARCH: <запрос на английском для поиска, 3-8 слов, описывает нужные блюда>]
Пример: [SEARCH: quick pasta dinner tomato sauce italian]
Если рецепты не нужны (вопрос про технику, замену ингредиента, советы) — тег НЕ добавляй.
Тег невидим пользователю — он только для внутреннего поиска.

Отвечай на языке пользователя. Будь дружелюбным, кратким и конкретным.`;

// Регулярное выражение для извлечения тега [SEARCH: ...]
const SEARCH_TAG_RE = /\[SEARCH:\s*([^\]]+)\]/i;

function extractSearchQuery(text: string): { clean: string; query: string | null } {
  const match = text.match(SEARCH_TAG_RE);
  if (!match) return { clean: text, query: null };
  const query = match[1].trim();
  const clean = text.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
  return { clean, query };
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

function sseChunk(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

interface ChatMessage {
  role: string;
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  pantry_items?: string[];
  language?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), { status: 500 });
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
      return new Response(JSON.stringify({ error: e.message, reason: e.reason }), {
        status: e.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400 });
  }

  const { messages = [], pantry_items = [], language = "ru" } = body;

  // Всегда подставляем наш системный промт первым
  const chatMessages: ChatMessage[] =
    messages[0]?.role === "system"
      ? [{ role: "system", content: SYSTEM_PROMPT }, ...messages.slice(1)]
      : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  // Если есть продукты из кладовки — добавляем контекст к последнему сообщению пользователя
  if (pantry_items.length > 0) {
    const lastUserIdx = [...chatMessages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx !== -1) {
      const realIdx = chatMessages.length - 1 - lastUserIdx;
      chatMessages[realIdx] = {
        ...chatMessages[realIdx],
        content:
          chatMessages[realIdx].content +
          `\n\n[Доступные продукты у пользователя: ${pantry_items.slice(0, 10).join(", ")}]`,
      };
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      let accumulatedText = "";

      try {
        const openAIRes = await fetch(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages: chatMessages,
            stream: true,
            temperature: 0.75,
            max_tokens: 600,
          }),
        });

        if (!openAIRes.ok || !openAIRes.body) {
          controller.enqueue(sseChunk({ error: "AI service error", done: true }));
          controller.close();
          return;
        }

        const reader = openAIRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (raw === "[DONE]") break;

            try {
              const parsed = JSON.parse(raw);
              const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulatedText += delta;
                // Стримим дельту, но вырезаем тег [SEARCH:...] если он начал появляться
                // Тег всегда в конце, поэтому просто передаём дельту как есть —
                // клиент получит тег в потоке, но iOS-сторона его не показывает
                // (финальный clean-текст придёт отдельным событием)
                controller.enqueue(sseChunk({ delta }));
              }
              if (parsed.usage) totalUsage = parsed.usage;
            } catch {
              // ignore malformed chunks
            }
          }
        }

        // Извлекаем тег [SEARCH: ...] из полного ответа
        const { clean: cleanText, query: searchQuery } = extractSearchQuery(accumulatedText);

        // Отправляем финальный чистый текст (без тега) и рецепты
        if (searchQuery) {
          const recipes = await searchRecipes(searchQuery, apiKey);
          controller.enqueue(
            sseChunk({
              // clean_text нужен чтобы iOS заменил стриминговый текст (с тегом) на чистый
              clean_text: cleanText,
              recipes: recipes.length > 0 ? recipes : [],
              done: true,
            })
          );
        } else {
          controller.enqueue(sseChunk({ clean_text: cleanText, done: true }));
        }
      } catch (err) {
        console.error("[ai/chat] error:", err);
        controller.enqueue(sseChunk({ error: "Stream interrupted", done: true }));
      } finally {
        controller.close();
      }

      if (totalUsage.total_tokens > 0) {
        after(() => logTokenUsage(user.userId, "ai-chat", totalUsage));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
