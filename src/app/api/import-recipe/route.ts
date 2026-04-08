import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

// Интерфейс для импортированного рецепта
interface ImportedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: number; // минуты
  cookTime?: number; // минуты
  servings?: number;
  cuisine?: string;
  tags: string[];
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    note?: string;
  }>;
  steps: Array<{
    text: string;
  }>;
  sourceUrl: string;
  sourceDomain?: string;
  confidence: "high" | "medium" | "low"; // Уверенность в качестве парсинга
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    console.log("🌐 Импорт рецепта из:", url);

    // Загружаем HTML страницы с реалистичными headers
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8,de;q=0.7,fr;q=0.6,es;q=0.5,it;q=0.4",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    let html = "";
    let usedPuppeteerFallback = false;

    if (!response.ok) {
      console.error("❌ Ошибка загрузки:", response.status, response.statusText);

      // Если сайт блокирует обычный fetch (403/404), пробуем Puppeteer
      if (response.status === 403 || response.status === 404 || response.status === 503) {
        console.log("🔄 Сайт блокирует запросы, пробуем Puppeteer...");
        try {
          const puppeteerRecipe = await extractWithPuppeteer(url);
          if (puppeteerRecipe && puppeteerRecipe.title) {
            // Puppeteer сработал, возвращаем результат сразу
            return NextResponse.json({
              success: true,
              recipe: puppeteerRecipe,
              meta: {
                url,
                parsedAt: new Date().toISOString(),
                method: "Puppeteer (site blocked regular fetch)",
              },
            });
          }
        } catch (puppeteerError) {
          console.log("⚠️ Puppeteer также не смог загрузить:", puppeteerError);
        }
      }

      return NextResponse.json(
        { error: "Failed to fetch URL", details: response.statusText },
        { status: 400 }
      );
    }

    html = await response.text();
    console.log("✅ HTML загружен, размер:", html.length, "байт");

    // Пытаемся извлечь рецепт разными способами
    let recipe: ImportedRecipe | null = null;
    let method = "";

    // 1. Сначала пробуем специфичные парсеры для известных сайтов (более точные)
    recipe = extractFromKnownSites(html, url);
    if (recipe) {
      method = "Site-specific parser";
      console.log("✅ Рецепт извлечён через специфичный парсер");
    }

    // 2. Если нет специфичного парсера - пробуем JSON-LD Schema.org
    if (!recipe) {
      recipe = extractFromJsonLD(html, url);
      if (recipe) {
        method = "JSON-LD Schema.org";
        console.log("✅ Рецепт извлечён через JSON-LD");
      }
    }

    // 3. Запасной вариант: OpenGraph + базовый парсинг HTML
    if (!recipe) {
      recipe = extractFromOpenGraphAndHtml(html, url);
      method = "OpenGraph + HTML fallback";
      console.log("⚠️ Рецепт извлечён через fallback (низкое качество)");
    }

    // 4. Если результат плохой (нет ингредиентов или шагов) - пробуем Puppeteer
    if (recipe && recipe.confidence === "low" && (recipe.ingredients.length === 0 || recipe.steps.length === 0)) {
      console.log("🔄 Попытка парсинга через Puppeteer (SPA сайт)...");
      try {
        const puppeteerRecipe = await extractWithPuppeteer(url);
        if (puppeteerRecipe && (puppeteerRecipe.ingredients.length > 0 || puppeteerRecipe.steps.length > 0)) {
          recipe = puppeteerRecipe;
          method = "Puppeteer (JavaScript render)";
          console.log("✅ Рецепт извлечён через Puppeteer");
        }
      } catch (puppeteerError) {
        console.log("⚠️ Puppeteer не смог извлечь рецепт:", puppeteerError);
      }
    }

    if (!recipe) {
      return NextResponse.json(
        {
          error: "Recipe not found",
          message: "Не удалось найти рецепт на этой странице. Попробуйте другую ссылку или добавьте рецепт вручную.",
        },
        { status: 404 }
      );
    }

    // 5. Авто-теги на основе числовых данных (всегда, без AI)
    const autoTags = autoClassifyTagsFromData(recipe);
    for (const t of autoTags) {
      if (!recipe.tags.includes(t)) recipe.tags.push(t);
    }

    // 6. AI доработка — запускаем если данные неполные ИЛИ нет семантических тегов
    const needsAiCleanup =
      recipe.ingredients.length === 0 ||
      recipe.steps.length === 0 ||
      recipe.confidence === "low";

    const missingSemanticTags = !SEMANTIC_TAGS.some((t: string) => recipe.tags.includes(t));
    const needsAiTags = missingSemanticTags;

    if ((needsAiCleanup || needsAiTags) && process.env.OPENAI_API_KEY) {
      console.log("🤖 Запуск AI доработки рецепта...");
      try {
        const aiResult = await cleanupRecipeWithAI(recipe, needsAiCleanup);
        if (aiResult) {
          if (needsAiCleanup) {
            if (aiResult.ingredients.length > recipe.ingredients.length) {
              recipe.ingredients = aiResult.ingredients;
            }
            if (aiResult.steps.length > recipe.steps.length) {
              recipe.steps = aiResult.steps;
            }
            if (recipe.ingredients.length > 0 && recipe.steps.length > 0) {
              recipe.confidence = "medium";
            }
          }
          // Мёрджим теги из AI (не дублируем)
          for (const t of aiResult.tags) {
            if (!recipe.tags.includes(t)) recipe.tags.push(t);
          }
          method = method + (needsAiCleanup ? " + AI cleanup" : "") + (aiResult.tags.length ? " + AI tags" : "");
          console.log("✅ AI доработка завершена, теги:", aiResult.tags);
        }
      } catch (aiError) {
        console.log("⚠️ AI доработка не удалась:", aiError);
      }
    }

    return NextResponse.json({
      recipe,
      meta: {
        method,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Ошибка импорта рецепта:", error);
    return NextResponse.json(
      {
        error: "Import failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Теги: константы и авто-классификация
// ============================================================================

// Теги, которые AI определяет по смыслу (тип блюда, диета, приём пищи)
const SEMANTIC_TAGS = [
  "breakfast", "lunch", "dinner", "snack",
  "vegetarian", "vegan", "gluten-free", "dairy-free",
  "soup", "salad", "pasta", "grill", "baking", "raw",
  "light", "hearty",
];

// Все допустимые теги (включая временны́е)
const ALLOWED_TAGS = [
  "quick", "special occasion",
  ...SEMANTIC_TAGS,
];

/** Авто-теги на основе числовых полей рецепта — без AI, работает всегда */
function autoClassifyTagsFromData(recipe: ImportedRecipe): string[] {
  const tags: string[] = [];
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  if (totalTime > 0) {
    if (totalTime <= 20) tags.push("quick");
    if (totalTime > 60) tags.push("special occasion");
  }

  return tags;
}

// ============================================================================
// AI Cleanup функция
// ============================================================================

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function cleanupRecipeWithAI(
  recipe: ImportedRecipe,
  fixContent: boolean
): Promise<{
  ingredients: Array<{ name: string; amount: string; unit: string }>;
  steps: Array<{ text: string }>;
  tags: string[];
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const hasIngredients = recipe.ingredients.length > 0;
  const hasSteps = recipe.steps.length > 0;
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  // Задача для контентной части
  let contentTask = "";
  if (fixContent) {
    if (!hasIngredients && !hasSteps) {
      contentTask = "1. Extract OR infer ingredients and steps. If not enough info — create a typical recipe for this dish.";
    } else if (!hasIngredients) {
      contentTask = "1. Extract/infer ingredients with amounts from steps or dish name.";
    } else if (!hasSteps) {
      contentTask = "1. Create 3-6 logical cooking steps based on the ingredients.";
    } else {
      contentTask = "1. Clean ingredients/steps: remove duplicates, fix formatting, fill missing amounts.";
    }
  }

  const prompt = `You are a recipe data assistant. Complete ALL tasks below for the given recipe.

${fixContent ? contentTask + "\n" : ""}2. Pick tags from this exact list ONLY: ${ALLOWED_TAGS.join(", ")}

Tag rules:
- quick: total cooking time ≤ 20 min
- special occasion: total cooking time > 60 min OR fancy/gourmet dish
- light: salads, soups, low-calorie dishes (< 300 kcal)
- hearty: filling, high-calorie dishes (> 650 kcal), stews, meat mains
- breakfast: morning dishes — oatmeal, eggs, pancakes, smoothies
- lunch/dinner: main meals — meat, fish, pasta, rice dishes
- snack: small bites, appetizers, dips
- vegetarian: no meat or fish (eggs/dairy OK)
- vegan: no animal products at all
- gluten-free: no wheat/rye/barley
- dairy-free: no milk/cheese/cream/butter
- soup: any liquid dish, broth, stew, chowder
- salad: cold mixed dishes with greens or vegetables
- pasta: pasta, noodles, spaghetti, lasagna
- grill: grilled, BBQ, skewers, open-fire cooking
- baking: cakes, cookies, bread, oven dishes
- raw: no cooking required

Recipe: ${recipe.title}
${recipe.description ? `Description: ${recipe.description.slice(0, 400)}` : ""}
Total time: ${totalTime > 0 ? `${totalTime} min` : "unknown"}
${hasIngredients ? `Ingredients: ${JSON.stringify(recipe.ingredients.slice(0, 15).map(i => ({ n: i.name, a: i.amount, u: i.unit })))}` : ""}
${hasSteps ? `Steps: ${recipe.steps.slice(0, 8).map(s => s.text.slice(0, 200)).join(" | ")}` : ""}

CRITICAL: Return valid JSON only. Keep ORIGINAL language (Russian/English) — do NOT translate.
${fixContent ? `NEVER return empty ingredients or steps arrays — infer if needed.
` : ""}
Return format:
{
  "ingredients": [{"name": "...", "amount": "...", "unit": "..."}],
  "steps": [{"text": "..."}],
  "tags": ["...", "..."]
}`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

    const validTags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t: unknown) => String(t).trim().toLowerCase())
          .filter((t: string) => ALLOWED_TAGS.includes(t))
      : [];

    return {
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients
            .map((i: any) => ({
              name: String(i.name || "").trim(),
              amount: String(i.amount || "").trim(),
              unit: String(i.unit || "").trim(),
            }))
            .filter((i: any) => i.name.length > 0)
        : recipe.ingredients,
      steps: Array.isArray(parsed.steps)
        ? parsed.steps
            .map((s: any) => ({ text: String(s.text || s || "").trim() }))
            .filter((s: any) => s.text.length > 0)
        : recipe.steps,
      tags: validTags,
    };
  } catch (error) {
    console.error("AI cleanup error:", error);
    return null;
  }
}

// ============================================================================
// 1. Извлечение из JSON-LD Schema.org
// ============================================================================

function extractFromJsonLD(html: string, sourceUrl: string): ImportedRecipe | null {
  try {
    // Ищем все <script type="application/ld+json">
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const matches: RegExpExecArray[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      matches.push(match);
    }

    for (const match of matches) {
      try {
        const jsonString = match[1].trim();
        const data = JSON.parse(jsonString);

        // Ищем рецепт в JSON (может быть вложен в @graph или массив)
        const recipe = findRecipeInJson(data);
        if (recipe) {
          return parseRecipeFromJsonLD(recipe, sourceUrl, html);
        }
      } catch (e) {
        console.log("⚠️ Ошибка парсинга JSON-LD блока:", e);
        continue;
      }
    }
  } catch (e) {
    console.log("⚠️ Ошибка поиска JSON-LD:", e);
  }

  return null;
}

function findRecipeInJson(data: any): any {
  if (!data) return null;

  // Если это объект с @type: "Recipe"
  if (data["@type"]) {
    const type = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
    if (type.some((t: string) => t.toLowerCase().includes("recipe"))) {
      return data;
    }
  }

  // Ищем в @graph
  if (data["@graph"] && Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const found = findRecipeInJson(item);
      if (found) return found;
    }
  }

  // Ищем в массиве
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJson(item);
      if (found) return found;
    }
  }

  // Ищем в mainEntity (для QAPage и т.д.)
  if (data.mainEntity) {
    const found = findRecipeInJson(data.mainEntity);
    if (found) return found;
  }

  return null;
}

function parseRecipeFromJsonLD(data: any, sourceUrl: string, html?: string): ImportedRecipe {
  const domain = new URL(sourceUrl).hostname;

  let ingredients = parseIngredients(data.recipeIngredient);
  let steps = parseInstructions(data.recipeInstructions);
  let confidence: "high" | "medium" | "low" = "high";

  // Если JSON-LD неполный и у нас есть HTML - дополняем данные
  if (html && (ingredients.length === 0 || steps.length === 0)) {
    console.log("⚠️ JSON-LD неполный, дополняем из HTML...");
    console.log(`  Текущие ингредиенты: ${ingredients.length}, шаги: ${steps.length}`);
    const htmlData = extractIngredientsAndStepsFromHtml(html);
    console.log(`  Извлечено из HTML: ${htmlData.ingredients.length} ингредиентов, ${htmlData.steps.length} шагов`);

    if (ingredients.length === 0 && htmlData.ingredients.length > 0) {
      ingredients = htmlData.ingredients;
      console.log(`✅ Извлечено ${ingredients.length} ингредиентов из HTML`);
    }

    if (steps.length === 0 && htmlData.steps.length > 0) {
      steps = htmlData.steps;
      console.log(`✅ Извлечено ${steps.length} шагов из HTML`);
    } else if (steps.length === 0) {
      console.log(`⚠️ Шаги не найдены! HTML steps: ${htmlData.steps.length}`);
    }

    // Понижаем confidence, если пришлось дополнять
    confidence = "medium";
  }

  return {
    title: getString(data.name) || "Рецепт",
    description: getString(data.description),
    imageUrl: getImageUrl(data.image),
    prepTime: parseDuration(data.prepTime),
    cookTime: parseDuration(data.cookTime) || parseDuration(data.totalTime),
    servings: parseServings(data.recipeYield),
    cuisine: getString(data.recipeCuisine),
    tags: getStringArray(data.keywords),
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: domain,
    confidence,
  };
}

// ============================================================================
// 2. Парсеры для специфичных сайтов
// ============================================================================

function extractFromKnownSites(html: string, sourceUrl: string): ImportedRecipe | null {
  const domain = new URL(sourceUrl).hostname.toLowerCase();

  // Определяем, какой парсер использовать
  if (domain.includes("iamcook.ru")) {
    return parseIamcook(html, sourceUrl);
  }
  if (domain.includes("food.ru")) {
    return parseFoodRu(html, sourceUrl);
  }
  if (domain.includes("eda.ru")) {
    return parseEdaRu(html, sourceUrl);
  }
  if (domain.includes("povarenok.ru")) {
    return parsePovarenok(html, sourceUrl);
  }
  if (domain.includes("gotovim-doma.ru")) {
    return parseGotovimDoma(html, sourceUrl);
  }
  if (domain.includes("allrecipes.com") || domain.includes("allrecipes.ru")) {
    return parseAllRecipes(html, sourceUrl);
  }

  return null;
}

// Парсер для iamcook.ru
function parseIamcook(html: string, sourceUrl: string): ImportedRecipe | null {
  try {
    const $ = cheerio.load(html);
    const domain = new URL(sourceUrl).hostname;

    // Извлекаем заголовок
    const title = $('h1').first().text().trim() || $('title').text().split('-')[0].trim();
    if (!title) return null;

    // Извлекаем описание
    const description = $('meta[name="description"]').attr('content') || '';

    // Извлекаем картинку
    const imageUrl = $('figure img.resultphoto').attr('src') ||
                     $('img.photo').first().attr('src') ||
                     $('meta[property="og:image"]').attr('content') || '';

    // Извлекаем ингредиенты из div.ilist > div > p (исключая ul.ilparams)
    const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
    $('div.ingredients div.ilist > div > p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 2 && !text.includes('кКал') && !text.includes('мин.')) {
        const parsed = parseIngredientText(text);
        if (parsed.name.length > 1) {
          ingredients.push(parsed);
        }
      }
    });

    // Извлекаем шаги из div.instructions > p
    const steps: Array<{ text: string }> = [];
    $('div.instructions > p').each((_, el) => {
      const text = $(el).text().trim();
      // Пропускаем пустые и слишком короткие тексты
      if (text.length > 20 && !text.startsWith('Ингредиенты')) {
        steps.push({ text });
      }
    });

    // Извлекаем время приготовления
    const timeText = $('li.time').text() || '';
    const timeMatch = timeText.match(/(\d+)\s*ч[.\s]*(\d+)?\s*мин/i) || timeText.match(/(\d+)\s*мин/i);
    let cookTime = 0;
    if (timeMatch) {
      if (timeMatch[2]) {
        cookTime = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
      } else {
        cookTime = parseInt(timeMatch[1]);
      }
    }

    // Извлекаем порции
    const servingsText = $('li.portions').text() || '';
    const servingsMatch = servingsText.match(/(\d+)/);
    const servings = servingsMatch ? parseInt(servingsMatch[1]) : undefined;

    console.log(`✅ iamcook.ru: ${ingredients.length} ингредиентов, ${steps.length} шагов`);

    return {
      title,
      description,
      imageUrl: imageUrl.startsWith('//') ? 'https:' + imageUrl : imageUrl,
      cookTime: cookTime || undefined,
      servings,
      tags: [title],
      ingredients,
      steps,
      sourceUrl,
      sourceDomain: domain,
      confidence: ingredients.length > 0 && steps.length > 0 ? "high" : "medium",
    };
  } catch (e) {
    console.log("⚠️ Ошибка парсера iamcook.ru:", e);
    return null;
  }
}

function parseFoodRu(html: string, sourceUrl: string): ImportedRecipe | null {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      console.log("⚠️ __NEXT_DATA__ не найден на food.ru");
      return null;
    }

    const nextData = JSON.parse(match[1]);
    const state = nextData?.props?.pageProps?.__EFFECTOR_NEXTJS_INITIAL_STATE__;

    if (!state) {
      console.log("⚠️ Effector state не найден");
      return null;
    }

    let recipeData: any = null;

    for (const key in state) {
      const value = state[key];
      if (value && typeof value === 'object') {
        if (value.preparation && value.cooking && value.title) {
          recipeData = value;
          console.log("✅ Найдены данные рецепта food.ru в ключе:", key);
          break;
        }
      }
    }

    if (!recipeData) {
      console.log("⚠️ Данные рецепта не найдены в state");
      return null;
    }

    const title = recipeData.title || "Рецепт";

    let description = recipeData.snippet || "";
    if (recipeData.subtitle?.children?.[0]?.children?.[0]?.content) {
      description = recipeData.subtitle.children[0].children[0].content;
    }

    const imageUrl = recipeData.cover?.image_path
      ? `https://cdn.food.ru/unsigned/fit/640/480/ce/0/czM6Ly9tZWRpYS8${recipeData.cover.image_path}`
      : undefined;

    const $ = cheerio.load(html);
    const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
    const seen = new Set<string>();

    // Список слов-исключений
    const excludeWords = [
      'Продукты', 'Порции', 'Штука', 'Для чебурека', 'Для начинки',
      'Для теста', 'Для соуса', 'Пищевая ценность', 'Уровни',
      'Калорийность', 'минут', 'рецепта', 'Ингредиенты'
    ];

    // Пытаемся найти ингредиенты через разные селекторы
    $('[data-test="ingredient-item"], [class*="ingredient"], li[class*="Ingredient"]').each((_, el) => {
      const text = $(el).text().trim();

      // Фильтруем по длине и исключениям
      if (!text || text.length < 3 || text.length > 200) return;

      // Проверяем на исключения
      const hasExcludedWord = excludeWords.some(word => text.includes(word));
      if (hasExcludedWord) return;

      // Пропускаем строки только из цифр и спецсимволов
      if (text.match(/^[\d\s—\-=]+$/)) return;

      const parsed = parseIngredientText(text);
      if (!parsed.name || parsed.name.length < 3) return;

      // Дедупликация по нормализованному имени
      const key = parsed.name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        ingredients.push(parsed);
      }
    });

    // Если не нашли ингредиенты в HTML, пытаемся извлечь из meta description
    if (ingredients.length === 0) {
      const metaDesc = $('meta[name="description"]').attr('content') || '';
      const ingredientsMatch = metaDesc.match(/Ингредиенты:\s*([^.]+)/);
      if (ingredientsMatch) {
        const ingredientsList = ingredientsMatch[1].split(',').map(s => s.trim());

        ingredientsList.forEach(item => {
          if (!item || item.length < 3) return;

          const hasExcludedWord = excludeWords.some(word => item.includes(word));
          if (hasExcludedWord) return;

          const parsed = parseIngredientText(item);
          if (!parsed.name || parsed.name.length < 3) return;

          const key = parsed.name.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            ingredients.push(parsed);
          }
        });
      }
    }

    const steps: Array<{ text: string }> = [];

    const allSteps = [
      ...(recipeData.preparation || []),
      ...(recipeData.cooking || []),
      ...(recipeData.impression || [])
    ];

    allSteps.forEach((step: any) => {
      let text = "";

      if (step.description?.children?.[0]?.children?.[0]?.content) {
        text = step.description.children[0].children[0].content;
      } else if (typeof step.description === 'string') {
        text = step.description;
      }

      if (text && text.trim() && text.length > 10) {
        steps.push({ text: text.trim() });
      }
    });

    return {
      title,
      description,
      imageUrl,
      prepTime: parseInt(recipeData.active_cooking_time) || undefined,
      cookTime: parseInt(recipeData.total_cooking_time) || undefined,
      servings: parseInt(recipeData.measure_count) || undefined,
      cuisine: recipeData.cuisines?.[0]?.name || undefined,
      tags: Array.isArray(recipeData.tags) ? recipeData.tags.map((t: any) => t.title || t.name || t).slice(0, 5) : [],
      ingredients,
      steps,
      sourceUrl,
      sourceDomain: "food.ru",
      confidence: ingredients.length > 0 && steps.length > 0 ? "high" : "medium",
    };
  } catch (err) {
    console.error("❌ Ошибка парсинга food.ru:", err);
    return null;
  }
}

function parseEdaRu(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);

  const title = $('h1[class*="recipe-header"]').text().trim() ||
                $('h1').first().text().trim();

  if (!title) return null;

  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('[class*="ingredient"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      const parsed = parseIngredientText(text);
      ingredients.push(parsed);
    }
  });

  const steps: Array<{ text: string }> = [];
  $('[class*="step"] p, [class*="instruction"] p').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      steps.push({ text });
    }
  });

  return {
    title,
    description: $('[class*="description"]').first().text().trim() || undefined,
    imageUrl: $('img[class*="recipe"]').first().attr("src"),
    prepTime: undefined,
    cookTime: undefined,
    servings: undefined,
    cuisine: undefined,
    tags: [],
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: "eda.ru",
    confidence: "medium",
  };
}

function parsePovarenok(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  if (!title) return null;

  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('.ingredients li, .ingredient-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      const parsed = parseIngredientText(text);
      ingredients.push(parsed);
    }
  });

  const steps: Array<{ text: string }> = [];
  $('.cooking-step, .step-description').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      steps.push({ text });
    }
  });

  return {
    title,
    description: $('.description').first().text().trim() || undefined,
    imageUrl: $('img.recipe-image').first().attr("src") || $('meta[property="og:image"]').attr("content"),
    prepTime: undefined,
    cookTime: undefined,
    servings: undefined,
    cuisine: undefined,
    tags: [],
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: "povarenok.ru",
    confidence: "medium",
  };
}

function parseGotovimDoma(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);

  const title = $('h1[itemprop="name"]').text().trim() || $('h1').first().text().trim();
  if (!title) return null;

  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('[itemprop="recipeIngredient"], .ingredient').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      const parsed = parseIngredientText(text);
      ingredients.push(parsed);
    }
  });

  const steps: Array<{ text: string }> = [];
  $('[itemprop="recipeInstructions"] p, .step-text').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      steps.push({ text });
    }
  });

  return {
    title,
    description: $('[itemprop="description"]').text().trim() || undefined,
    imageUrl: $('img[itemprop="image"]').attr("src") || $('meta[property="og:image"]').attr("content"),
    prepTime: parseDuration($('[itemprop="prepTime"]').attr("content")),
    cookTime: parseDuration($('[itemprop="cookTime"]').attr("content")),
    servings: parseInt($('[itemprop="recipeYield"]').text()) || undefined,
    cuisine: undefined,
    tags: [],
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: "gotovim-doma.ru",
    confidence: "medium",
  };
}

function parseAllRecipes(html: string, sourceUrl: string): ImportedRecipe | null {
  // AllRecipes обычно имеет хорошую JSON-LD разметку, но на всякий случай
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  if (!title) return null;

  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('[data-ingredient], .ingredients-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      const parsed = parseIngredientText(text);
      ingredients.push(parsed);
    }
  });

  const steps: Array<{ text: string }> = [];
  $('.recipe-directions__list--item, .instructions-section-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !text.toLowerCase().includes("advertisement")) {
      steps.push({ text });
    }
  });

  return {
    title,
    description: $('.recipe-summary').text().trim() || undefined,
    imageUrl: $('img.recipe-image').attr("src") || $('meta[property="og:image"]').attr("content"),
    prepTime: undefined,
    cookTime: undefined,
    servings: undefined,
    cuisine: undefined,
    tags: [],
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: new URL(sourceUrl).hostname,
    confidence: "medium",
  };
}

// ============================================================================
// 3. Универсальное извлечение ингредиентов и шагов из HTML
// ============================================================================

function extractIngredientsAndStepsFromHtml(html: string): {
  ingredients: Array<{ name: string; amount: string; unit: string }>;
  steps: Array<{ text: string }>;
} {
  const $ = cheerio.load(html);
  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  const steps: Array<{ text: string }> = [];
  const seenIngredients = new Set<string>();
  const seenSteps = new Set<string>();

  // ========== ИЗВЛЕЧЕНИЕ ИНГРЕДИЕНТОВ ==========

  // Шаг 1: Ищем секцию по заголовку (работает для большинства сайтов)
  const ingredientHeaders = $('h1, h2, h3, h4, .title, [class*="title"], [class*="heading"]').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('ингредиент') || text.includes('состав') ||
           text.includes('продукт') || text === 'ingredients' ||
           text.includes('what you need');
  });

  // Ищем ингредиенты в родительском контейнере или следующих элементах
  ingredientHeaders.each((_, header) => {
    const $header = $(header);
    const $container = $header.parent();

    // Ищем в контейнере
    $container.find('li, p, div, span').each((_, el) => {
      const text = $(el).text().trim();

      // Фильтрация: длина, наличие числа или тире
      if (text.length < 3 || text.length > 250) return;
      if (!text.match(/\d/) && !text.match(/[-–—]/)) return;

      // Исключаем заголовки и служебные слова
      const lowerText = text.toLowerCase();
      if (lowerText.includes('ингредиент') || lowerText.includes('ingredients') ||
          lowerText.includes('продукт') || lowerText.includes('порци') ||
          lowerText.includes('штук') || lowerText.match(/^для\s/)) return;

      const parsed = parseIngredientText(text);
      if (parsed.name && parsed.name.length > 2) {
        const key = parsed.name.toLowerCase().trim();
        if (!seenIngredients.has(key)) {
          seenIngredients.add(key);
          ingredients.push(parsed);
        }
      }
    });

    // Также ищем в следующих 5 элементах после заголовка
    let $next = $header.next();
    for (let i = 0; i < 5 && $next.length > 0; i++) {
      $next.find('li, p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 3 && text.length < 250 && text.match(/\d/)) {
          const parsed = parseIngredientText(text);
          if (parsed.name && parsed.name.length > 2) {
            const key = parsed.name.toLowerCase().trim();
            if (!seenIngredients.has(key)) {
              seenIngredients.add(key);
              ingredients.push(parsed);
            }
          }
        }
      });
      $next = $next.next();
    }
  });

  // Fallback: если не нашли по заголовкам, ищем элементы с классами ingredient
  if (ingredients.length === 0) {
    $('[class*="ingredient"], [class*="ingr"], [data-ingredient], ul li, .recipe-ingredients li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 3 && text.length < 250 && /\d+\s*(г|мл|кг|л|шт|ст|ч\.л|ст\.л|cup|tbsp|tsp|oz|lb|g|ml|kg)/i.test(text)) {
        const parsed = parseIngredientText(text);
        if (parsed.name && parsed.name.length > 2) {
          const key = parsed.name.toLowerCase().trim();
          if (!seenIngredients.has(key)) {
            seenIngredients.add(key);
            ingredients.push(parsed);
          }
        }
      }
    });
  }

  // ========== ИЗВЛЕЧЕНИЕ ШАГОВ ==========

  // Шаг 1: Ищем секцию приготовления по заголовку
  const instructionHeaders = $('h1, h2, h3, h4, .title, [class*="title"], [class*="heading"]').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('приготовл') || text.includes('пригот') ||
           text.includes('рецепт') || text.includes('способ') ||
           text.includes('инструкц') || text.includes('шаг') ||
           text === 'directions' || text === 'instructions' ||
           text === 'method' || text.includes('how to make');
  });

  instructionHeaders.each((_, header) => {
    const $header = $(header);
    const $container = $header.parent();

    // Ищем в контейнере
    $container.find('p, li, div[class*="step"], [class*="instruction"]').each((_, el) => {
      const text = $(el).text().trim();

      if (text.length < 20 || text.length > 2000) return;
      if (text.toLowerCase().includes('ингредиент')) return;

      // Проверяем наличие глаголов (русские и английские)
      const hasVerb = /[а-яё]+(ить|ать|еть|уть|ыть|оть|нуть|ти|чь)\b/i.test(text) ||
                      /\b(add|mix|cook|bake|stir|pour|heat|blend|combine|place|cut|chop)\b/i.test(text);

      if (hasVerb && !seenSteps.has(text)) {
        seenSteps.add(text);
        steps.push({ text });
      }
    });

    // Ищем в следующих элементах
    let $next = $header.next();
    for (let i = 0; i < 15 && $next.length > 0; i++) {
      const text = $next.text().trim();
      if (text.length > 20 && text.length < 2000 && !text.toLowerCase().includes('ингредиент')) {
        const hasVerb = /[а-яё]+(ить|ать|еть|уть|ыть|оть|нуть|ти|чь)\b/i.test(text);
        if (hasVerb && !seenSteps.has(text)) {
          seenSteps.add(text);
          steps.push({ text });
        }
      }
      $next = $next.next();
    }
  });

  // Fallback: ищем ol > li или элементы с классами step/instruction
  if (steps.length === 0) {
    $('ol li, [class*="step"], [class*="instruction"], [class*="direction"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 2000) {
        const hasVerb = /[а-яё]+(ить|ать|еть|уть|ыть|оть|нуть|ти|чь)\b/i.test(text) ||
                        /\b(add|mix|cook|bake|stir|pour|heat|blend|combine)\b/i.test(text);
        if (hasVerb && !seenSteps.has(text)) {
          seenSteps.add(text);
          steps.push({ text });
        }
      }
    });
  }

  // Дополнительный fallback: ищем все параграфы с глаголами (для сайтов типа iamcook.ru)
  if (steps.length === 0) {
    let checkedCount = 0;
    let skippedShort = 0;
    let skippedIngredients = 0;
    let foundWithVerb = 0;

    $('p').each((_, el) => {
      const text = $(el).text().trim();
      checkedCount++;

      // Пропускаем короткие, длинные, и те что содержат слово "ингредиент"
      if (text.length < 30 || text.length > 2000) {
        if (text.length < 30) skippedShort++;
        return;
      }
      if (text.toLowerCase().includes('ингредиент') ||
          text.toLowerCase().includes('ingredients')) {
        skippedIngredients++;
        return;
      }

      // Должен содержать глагол и не быть описанием/заголовком
      const hasVerbRu = /(ить|ать|еть|уть|ыть|оть|нуть|ти|чь|ть)\s/i.test(text);
      const hasVerbEn = /\b(add|mix|cook|bake|stir|pour|heat|blend|combine|place|cut|chop)\b/i.test(text);
      const hasVerb = hasVerbRu || hasVerbEn;

      if (!hasVerb) return;
      foundWithVerb++;

      // Проверяем, что это похоже на инструкцию (используем toLowerCase для текста)
      const textLower = text.toLowerCase();
      const startsWithPreposition = /^(в |на |из |для |с |до |после |затем |потом |далее |теперь |отдельно |сначала |когда )/.test(textLower);
      const hasImperative = /\b(растопи|наре|обжар|смеша|доба|нали|выложи|перемеша|охлади|нагре|вскипяти|остуди|измельчи|жари|вари|пеки|режь|мой|суши|слей|взбей|перелей)/.test(textLower);

      // Проверяем наличие кулинарных слов
      const hasCookingWords = /(масл|сков|печ|чесно|мелк|смеш|взби|добав|нарез|жарь|вари|туш|вылож|соль|перец|специ|духов|сотейн|кастрюл|блендер)/i.test(text);

      // Дополнительная проверка: содержит действие и не похоже на комментарий
      const seemsLikeRecipe = hasVerb && (startsWithPreposition || hasImperative || hasCookingWords);
      const notAComment = !text.includes('только я') && !text.includes('спасибо') && !text.includes('очень вкус') && !text.includes('комментар');

      if (seemsLikeRecipe && notAComment && !seenSteps.has(text)) {
        seenSteps.add(text);
        steps.push({ text });
      }
    });

    console.log(`  📝 Paragraphs fallback: checked=${checkedCount}, skipped_short=${skippedShort}, skipped_ingr=${skippedIngredients}, with_verb=${foundWithVerb}, steps_found=${steps.length}`);
  }

  return {
    ingredients: ingredients.slice(0, 30), // Ограничиваем до 30
    steps: steps.slice(0, 20), // Ограничиваем до 20
  };
}

// ============================================================================
// 4. Puppeteer парсинг для SPA сайтов
// ============================================================================

async function extractWithPuppeteer(url: string): Promise<ImportedRecipe | null> {
  let browser = null;
  try {
    console.log("  🚀 Запуск браузера Puppeteer...");
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    console.log("  📄 Загрузка страницы...");
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Ждем немного для динамического контента
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("  🔍 Извлечение данных...");
    const recipeData = await page.evaluate(() => {
      const result: any = {
        title: '',
        description: '',
        imageUrl: '',
        ingredients: [],
        steps: []
      };

      // Заголовок
      result.title = document.querySelector('h1')?.textContent?.trim() ||
                     document.title || '';

      // Картинка
      const img = document.querySelector('img[alt*="recipe" i], img[alt*="ricetta" i], main img, article img') as HTMLImageElement;
      result.imageUrl = img?.src || '';

      // Описание
      const desc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
      result.description = desc?.content || '';

      // Ингредиенты - универсальный поиск
      const ingredientSelectors = [
        'li[class*="ingredient" i]',
        'div[class*="ingredient" i] li',
        'ul[class*="ingredient" i] li',
        '[data-ingredient]',
        'li[itemprop="recipeIngredient"]',
        '.ingredients li',
        '.recipe-ingredients li'
      ];

      for (const selector of ingredientSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 2 && text.length < 200) {
              result.ingredients.push(text);
            }
          });
          if (result.ingredients.length > 0) break;
        }
      }

      // Шаги приготовления - универсальный поиск
      const stepSelectors = [
        'ol[class*="instruction" i] li',
        'ol[class*="step" i] li',
        'div[class*="instruction" i] p',
        'div[class*="step" i] p',
        '[data-step]',
        'li[itemprop="recipeInstructions"]',
        '.instructions li',
        '.recipe-instructions li',
        '.directions li',
        '.method li'
      ];

      for (const selector of stepSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 20 && text.length < 2000) {
              result.steps.push(text);
            }
          });
          if (result.steps.length > 0) break;
        }
      }

      // Fallback для шагов: все параграфы с глаголами
      if (result.steps.length === 0) {
        document.querySelectorAll('p').forEach(p => {
          const text = p.textContent?.trim() || '';
          if (text.length > 30 && text.length < 2000) {
            // Проверка на кулинарные слова (русский + английский + итальянский)
            const hasCookingWords = /(масл|сков|печ|добав|смеш|жар|вар|наре|mix|add|cook|heat|stir|bake|mescola|aggiungi|cuoci|scalda)/i.test(text);
            if (hasCookingWords) {
              result.steps.push(text);
            }
          }
        });
      }

      return result;
    });

    await browser.close();

    if (!recipeData.title) {
      console.log("  ❌ Не удалось извлечь заголовок");
      return null;
    }

    console.log(`  ✅ Извлечено: ${recipeData.ingredients.length} ингредиентов, ${recipeData.steps.length} шагов`);

    const domain = new URL(url).hostname;
    return {
      title: recipeData.title,
      description: recipeData.description,
      imageUrl: recipeData.imageUrl,
      prepTime: undefined,
      cookTime: undefined,
      servings: undefined,
      cuisine: undefined,
      tags: [],
      ingredients: recipeData.ingredients.slice(0, 30).map((text: string) => parseIngredientText(text)),
      steps: recipeData.steps.slice(0, 20).map((text: string) => ({ text })),
      sourceUrl: url,
      sourceDomain: domain,
      confidence: recipeData.ingredients.length > 0 && recipeData.steps.length > 0 ? "medium" : "low",
    };

  } catch (error) {
    console.error("❌ Ошибка Puppeteer:", error);
    if (browser) {
      await browser.close();
    }
    return null;
  }
}

// ============================================================================
// 5. Fallback: OpenGraph + базовый HTML парсинг
// ============================================================================

function extractFromOpenGraphAndHtml(html: string, sourceUrl: string): ImportedRecipe {
  const $ = cheerio.load(html);
  const domain = new URL(sourceUrl).hostname;

  // Извлекаем OpenGraph метаданные
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").text().split("|")[0].split("-")[0].trim() ||
    $("h1").first().text().trim() ||
    "Рецепт";

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content");

  const imageUrl =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $("img").first().attr("src");

  // Пытаемся найти ингредиенты и шаги в HTML
  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  const steps: Array<{ text: string }> = [];
  const seen = new Set<string>();

  // Ищем секцию ингредиентов по заголовку
  let $ingredientsSection = $('h2, h3, .title, [class*="title"]').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('ингредиент') || text.includes('состав') || text.includes('продукт');
  }).first().parent();

  // Если нашли секцию, ищем ингредиенты в ней
  if ($ingredientsSection.length > 0) {
    $ingredientsSection.find('p, li, div[class*="ingredient"], [class*="ingr"]').each((_, el) => {
      const text = $(el).text().trim();

      // Фильтрация
      if (text.length < 5 || text.length > 200) return;
      if (!text.match(/\d/) && !text.match(/-/)) return; // Должна быть цифра или тире
      if (text.toLowerCase().includes('ингредиент')) return; // Пропускаем заголовки

      const parsed = parseIngredientText(text);
      if (parsed.name && parsed.name.length > 2) {
        const key = parsed.name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          ingredients.push(parsed);
        }
      }
    });
  }

  // Fallback: если не нашли секцию, ищем по всей странице
  if (ingredients.length === 0) {
    $('li, p, div[class*="ingredient"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 5 && text.length < 200 && /\d+\s*(г|мл|кг|л|шт|ст|ч\.л|ст\.л)/.test(text)) {
        const parsed = parseIngredientText(text);
        if (parsed.name && parsed.name.length > 2) {
          const key = parsed.name.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            ingredients.push(parsed);
          }
        }
      }
    });
  }

  // Ищем секцию приготовления
  let $stepsSection = $('h2, h3, .title, [class*="title"]').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('приготовл') || text.includes('пригот') ||
           text.includes('рецепт') || text.includes('способ') ||
           text.includes('инструкц');
  }).first().parent();

  // Если нашли секцию, ищем шаги в ней и после нее
  if ($stepsSection.length > 0) {
    let currentEl = $stepsSection;
    let foundSteps = 0;

    // Ищем следующие 20 элементов после заголовка
    for (let i = 0; i < 20 && foundSteps < 15; i++) {
      currentEl = currentEl.next();
      if (currentEl.length === 0) break;

      const text = currentEl.text().trim();
      if (text.length > 20 && text.length < 1500 && !text.toLowerCase().includes('ингредиент')) {
        steps.push({ text });
        foundSteps++;
      }

      // Также ищем внутри элемента
      currentEl.find('p, li').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20 && text.length < 1500 && !text.toLowerCase().includes('ингредиент')) {
          steps.push({ text });
          foundSteps++;
        }
      });
    }
  }

  // Fallback для шагов: ищем ol > li или нумерованные параграфы
  if (steps.length === 0) {
    $('ol li, .step, [class*="instruction"], [class*="step"], p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 1500) {
        // Должен содержать глагол (простая проверка на русские глаголы)
        if (/[а-яё]+(ить|ать|еть|уть|ыть|оть|нуть|ти|чь)\b/i.test(text)) {
          steps.push({ text });
        }
      }
    });
  }

  return {
    title,
    description,
    imageUrl,
    prepTime: undefined,
    cookTime: undefined,
    servings: undefined,
    cuisine: undefined,
    tags: [],
    ingredients: ingredients.slice(0, 20), // Ограничиваем до 20
    steps: steps.slice(0, 20),
    sourceUrl,
    sourceDomain: domain,
    confidence: "low",
  };
}

// ============================================================================
// Утилиты для парсинга
// ============================================================================

function getString(value: any): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function getStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(v => typeof v === "string" ? v.trim() : "").filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function getImageUrl(value: any): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === "string" ? first : first?.url;
  }
  if (value && typeof value === "object") {
    return value.url || value.contentUrl;
  }
  return undefined;
}

function parseDuration(value: any): number | undefined {
  if (!value) return undefined;

  const str = String(value);

  // ISO 8601 формат: PT1H30M или PT30M
  const isoMatch = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || "0");
    const minutes = parseInt(isoMatch[2] || "0");
    return hours * 60 + minutes;
  }

  // Простой текст: "1 hour 30 minutes"
  const hourMatch = str.match(/(\d+)\s*(?:hour|час)/i);
  const minMatch = str.match(/(\d+)\s*(?:minute|мин)/i);

  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);

  return total || undefined;
}

function parseServings(value: any): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }
  return undefined;
}

function parseIngredients(value: any): Array<{ name: string; amount: string; unit: string }> {
  if (!value) return [];

  const items: string[] = [];

  if (Array.isArray(value)) {
    items.push(...value.map(v => typeof v === "string" ? v : "").filter(Boolean));
  } else if (typeof value === "string") {
    items.push(...value.split("\n").filter(Boolean));
  }

  // Парсим и очищаем ингредиенты
  const parsed = items.map(parseIngredientText);
  return cleanupIngredients(parsed);
}

// Очистка и дедупликация ингредиентов
function cleanupIngredients(ingredients: Array<{ name: string; amount: string; unit: string }>): Array<{ name: string; amount: string; unit: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; amount: string; unit: string }> = [];

  for (const ing of ingredients) {
    // Пропускаем мусорные записи (только цифры, слишком короткие, содержат только время)
    const name = ing.name.trim();
    if (name.length < 2) continue;
    if (/^\d+\s*(мин|час|ч\.|м\.)/i.test(name)) continue;
    if (/^\d+\s*к[Кк]ал/i.test(name)) continue;
    if (/^\d+$/.test(name)) continue;

    // Разбиваем многострочные ингредиенты на отдельные
    if (name.includes("\n")) {
      const lines = name.split("\n").filter(l => l.trim().length > 2);
      for (const line of lines) {
        const parsed = parseIngredientText(line.trim());
        const key = parsed.name.toLowerCase().replace(/\s+/g, " ");
        if (!seen.has(key) && parsed.name.length > 2) {
          seen.add(key);
          result.push(parsed);
        }
      }
      continue;
    }

    // Проверяем уникальность
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;

    // Проверяем, что это не подстрока уже добавленного ингредиента
    let isSubstring = false;
    for (const existingKey of seen) {
      if (existingKey.includes(key) || key.includes(existingKey)) {
        isSubstring = true;
        break;
      }
    }
    if (isSubstring) continue;

    seen.add(key);
    result.push(ing);
  }

  return result;
}

function parseInstructions(value: any): Array<{ text: string }> {
  if (!value) return [];

  const steps: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        steps.push(item);
      } else if (item && typeof item === "object") {
        const text = item.text || item.name || item["@type"];
        if (typeof text === "string") steps.push(text);
      }
    }
  } else if (typeof value === "string") {
    steps.push(...value.split("\n").filter(s => s.trim().length > 0));
  }

  return steps.map(text => ({ text: text.trim() }));
}

// Улучшенный парсинг ингредиентов
function parseIngredientText(text: string): { name: string; amount: string; unit: string } {
  const cleaned = text.trim();

  // Паттерн: "200 г муки" или "2 столовые ложки сахара"
  const pattern = /^([\d\/.,]+)\s*([а-яёa-z.]+)?\s*(.+)$/i;
  const match = cleaned.match(pattern);

  if (match) {
    const amount = match[1].replace(",", ".");
    const unit = (match[2] || "").trim();
    const name = (match[3] || "").trim();

    return { name: name || cleaned, amount, unit };
  }

  // Если не нашли количество, возвращаем весь текст как название
  return { name: cleaned, amount: "", unit: "" };
}
