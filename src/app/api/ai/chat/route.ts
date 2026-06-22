// POST /api/ai/chat
// Потоковый AI-чат для кулинарного ассистента.
// Возвращает SSE: сначала чанки текста, потом рецепты (если AI решил их показать).

import { after } from "next/server";
import { verifyUser, checkAndIncrementAiUsage, logTokenUsage, AuthError, FREE_LIMITS } from "@/lib/verifyUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";

// AI сам решает когда показывать рецепты и что именно искать.
// Тег [SEARCH: ...] вырезается из отображаемого текста и используется для embedding-поиска.
const SYSTEM_PROMPT = `## ГЛАВНОЕ ПРАВИЛО (читай первым)

Когда пользователь просит рецепты или спрашивает что приготовить:
— НЕ пиши списки рецептов (1. Блюдо — описание, 2. Блюдо — описание)
— Напиши 1 короткое предложение + добавь тег [SEARCH: слова на английском] в конце
— Система автоматически найдёт рецепты и покажет карточки с фото

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА на «Что приготовить из курицы?»:
«Вот блюда из курицы для ужина. [SEARCH: chicken dinner easy]»

ПРИМЕР НЕПРАВИЛЬНОГО ОТВЕТА (так делать нельзя):
«1. Куриные грудки — замаринуй в лимоне... 2. Курица в духовке — нарежь...»

---

## КТО ТЫ

Ты кулинарный ассистент приложения «Что поесть». Отвечаешь только на кулинарные вопросы: рецепты, ингредиенты, техники, диеты, планирование питания, списки покупок, хранение продуктов.

На НЕкулинарные вопросы (политика, спорт, знаменитости и т.д.) — вежливо откажи одной фразой и предложи спросить про еду.

Запросы о стране, городе, бюджете, семье, языке, магазине — кулинарные, если основная задача связана с едой.

---

## КОГДА ДОБАВЛЯТЬ [SEARCH: ...]

Обязательно для:
— «что приготовить», «что поесть», «дай рецепт», «предложи рецепт»
— «из курицы / рыбы / овощей / [любой продукт]»
— «на завтрак / обед / ужин», «быстрое», «лёгкое», «сытное»
— «случайный рецепт», «удиви меня», «что-нибудь вкусное»
— «из того что есть», «из холодильника»
— «меню на неделю», «составь рацион»

НЕ добавлять:
— вопрос про технику («как жарить», «при какой температуре»)
— замена ингредиента («чем заменить яйца»)
— польза / калорийность продуктов
— уточняющий вопрос по уже найденному рецепту
— режим «AI придумывает» (см. ниже)

Формат тега (строго в конце ответа, 3-5 слов на английском):
[SEARCH: chicken dinner easy]
[SEARCH: quick vegetarian breakfast]
[SEARCH: pasta with tomatoes]

---

## ХОЛОДИЛЬНИК

Список продуктов передаётся в контексте. Используй ТОЛЬКО если пользователь явно просит «из того что есть», «из холодильника», «из того что дома». В остальных случаях — предлагай любые рецепты.

---

## ПРЕДПОЧТЕНИЯ

Точно соблюдай ограничения из запроса:
— «диетическое» / «ПП» → только лёгкие блюда
— «вегетарианское» / «без мяса» → строго без мяса
— «быстрое» / «за 15 минут» → короткое время готовки
— «дешёвое» / «эконом» → простые недорогие продукты

---

## РЕЖИМ «AI ПРИДУМЫВАЕТ»

Если пользователь говорит «придумай», «создай сам», «не ищи в базе», «что-то своё»:
1. Задай 2-3 вопроса одним сообщением (вкусы, ограничения, количество человек, время)
2. После ответов — создай оригинальный рецепт с ингредиентами и шагами
3. [SEARCH: ...] в этом режиме НЕ добавляй

---

Отвечай на языке пользователя. Будь дружелюбным и конкретным.`;

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

// Map common English ingredient names to Russian for DB matching
const EN_TO_RU: Record<string, string> = {
  strawberry: "клубник", strawberries: "клубник",
  apple: "яблок", apples: "яблок",
  chicken: "куриц", beef: "говядин", pork: "свинин",
  potato: "картофел", potatoes: "картофел", tomato: "томат", tomatoes: "томат",
  cheese: "сыр", egg: "яиц", eggs: "яиц", milk: "молок",
  mushroom: "гриб", mushrooms: "гриб",
  carrot: "морков", onion: "лук", garlic: "чеснок",
  pasta: "паст", rice: "рис", salmon: "сёмг",
  lemon: "лимон", orange: "апельсин", banana: "банан",
  cabbage: "капуст", cucumber: "огурц", pepper: "перец",
  shrimp: "кревет", tuna: "тунец", cod: "трески",
  cottage: "творог", cream: "сливк", butter: "масл",
};

// Strip common Russian inflection suffixes for stem search
function stemRu(word: string): string {
  const endings = ["ями","ами","ого","ому","ими","ых","их","ей","ий","ой","ый",
    "ое","ие","ые","ки","ку","ка","ке","ко","ков","ов","ев","и","ы","е","а","у","ю"];
  for (const e of endings) {
    if (word.endsWith(e) && word.length - e.length >= 3) return word.slice(0, -e.length);
  }
  return word;
}

// Ingredient-based search: finds recipes that actually contain the ingredient
async function searchByIngredient(queryWords: string[], budget: number | null = null): Promise<any[]> {
  const stems: string[] = [];
  for (const w of queryWords) {
    const ruStem = EN_TO_RU[w.toLowerCase()];
    if (ruStem) { stems.push(ruStem); continue; }
    // Try Russian stem of the word itself
    const s = stemRu(w.toLowerCase());
    if (s.length >= 3) stems.push(s);
  }
  if (!stems.length) return [];

  const orFilter = stems.map(s => `canonical_name.ilike.%${s}%`).join(",");
  const { data: products } = await supabaseAdmin
    .from("product_dictionary").select("id").or(orFilter).limit(20);
  if (!products?.length) return [];

  const { data: riRows } = await supabaseAdmin
    .from("recipe_ingredients")
    .select("recipe_id, is_main")
    .in("product_dictionary_id", products.map(p => p.id))
    .limit(60);
  if (!riRows?.length) return [];

  // Score: main ingredient = 2 pts, secondary = 1 pt
  const scores: Record<string, number> = {};
  for (const ri of riRows) scores[ri.recipe_id] = (scores[ri.recipe_id] ?? 0) + (ri.is_main ? 2 : 1);

  const topIds = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  let recipesQuery = supabaseAdmin
    .from("recipes")
    .select("id, title, description, image_url, cook_time, difficulty, cuisine_id")
    .in("id", topIds).eq("is_user_defined", false).not("image_url", "is", null);
  if (budget) recipesQuery = recipesQuery.eq("budget_level", budget);
  const { data: recipes } = await recipesQuery.limit(5);

  const map = Object.fromEntries((recipes ?? []).map(r => [r.id, r]));
  return topIds.map(id => map[id]).filter(Boolean);
}

// Детект бюджета по ключевым словам (ru/uk/en) → 1=низкий, 2=средний, 3=высокий, null=любой
function detectBudgetLevel(text: string): number | null {
  const t = text.toLowerCase();
  const low = /\b(дешёв|дешев|деш[еи]вл|бюджетн|эконом|недорог|подешевле|cheap|budget|inexpensive|affordable)/i;
  const high = /\b(дорог|премиум|деликатес|роскош|подорож|expensive|premium|gourmet|fancy|luxur)/i;
  if (low.test(t)) return 1;
  if (high.test(t)) return 3;
  return null;
}

// Помечает рецепты флагом isAccessible на основе типа каталога и подписки пользователя.
// Добавляет поле, не убирает рецепты — iOS сам решает как показывать недоступные.
async function enrichWithAccess(
  recipes: any[],
  isPremium: boolean,
  purchasedCatalogIds: string[]
): Promise<any[]> {
  if (isPremium) return recipes.map((r) => ({ ...r, isAccessible: true }));

  const cuisineIds = [...new Set(recipes.map((r) => r.cuisine_id).filter(Boolean))];
  if (!cuisineIds.length) return recipes.map((r) => ({ ...r, isAccessible: true }));

  const { data: cuisines } = await supabaseAdmin
    .from("cuisines")
    .select("id, type")
    .in("id", cuisineIds);

  const typeMap: Record<string, string> = {};
  for (const c of cuisines ?? []) typeMap[c.id] = c.type;

  const FREE_TYPES = new Set(["free", "gift", "languageGift"]);

  return recipes.map((r) => {
    const cuisineType = typeMap[r.cuisine_id ?? ""] ?? "free";
    const isAccessible =
      FREE_TYPES.has(cuisineType) ||
      purchasedCatalogIds.includes(r.cuisine_id ?? "");
    return { ...r, isAccessible };
  });
}

async function searchRecipes(query: string, apiKey: string, budget: number | null = null, isPremium = false, purchasedCatalogIds: string[] = []) {
  // Extract words from query (e.g. "strawberry cake recipes" → ["strawberry","cake","recipes"])
  const queryWords = query.toLowerCase().replace(/[^a-zа-яёa-z\s]/gi, " ").split(/\s+/).filter(w => w.length > 2);

  // 1. Try ingredient-based search first (most precise)
  const ingredientRows = await searchByIngredient(queryWords, budget);
  if (ingredientRows.length >= 2) {
    const shaped = ingredientRows.map((r) => ({
      id: r.id, title: r.title, description: r.description ?? null,
      image_url: r.image_url ?? null, cook_time: r.cook_time ?? null,
      difficulty: r.difficulty ?? null, cuisine_id: r.cuisine_id ?? null,
    }));
    const enriched = await enrichWithAccess(shaped, isPremium, purchasedCatalogIds);
    return enriched;
  }

  // 2. Fall back to embedding search
  const embedding = await getEmbedding(query, apiKey);
  let rows: any[] = [];
  if (embedding) {
    const { data } = await supabaseAdmin.rpc("match_recipes", {
      query_embedding: embedding, match_count: 5,
      filter_cook_time: null, filter_mood: null, exclude_ids: [],
      filter_budget: budget,
    });
    if (data?.length) rows = data;
  }

  // 3. Last resort: any recipes
  if (!rows.length) {
    let q = supabaseAdmin
      .from("recipes")
      .select("id, title, description, image_url, cook_time, difficulty, cuisine_id")
      .eq("is_user_defined", false).not("image_url", "is", null);
    if (budget) q = q.eq("budget_level", budget);
    const { data } = await q.limit(5);
    rows = data ?? [];
  }

  const shaped = rows.map((r) => ({
    id: r.id, title: r.title, description: r.description ?? null,
    image_url: r.image_url ?? null, cook_time: r.cook_time ?? null,
    difficulty: r.difficulty ?? null, cuisine_id: r.cuisine_id ?? null,
  }));
  return await enrichWithAccess(shaped, isPremium, purchasedCatalogIds);
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
  hour_of_day?: number; // Локальный час пользователя (0-23), передаётся с клиента
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
      await checkAndIncrementAiUsage(user.userId, "ai-chat", FREE_LIMITS.aiChatUsesPerDay);
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

  const { messages = [], pantry_items = [], language = "ru", hour_of_day } = body;

  // Контекст времени суток
  const hour = typeof hour_of_day === "number" ? hour_of_day : new Date().getHours();
  const mealTime =
    hour >= 5  && hour < 11 ? "утро (завтрак)" :
    hour >= 11 && hour < 15 ? "день (обед)" :
    hour >= 15 && hour < 18 ? "полдник / перекус" :
    hour >= 18 && hour < 23 ? "вечер (ужин)" :
    "поздний вечер";
  const timeInstruction = `\n\n[Сейчас у пользователя: ${mealTime}. Если он не уточнил приём пищи — предлагай блюда, подходящие для этого времени суток.]`;

  // Системный промт + контекст холодильника и подписки
  const languageInstruction =
    `\n\nЯзык интерфейса пользователя: ${language}. Отвечай на этом языке, если пользователь явно не попросил другой язык.`;

  const subscriptionInstruction = user.isPremium
    ? `\n\n[Статус пользователя: Premium. Все каталоги рецептов доступны.]`
    : `\n\n[Статус пользователя: Free. Если система покажет карточку рецепта с пометкой недоступен — упомяни в ответе, что есть похожие варианты в доступных рецептах, и предложи поискать ещё.]`;

  const pantryInstruction = pantry_items.length > 0
    ? `\n\n[Контекст холодильника пользователя: ${pantry_items.slice(0, 15).join(", ")}. Используй ТОЛЬКО если пользователь явно просит рецепты из того что есть дома.]`
    : "";

  const systemContent = SYSTEM_PROMPT + languageInstruction + timeInstruction + subscriptionInstruction + pantryInstruction;

  const userMessages = messages.filter((m) => m.role !== "system");
  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...userMessages,
  ];

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
            max_tokens: 1000,
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
          // Бюджет берём из последнего сообщения пользователя + поискового запроса
          const lastUserText = [...userMessages].reverse().find((m) => m.role === "user")?.content ?? "";
          const budget = detectBudgetLevel(`${lastUserText} ${searchQuery}`);
          const recipes = await searchRecipes(searchQuery, apiKey, budget, user.isPremium, user.purchasedCatalogIds);
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
      } catch {
        console.error("[ai/chat] error");
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
