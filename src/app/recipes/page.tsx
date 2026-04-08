"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RecipeIngredientsEditor from "@/components/RecipeIngredientsEditor";

interface Ingredient {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  icon?: string;
}

interface RecipeStep {
  id: string;
  text: string;
  imageUrl: string;
  durationMinutes: number;
}

type TranslationDraft = {
  title: string;
  description: string;
  instructions: string;
  tips: string;
  serving_tips: string;
  storage_tips: string;
  recipe_note: string;
};

const translationLanguages = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "uk", label: "Українська" },
];

const createEmptyTranslationDrafts = () =>
  translationLanguages.reduce((acc, lang) => {
    acc[lang.code] = {
      title: "",
      description: "",
      instructions: "",
      tips: "",
      serving_tips: "",
      storage_tips: "",
      recipe_note: "",
    };
    return acc;
  }, {} as Record<string, TranslationDraft>);

const emptyTranslationDraft: TranslationDraft = {
  title: "",
  description: "",
  instructions: "",
  tips: "",
  serving_tips: "",
  storage_tips: "",
  recipe_note: "",
};

type BaseTextContent = {
  title: string;
  description: string;
  instructions: string[];
  tips: string;
  serving_tips: string;
  storage_tips: string;
  recipe_note: string;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Парсит теги из любого формата: массив, Postgres строка {a,b}, строка "a, b" */
const parseTagsField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map(t => t.trim());
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    // Postgres array format: {tag1,tag2}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed.slice(1, -1).split(",").map(t => t.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    // Comma-separated string: "tag1, tag2"
    return trimmed.split(",").map(t => t.trim()).filter(Boolean);
  }
  return [];
};

const stringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const numericMatch = normalized.match(/-?\d+(?:\.\d+)?/);
    if (numericMatch) {
      const extracted = Number(numericMatch[0]);
      return Number.isFinite(extracted) ? extracted : null;
    }
  }

  return null;
};

const normalizeInstructionList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  }

  return [] as string[];
};

const normalizeLongText = (value: unknown) =>
  typeof value === "string"
    ? value
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n")
    : "";

const readAdviceValue = (source: Record<string, any>, aliases: string[]) => {
  for (const alias of aliases) {
    if (typeof source[alias] === "string") {
      return normalizeLongText(source[alias]);
    }
  }

  return "";
};

const nutritionKeys = [
  "calories",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "sugar",
  "salt",
  "saturated_fat",
  "cholesterol",
  "sodium",
] as const;

const normalizeNutritionObject = (value: unknown) => {
  if (!isPlainObject(value)) return null;

  const payload = nutritionKeys.reduce((acc, key) => {
    const numeric = toFiniteNumber(value[key]);
    if (numeric !== null) {
      acc[key] = numeric;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.keys(payload).length > 0 ? payload : null;
};

const convertDurationToMinutes = (amount: number, unit: string) => {
  const normalizedUnit = unit.toLowerCase();
  if (
    normalizedUnit.includes("hour") ||
    normalizedUnit.includes("hr") ||
    normalizedUnit.includes("час") ||
    normalizedUnit.includes("год")
  ) {
    return Math.round(amount * 60);
  }

  return Math.round(amount);
};

const extractDurationMinutesFromText = (text: string) => {
  const source = text.toLowerCase();
  if (!source.trim()) return 0;

  const rangeMatch = source.match(
    /(?:от\s+)?(\d+(?:[.,]\d+)?)\s*(мин(?:ут[аы]?)?|minutes?|mins?|m|час(?:а|ов)?|hours?|hrs?|h|год(?:ина|ини|ин)?)(?:\s*(?:до|-|to)\s*\d+(?:[.,]\d+)?\s*(?:мин(?:ут[аы]?)?|minutes?|mins?|m|час(?:а|ов)?|hours?|hrs?|h|год(?:ина|ини|ин)?))?/
  );

  if (rangeMatch) {
    const amount = toFiniteNumber(rangeMatch[1]);
    if (amount !== null) {
      return convertDurationToMinutes(amount, rangeMatch[2]);
    }
  }

  const directMatch = source.match(
    /(\d+(?:[.,]\d+)?)\s*(мин(?:ут[аы]?)?|minutes?|mins?|m|час(?:а|ов)?|hours?|hrs?|h|год(?:ина|ини|ин)?)/i
  );

  if (!directMatch) {
    return 0;
  }

  const amount = toFiniteNumber(directMatch[1]);
  if (amount === null) {
    return 0;
  }

  return convertDurationToMinutes(amount, directMatch[2]);
};

const parseDurationMinutes = (value: unknown, fallbackText = "") => {
  const numericValue = toFiniteNumber(value);
  if (numericValue !== null && numericValue > 0) {
    return Math.round(numericValue);
  }

  const fromText = extractDurationMinutesFromText(fallbackText);
  if (fromText > 0) {
    return fromText;
  }

  if (typeof value === "string" && value.trim()) {
    const fromString = extractDurationMinutesFromText(value);
    if (fromString > 0) return fromString;
  }

  return 0;
};

const parseStepImagesArray = (value: unknown): any[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const resolveStepImageRecord = (stepImagesData: any[], index: number) => {
  const stepNumber = index + 1;
  return (
    stepImagesData.find((item: any) => toFiniteNumber(item?.step) === stepNumber) ||
    stepImagesData[index] ||
    null
  );
};

const normalizeTranslationsObject = (raw: unknown, base: BaseTextContent) => {
  const payload: Record<string, Record<string, any>> = {};
  if (!isPlainObject(raw)) {
    return payload;
  }

  Object.entries(raw).forEach(([lang, entry]) => {
    if (!isPlainObject(entry)) return;

    const next = { ...entry };
    delete next.dish_type;
    delete next.course;

    const title = typeof next.title === "string" ? next.title.trim() : "";
    if (title && title !== base.title) {
      next.title = title;
    } else {
      delete next.title;
    }

    const description = typeof next.description === "string" ? next.description.trim() : "";
    if (description && description !== base.description) {
      next.description = description;
    } else {
      delete next.description;
    }

    const instructions = normalizeInstructionList(next.instructions);
    if (instructions.length && !stringArraysEqual(instructions, base.instructions)) {
      next.instructions = instructions;
    } else {
      delete next.instructions;
    }

    const tips = readAdviceValue(next, ["tips", "cooking_tips"]);
    if (tips && tips !== base.tips) {
      next.tips = tips;
    } else {
      delete next.tips;
      delete next.cooking_tips;
    }

    const servingTips = readAdviceValue(next, ["serving_tips", "serving"]);
    if (servingTips && servingTips !== base.serving_tips) {
      next.serving_tips = servingTips;
    } else {
      delete next.serving_tips;
      delete next.serving;
    }

    const storageTips = readAdviceValue(next, ["storage_tips", "storage"]);
    if (storageTips && storageTips !== base.storage_tips) {
      next.storage_tips = storageTips;
    } else {
      delete next.storage_tips;
      delete next.storage;
    }

    const recipeNote = readAdviceValue(next, ["recipe_note", "note"]);
    if (recipeNote && recipeNote !== base.recipe_note) {
      next.recipe_note = recipeNote;
    } else {
      delete next.recipe_note;
      delete next.note;
    }

    if (Object.keys(next).length > 0) {
      payload[lang] = next;
    }
  });

  return payload;
};

const initialState = {
  id: "",
  title: "",
  description: "",
  image_url: "",
  step_images: "",
  cuisine_id: "",
  dish_type: "",
  course: "",
  owner_id: "",
  is_user_defined: "false",
  author: "",
  contributor_ids: "",
  servings: 4,
  prep_time: "",
  cook_time: "",
  difficulty: "medium",
  tags: [] as string[],
  diet_tags: "",
  allergen_tags: "",
  cuisine_tags: "",
  equipment: "",
  tools_optional: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
  fiber: "",
  sugar: "",
  salt: "",
  saturated_fat: "",
  cholesterol: "",
  sodium: "",
  nutrition_per_100g: "",
  tips: "",
  serving_tips: "",
  storage_tips: "",
  recipe_note: "",
  instructions: "",
  comments_enabled: "true",
  comments_count: "",
  translations: "",
};

type RecipeFormState = typeof initialState;

function buildRecipeImportPrompt({
  selectedCuisine,
  cuisines,
  form,
  isEditing,
}: {
  selectedCuisine: { id?: string; name?: string } | null;
  cuisines: Array<{ id?: string; name?: string }>;
  form: RecipeFormState;
  isEditing: boolean;
}) {
  const contextLines: string[] = [];

  if (selectedCuisine?.id) {
    contextLines.push(
      `- Каталог уже выбран: ${JSON.stringify(selectedCuisine.name || "Без названия")} (cuisine_id="${selectedCuisine.id}"). Используй именно этот UUID.`
    );
  } else if (cuisines.length > 0) {
    contextLines.push("- Для cuisine_id используй один из UUID из списка доступных каталогов ниже.");
  }

  if (isEditing && form.id) {
    contextLines.push(`- Это редактирование существующего рецепта. Для обновления записи сохрани id "${form.id}".`);
  }

  if (form.owner_id.trim()) {
    contextLines.push(`- owner_id уже задан: "${form.owner_id.trim()}". Не меняй его без причины.`);
  }

  contextLines.push(`- is_user_defined: ${form.is_user_defined === "true" ? "true" : "false"}.`);

  if (form.difficulty.trim()) {
    contextLines.push(`- difficulty по умолчанию в текущей форме: "${form.difficulty.trim()}".`);
  }

  if (form.dish_type.trim()) {
    contextLines.push(`- Если подходит рецепту, используй dish_type "${form.dish_type.trim()}".`);
  }

  if (form.course.trim()) {
    contextLines.push(`- Если подходит рецепту, используй course "${form.course.trim()}".`);
  }

  if (form.servings > 0) {
    contextLines.push(`- Если точное число порций неизвестно, возьми servings=${form.servings}.`);
  }

  contextLines.push(`- comments_enabled по умолчанию: ${form.comments_enabled === "true" ? "true" : "false"}.`);

  if (form.title.trim()) {
    contextLines.push(`- В форме уже есть title: ${JSON.stringify(form.title.trim())}. Если это тот же рецепт, используй как ориентир.`);
  }

  if (form.description.trim()) {
    contextLines.push(`- В форме уже есть description: ${JSON.stringify(form.description.trim())}. Если это тот же рецепт, используй как ориентир.`);
  }

  if (form.tips.trim()) {
    contextLines.push(`- В форме уже есть tips: ${JSON.stringify(form.tips.trim())}. Если это тот же рецепт, используй как ориентир.`);
  }

  if (form.serving_tips.trim()) {
    contextLines.push(`- В форме уже есть serving_tips: ${JSON.stringify(form.serving_tips.trim())}.`);
  }

  if (form.storage_tips.trim()) {
    contextLines.push(`- В форме уже есть storage_tips: ${JSON.stringify(form.storage_tips.trim())}.`);
  }

  if (form.recipe_note.trim()) {
    contextLines.push(`- В форме уже есть recipe_note: ${JSON.stringify(form.recipe_note.trim())}.`);
  }

  const availableCuisines = !selectedCuisine && cuisines.length > 0
    ? `\nДоступные каталоги (name -> cuisine_id):\n${cuisines
        .map((cuisine) => `- ${cuisine.name || "Без названия"} -> ${cuisine.id || ""}`)
        .join("\n")}`
    : "";

  const languagesLine = translationLanguages.map((lang) => lang.code).join(", ");
  const unitsLine = ["g", "kg", "ml", "l", "pcs", "tbsp", "tsp"].join(", ");
  const cuisinePlaceholder = selectedCuisine?.id || "UUID каталога";
  const ownerPlaceholder = form.owner_id.trim() || null;
  const commentsEnabledPlaceholder = form.comments_enabled === "true";
  const servingsPlaceholder = form.servings > 0 ? form.servings : 4;
  const difficultyPlaceholder = form.difficulty.trim() || "medium";
  const dishTypePlaceholder = form.dish_type.trim() || "soup";
  const coursePlaceholder = form.course.trim() || "main";

  return `Сгенерируй JSON для рецепта.
Верни ТОЛЬКО валидный JSON без markdown и пояснений.

Контекст текущей формы:
${contextLines.join("\n")}
${availableCuisines}

Правила:
- title, description, tips, serving_tips, storage_tips и recipe_note — это канонические текстовые поля рецепта.
- Для шагов приготовления используй canonical-массив steps. Каждый шаг обязан содержать text и duration_minutes.
- Сначала определи язык исходного текста в title / description / instructions / tips / serving_tips / storage_tips / recipe_note. Это базовый язык рецепта.
- translations содержит переводы для ВСЕХ остальных поддерживаемых языков, кроме базового языка.
- Базовый язык НЕ дублируй в translations.
- Если базовый язык один из поддерживаемых, внутри translations должно быть ровно ${translationLanguages.length - 1} языков.
- Для всех остальных языков обязательно заполни title, description, instructions, tips, serving_tips, storage_tips и recipe_note, если в базовом рецепте эти секции непустые.
- JSON считается некорректным, если в translations есть только один язык или отсутствуют остальные поддерживаемые переводы, кроме базового.
- Если исходный язык не удаётся определить уверенно, считай базовым языком "ru".
- Используй только языки: ${languagesLine}.
- Для units используй только: ${unitsLine}.
- tags — обязательный массив строк. Выбери из: quick, special occasion, light, hearty, breakfast, lunch, dinner, snack, vegetarian, vegan, gluten-free, dairy-free, soup, salad, pasta, grill, baking, raw. Правила: quick если totalTime ≤ 20 мин; special occasion если > 60 мин или праздничное блюдо; light если < 300 ккал; hearty если > 650 ккал; breakfast/lunch/dinner/snack — тип приёма пищи (обязателен хотя бы один). Пример: ["dinner","hearty","soup"].
- ingredients — массив объектов {id,name,quantity,unit}. Если UUID продукта неизвестен, ставь id пустым "" и заполняй name.
- Все числовые поля возвращай как number или null, без строк, без единиц измерения и без поясняющего текста.
- Верхние поля calories / protein / fat / carbs / fiber / sugar / salt / saturated_fat / cholesterol / sodium не оставляй пустыми без причины. Если точных значений нет, рассчитай или реалистично оцени по ингредиентам и количеству порций.
- nutrition_per_100g заполняй числами, если они известны или их можно оценить. Если все значения действительно неизвестны, ставь nutrition_per_100g: null, а не объект из одних null.
- Для каждого шага обязательно укажи поле duration_minutes, но заполняй его ТОЛЬКО если время явно указано в исходном рецепте.
- Не оценивай, не вычисляй и не придумывай duration_minutes по здравому смыслу. Если время не написано явно, ставь duration_minutes: null.
- Шаги вроде "нарежьте", "смешайте", "натрите", "выложите", "подготовьте" без явного упоминания минут или часов должны иметь duration_minutes: null.
- Если в тексте шага есть диапазон времени, укажи минимально необходимое практическое время в минутах.
- Если в шаге есть маринование, выпекание, варка, охлаждение, отдых или другое ожидание по времени, заполняй duration_minutes только когда это время прямо указано в исходном тексте.
- Пример правильно: "Готовьте около 15 минут, обязательно перевернув" -> "duration_minutes": 15.
- Пример правильно: "Нарежьте ребрышки по 2-3 кости. Натрите мясо смесью соли..." -> "duration_minutes": null.
- Числа, которые означают размер, количество костей, температуру, номер шага, вес или объём, НЕ считаются временем.
- tips, serving_tips, storage_tips и recipe_note — это обычные строки или null. Не возвращай массивы или объекты.
- Если в исходном рецепте нет данных для tips / serving_tips / storage_tips / recipe_note, ставь null.
- image_url у шага можно оставлять null.
- Не выдумывай UUID. Если точный UUID неизвестен, оставь пустую строку только там, где это допустимо.
- Никаких trailing commas.

Шаблон:
{
  "id": ${isEditing && form.id ? `"${form.id}"` : "null"},
  "title": "Том ям",
  "description": "Острый суп на кокосовом молоке с креветками",
  "image_url": "https://example.com/tom-yum.jpg",
  "cuisine_id": "${cuisinePlaceholder}",
  "dish_type": "${dishTypePlaceholder}",
  "course": "${coursePlaceholder}",
  "owner_id": ${ownerPlaceholder ? `"${ownerPlaceholder}"` : "null"},
  "is_user_defined": ${form.is_user_defined === "true" ? "true" : "false"},
  "author": "Имя автора",
  "contributor_ids": [],
  "servings": ${servingsPlaceholder},
  "prep_time": 20,
  "cook_time": 25,
  "difficulty": "${difficultyPlaceholder}",
  "tags": ["dinner", "hearty", "soup"],
  "diet_tags": ["pescatarian"],
  "allergen_tags": ["seafood"],
  "cuisine_tags": ["thai"],
  "equipment": ["pot"],
  "tools_optional": ["strainer"],
  "calories": 320,
  "protein": 18,
  "fat": 12,
  "carbs": 35,
  "fiber": 4,
  "sugar": 6,
  "salt": 1.2,
  "saturated_fat": 4,
  "cholesterol": 40,
  "sodium": 600,
  "nutrition_per_100g": {
    "calories": 80,
    "protein": 4,
    "fat": 3,
    "carbs": 9,
    "fiber": 1,
    "sugar": 1.5,
    "salt": 0.3,
    "saturated_fat": 1,
    "cholesterol": 10,
    "sodium": 150
  },
  "tips": "Для более насыщенного вкуса дайте супу настояться 5 минут после приготовления.",
  "serving_tips": "Подавайте горячим с лаймом и кинзой.",
  "storage_tips": "Храните в холодильнике до 2 суток в закрытом контейнере.",
  "recipe_note": "Пасту том-ям регулируйте по остроте.",
  "comments_enabled": ${commentsEnabledPlaceholder},
  "comments_count": 0,
  "ingredients": [
    {"id": "UUID продукта", "name": "Креветки", "quantity": 200, "unit": "g"},
    {"id": "", "name": "Кокосовое молоко", "quantity": 400, "unit": "ml"},
    {"id": "", "name": "Лемонграсс", "quantity": 2, "unit": "pcs"}
  ],
  "steps": [
    {"text": "Подготовьте ингредиенты.", "duration_minutes": null, "image_url": null},
    {"text": "Доведите бульон до кипения и добавьте лемонграсс.", "duration_minutes": 7, "image_url": "https://example.com/step-1.jpg"},
    {"text": "Добавьте кокосовое молоко, пасту и креветки.", "duration_minutes": null, "image_url": "https://example.com/step-2.jpg"},
    {"text": "Готовьте 5-7 минут и подавайте.", "duration_minutes": 5, "image_url": null}
  ],
  "translations": {
    "en": {
      "title": "Tom Yum",
      "description": "Spicy coconut shrimp soup",
      "tips": "Let the soup rest for 5 minutes after cooking for a deeper flavor.",
      "serving_tips": "Serve hot with lime and cilantro.",
      "storage_tips": "Store refrigerated for up to 2 days in an airtight container.",
      "recipe_note": "Adjust the tom yum paste to your preferred heat level.",
      "instructions": [
        "Prepare the ingredients.",
        "Bring the broth to a boil and add the lemongrass.",
        "Add coconut milk, paste, and shrimp.",
        "Cook for 5-7 minutes and serve."
      ]
    },
    "de": {
      "title": "Tom Yum",
      "description": "Scharfe Kokossuppe mit Garnelen",
      "tips": "Lass die Suppe nach dem Kochen 5 Minuten ziehen, damit der Geschmack intensiver wird.",
      "serving_tips": "Heiß mit Limette und Koriander servieren.",
      "storage_tips": "Im Kühlschrank in einem geschlossenen Behälter bis zu 2 Tage aufbewahren.",
      "recipe_note": "Die Tom-Yum-Paste je nach gewünschter Schärfe anpassen.",
      "instructions": [
        "Bereite die Zutaten vor.",
        "Bringe die Brühe zum Kochen und gib das Zitronengras hinzu.",
        "Füge Kokosmilch, Paste und Garnelen hinzu.",
        "Koche alles 5-7 Minuten und serviere es."
      ]
    },
    "fr": {
      "title": "Tom Yum",
      "description": "Soupe épicée aux crevettes et au lait de coco",
      "tips": "Laissez reposer la soupe 5 minutes après cuisson pour un goût plus profond.",
      "serving_tips": "Servez bien chaud avec du citron vert et de la coriandre.",
      "storage_tips": "Conservez au réfrigérateur jusqu’à 2 jours dans une boîte hermétique.",
      "recipe_note": "Ajustez la pâte tom yum selon le niveau de piquant souhaité.",
      "instructions": [
        "Préparez les ingrédients.",
        "Portez le bouillon à ébullition et ajoutez la citronnelle.",
        "Ajoutez le lait de coco, la pâte et les crevettes.",
        "Faites cuire 5 à 7 minutes puis servez."
      ]
    },
    "it": {
      "title": "Tom Yum",
      "description": "Zuppa piccante di gamberi al latte di cocco",
      "tips": "Lascia riposare la zuppa per 5 minuti dopo la cottura per un gusto più intenso.",
      "serving_tips": "Servi calda con lime e coriandolo.",
      "storage_tips": "Conserva in frigorifero fino a 2 giorni in un contenitore chiuso.",
      "recipe_note": "Regola la pasta tom yum in base al livello di piccante desiderato.",
      "instructions": [
        "Prepara gli ingredienti.",
        "Porta il brodo a ebollizione e aggiungi la citronella.",
        "Aggiungi il latte di cocco, la pasta e i gamberi.",
        "Cuoci per 5-7 minuti e servi."
      ]
    },
    "es": {
      "title": "Tom Yum",
      "description": "Sopa picante de coco con gambas",
      "tips": "Deja reposar la sopa 5 minutos después de cocinarla para un sabor más intenso.",
      "serving_tips": "Sirve caliente con lima y cilantro.",
      "storage_tips": "Guárdala en el refrigerador hasta 2 días en un recipiente hermético.",
      "recipe_note": "Ajusta la pasta tom yum según el nivel de picante deseado.",
      "instructions": [
        "Prepara los ingredientes.",
        "Lleva el caldo a ebullición y añade la hierba limón.",
        "Añade la leche de coco, la pasta y las gambas.",
        "Cocina durante 5-7 minutos y sirve."
      ]
    },
    "pt-BR": {
      "title": "Tom Yum",
      "description": "Sopa apimentada de coco com camarão",
      "tips": "Deixe a sopa descansar por 5 minutos após o preparo para intensificar o sabor.",
      "serving_tips": "Sirva quente com limão e coentro.",
      "storage_tips": "Armazene na geladeira por até 2 dias em recipiente fechado.",
      "recipe_note": "Ajuste a pasta tom yum ao nível de pimenta desejado.",
      "instructions": [
        "Prepare os ingredientes.",
        "Leve o caldo para ferver e adicione o capim-limão.",
        "Adicione o leite de coco, a pasta e o camarão.",
        "Cozinhe por 5-7 minutos e sirva."
      ]
    },
    "uk": {
      "title": "Том ям",
      "description": "Гострий суп на кокосовому молоці з креветками",
      "tips": "Дайте супу настоятися 5 хвилин після приготування для глибшого смаку.",
      "serving_tips": "Подавайте гарячим із лаймом і кінзою.",
      "storage_tips": "Зберігайте в холодильнику до 2 діб у закритому контейнері.",
      "recipe_note": "Регулюйте пасту том-ям за бажаним рівнем гостроти.",
      "instructions": [
        "Підготуйте інгредієнти.",
        "Доведіть бульйон до кипіння і додайте лемонграс.",
        "Додайте кокосове молоко, пасту та креветки.",
        "Варіть 5-7 хвилин і подавайте."
      ]
    }
  }
}`;
}

export default function RecipesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const cuisineId = searchParams.get("cuisine");
  const importBase = process.env.NEXT_PUBLIC_IMPORT_API_BASE || "";
  const instagramApi = importBase ? `${importBase}/api/import-instagram` : "/api/import-instagram";

  const [form, setForm] = useState(initialState);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [cuisines, setCuisines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [instagramStatus, setInstagramStatus] = useState("");
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [activeTranslationLang, setActiveTranslationLang] = useState("ru");
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, TranslationDraft>>(
    () => createEmptyTranslationDrafts()
  );
  const [showTranslationsJson, setShowTranslationsJson] = useState(false);
  const [showMainSection, setShowMainSection] = useState(true);
  const [showTagsSection, setShowTagsSection] = useState(true);
  const [showCommentsSection, setShowCommentsSection] = useState(true);
  const [showTranslationsSection, setShowTranslationsSection] = useState(true);
  const [showIngredientsSection, setShowIngredientsSection] = useState(true);
  const [showInstructionsSection, setShowInstructionsSection] = useState(true);

  useEffect(() => {
    loadCuisines();
    if (editId) {
      loadRecipe(editId);
    } else if (cuisineId) {
      setForm(prev => ({ ...prev, cuisine_id: cuisineId }));
    }
  }, [editId, cuisineId]);

  const updateTranslationDraft = (lang: string, patch: Partial<TranslationDraft>) => {
    setTranslationDrafts(prev => ({
      ...prev,
      [lang]: { ...prev[lang], ...patch },
    }));
  };

  const getBaseTextContent = (): BaseTextContent => ({
    title: form.title.trim(),
    description: form.description.trim(),
    instructions: steps
      .map(step => step.text.trim())
      .filter(Boolean),
    tips: normalizeLongText(form.tips),
    serving_tips: normalizeLongText(form.serving_tips),
    storage_tips: normalizeLongText(form.storage_tips),
    recipe_note: normalizeLongText(form.recipe_note),
  });

  const parseTranslationsToDrafts = (raw: any) => {
    const nextDrafts = createEmptyTranslationDrafts();
    if (!isPlainObject(raw)) {
      setTranslationDrafts(nextDrafts);
      return;
    }

    Object.entries(raw).forEach(([lang, data]) => {
      if (!nextDrafts[lang] || !data || typeof data !== "object") return;
      const instructions = normalizeInstructionList((data as Record<string, any>).instructions).join("\n");
      nextDrafts[lang] = {
        title: typeof (data as Record<string, any>).title === "string" ? (data as Record<string, any>).title : "",
        description:
          typeof (data as Record<string, any>).description === "string"
            ? (data as Record<string, any>).description
            : "",
        instructions,
        tips: readAdviceValue(data as Record<string, any>, ["tips", "cooking_tips"]),
        serving_tips: readAdviceValue(data as Record<string, any>, ["serving_tips", "serving"]),
        storage_tips: readAdviceValue(data as Record<string, any>, ["storage_tips", "storage"]),
        recipe_note: readAdviceValue(data as Record<string, any>, ["recipe_note", "note"]),
      };
    });

    setTranslationDrafts(nextDrafts);
  };

  const buildTranslationsPayload = () => {
    const base = getBaseTextContent();
    let rawTranslations: Record<string, any> = {};

    if (form.translations.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(form.translations);
      } catch {
        throw new Error("Поле translations должно содержать валидный JSON");
      }

      if (!isPlainObject(parsed)) {
        throw new Error("Поле translations должно быть JSON-объектом");
      }

      rawTranslations = normalizeTranslationsObject(parsed, base);
    }

    translationLanguages.forEach(({ code }) => {
      const draft = translationDrafts[code];
      if (!draft) return;

      const next = isPlainObject(rawTranslations[code]) ? { ...rawTranslations[code] } : {};
      delete next.title;
      delete next.description;
      delete next.instructions;
      delete next.tips;
      delete next.cooking_tips;
      delete next.serving_tips;
      delete next.serving;
      delete next.storage_tips;
      delete next.storage;
      delete next.recipe_note;
      delete next.note;
      delete next.dish_type;
      delete next.course;

      const title = draft.title.trim();
      const description = draft.description.trim();
      const instructions = draft.instructions
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
      const tips = normalizeLongText(draft.tips);
      const servingTips = normalizeLongText(draft.serving_tips);
      const storageTips = normalizeLongText(draft.storage_tips);
      const recipeNote = normalizeLongText(draft.recipe_note);

      if (title && title !== base.title) {
        next.title = title;
      }
      if (description && description !== base.description) {
        next.description = description;
      }
      if (instructions.length && !stringArraysEqual(instructions, base.instructions)) {
        next.instructions = instructions;
      }
      if (tips && tips !== base.tips) {
        next.tips = tips;
      }
      if (servingTips && servingTips !== base.serving_tips) {
        next.serving_tips = servingTips;
      }
      if (storageTips && storageTips !== base.storage_tips) {
        next.storage_tips = storageTips;
      }
      if (recipeNote && recipeNote !== base.recipe_note) {
        next.recipe_note = recipeNote;
      }

      if (Object.keys(next).length > 0) {
        rawTranslations[code] = next;
      } else {
        delete rawTranslations[code];
      }
    });

    return rawTranslations;
  };

  const applyBaseInstructions = (lang: string) => {
    updateTranslationDraft(lang, { instructions: getBaseTextContent().instructions.join("\n") });
  };

  function applyImportRecipe(raw: string) {
    setImportStatus("");
    const trimmed = raw.trim();
    if (!trimmed) {
      setImportStatus("Вставьте JSON рецепта.");
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setImportStatus("Ошибка JSON: проверь формат.");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setImportStatus("Неверный формат: ожидается объект.");
      return;
    }

    const normalized = parsed.recipe && typeof parsed.recipe === "object" ? parsed.recipe : parsed;
    const toText = (value: any) => (value === null || value === undefined ? "" : String(value));
    const toJsonText = (value: any) => (value ? JSON.stringify(value) : "");
    const toNumber = (value: any) => {
      if (value === null || value === undefined || value === "") return "";
      const parsedNumber = Number(value);
      return Number.isFinite(parsedNumber) ? parsedNumber : "";
    };
    const rawSteps = Array.isArray(normalized.steps) ? normalized.steps : [];
    const resolveStepText = (step: any) =>
      typeof step === "string"
        ? step
        : toText(step?.text || step?.instruction || step?.description);
    const instructionsArray = Array.isArray(normalized.instructions)
      ? normalizeInstructionList(normalized.instructions)
      : rawSteps.length > 0
        ? rawSteps.map((step: any) => resolveStepText(step)).filter(Boolean)
        : typeof normalized.instructions === "string"
          ? normalizeInstructionList(JSON.parse(normalized.instructions || "[]"))
          : [];
    const normalizedRecipeNutrition = normalizeNutritionObject(
      normalized.recipe_nutrition ?? normalized.recipeNutrition ?? normalized.nutrition ?? normalized.macros
    );
    const normalizedNutritionPer100g = normalizeNutritionObject(
      normalized.nutrition_per_100g ?? normalized.nutritionPer100g
    );
    const normalizedTranslations = normalizeTranslationsObject(normalized.translations, {
      title: toText(normalized.title).trim(),
      description: toText(normalized.description).trim(),
      instructions: instructionsArray
        .map((step: any) => String(step ?? "").trim())
        .filter(Boolean),
      tips: readAdviceValue(normalized, ["tips", "cooking_tips"]),
      serving_tips: readAdviceValue(normalized, ["serving_tips", "serving"]),
      storage_tips: readAdviceValue(normalized, ["storage_tips", "storage"]),
      recipe_note: readAdviceValue(normalized, ["recipe_note", "note"]),
    });

    setForm(prev => ({
      ...prev,
      id: normalized.id || prev.id,
      title: normalized.title || prev.title,
      description: toText(normalized.description),
      image_url: toText(normalized.image_url || normalized.imageUrl),
      cuisine_id: normalized.cuisine_id || prev.cuisine_id,
      dish_type: toText(normalized.dish_type),
      course: toText(normalized.course),
      owner_id: toText(normalized.owner_id),
      is_user_defined: String(normalized.is_user_defined ?? false),
      author: toText(normalized.author),
      contributor_ids: normalized.contributor_ids ? JSON.stringify(normalized.contributor_ids) : "",
      servings: normalized.servings ?? prev.servings,
      prep_time: toText(normalized.prep_time ?? normalized.prepTime),
      cook_time: toText(normalized.cook_time ?? normalized.cookTime),
      difficulty: normalized.difficulty || prev.difficulty,
      diet_tags: Array.isArray(normalized.diet_tags) ? normalized.diet_tags.join(", ") : toText(normalized.diet_tags),
      allergen_tags: Array.isArray(normalized.allergen_tags) ? normalized.allergen_tags.join(", ") : toText(normalized.allergen_tags),
      tags: parseTagsField(normalized.tags).length > 0
        ? parseTagsField(normalized.tags)
        : prev.tags,
      cuisine_tags: Array.isArray(normalized.cuisine_tags)
        ? normalized.cuisine_tags.join(", ")
        : toText(normalized.cuisine_tags),
      equipment: Array.isArray(normalized.equipment) ? normalized.equipment.join(", ") : toText(normalized.equipment),
      tools_optional: Array.isArray(normalized.tools_optional) ? normalized.tools_optional.join(", ") : toText(normalized.tools_optional),
      calories: toText(normalized.calories ?? normalizedRecipeNutrition?.calories),
      protein: toText(normalized.protein ?? normalizedRecipeNutrition?.protein),
      fat: toText(normalized.fat ?? normalizedRecipeNutrition?.fat),
      carbs: toText(normalized.carbs ?? normalizedRecipeNutrition?.carbs),
      fiber: toText(normalized.fiber ?? normalizedRecipeNutrition?.fiber),
      sugar: toText(normalized.sugar ?? normalizedRecipeNutrition?.sugar),
      salt: toText(normalized.salt ?? normalizedRecipeNutrition?.salt),
      saturated_fat: toText(normalized.saturated_fat ?? normalizedRecipeNutrition?.saturated_fat),
      cholesterol: toText(normalized.cholesterol ?? normalizedRecipeNutrition?.cholesterol),
      sodium: toText(normalized.sodium ?? normalizedRecipeNutrition?.sodium),
      nutrition_per_100g: normalizedNutritionPer100g ? JSON.stringify(normalizedNutritionPer100g) : "",
      tips: readAdviceValue(normalized, ["tips", "cooking_tips"]),
      serving_tips: readAdviceValue(normalized, ["serving_tips", "serving"]),
      storage_tips: readAdviceValue(normalized, ["storage_tips", "storage"]),
      recipe_note: readAdviceValue(normalized, ["recipe_note", "note"]),
      instructions: instructionsArray.length ? JSON.stringify(instructionsArray) : toJsonText(normalized.instructions),
      comments_enabled: String(normalized.comments_enabled ?? true),
      comments_count: toText(normalized.comments_count),
      translations: Object.keys(normalizedTranslations).length
        ? JSON.stringify(normalizedTranslations, null, 2)
        : "",
      step_images: toJsonText(normalized.step_images || normalized.stepImages),
    }));

    if (Object.keys(normalizedTranslations).length > 0) {
      parseTranslationsToDrafts(normalizedTranslations);
    } else {
      parseTranslationsToDrafts({});
    }

    const resolveIngredientsSource = () => {
      if (Array.isArray(normalized.ingredients) && normalized.ingredients.length > 0) {
        return normalized.ingredients;
      }
      if (normalized.translations && typeof normalized.translations === "object") {
        const translations = normalized.translations as Record<string, any>;
        if (Array.isArray(translations.ru?.ingredients)) {
          return translations.ru.ingredients;
        }
        const firstWithIngredients = Object.values(translations).find(
          (entry) => Array.isArray(entry?.ingredients) && entry.ingredients.length > 0
        );
        if (firstWithIngredients) {
          return firstWithIngredients.ingredients;
        }
      }
      return null;
    };

    const ingredientsSource = resolveIngredientsSource();
    if (ingredientsSource) {
      const loadedIngredients: Ingredient[] = ingredientsSource.map((ing: any) => ({
        id: crypto.randomUUID(),
        productId: toText(ing?.id),
        productName: toText(ing?.name || ing?.productName || ing?.title),
        quantity: toNumber(ing?.quantity ?? ing?.amount),
        unit: toText(ing?.unit || "g") || "g",
      }));
      setIngredients(loadedIngredients);
    }

    const instructionsData = instructionsArray;
    const stepImagesData = parseStepImagesArray(normalized.step_images || normalized.stepImages);

    const maxSteps = Math.max(instructionsData.length, stepImagesData.length, rawSteps.length);
    const loadedSteps: RecipeStep[] = [];
    for (let i = 0; i < maxSteps; i += 1) {
      const rawStep = rawSteps[i];
      const stepText = instructionsData[i] || resolveStepText(rawStep) || "";
      const rawStepDuration =
        typeof rawStep === "object" && rawStep !== null
          ? rawStep.duration_minutes ??
            rawStep.durationMinutes ??
            rawStep.timer_minutes ??
            rawStep.timerMinutes ??
            rawStep.timer ??
            rawStep.duration
          : null;
      const stepImageRecord = resolveStepImageRecord(stepImagesData, i);
      loadedSteps.push({
        id: crypto.randomUUID(),
        text: stepText,
        imageUrl:
          stepImageRecord?.image_url ||
          stepImageRecord?.imageUrl ||
          (typeof rawStep === "object" && rawStep !== null
            ? rawStep.image_url || rawStep.imageUrl || ""
            : ""),
        durationMinutes: parseDurationMinutes(
          stepImageRecord?.duration_minutes ??
            stepImageRecord?.durationMinutes ??
            rawStepDuration,
          stepText
        ),
      });
    }
    if (loadedSteps.length > 0) {
      setSteps(loadedSteps);
    }

    setImportStatus("Готово ✅ Данные применены");
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    setImportText(text);
  }

  async function handleInstagramImport() {
    const url = instagramUrl.trim();
    if (!url) {
      setInstagramStatus("Вставьте ссылку на Instagram.");
      return;
    }

    setInstagramLoading(true);
    setInstagramStatus("Импортируем...");

    try {
      const response = await fetch(instagramApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();

      if (!response.ok) {
        setInstagramStatus(data.error || "Ошибка импорта Instagram.");
        return;
      }

      const payload = data?.recipe ? { recipe: data.recipe } : data;
      applyImportRecipe(JSON.stringify(payload));
      setInstagramStatus("Готово ✅ Данные применены");
      setShowInstagramModal(false);
    } catch (error) {
      setInstagramStatus(error instanceof Error ? error.message : "Ошибка импорта Instagram.");
    } finally {
      setInstagramLoading(false);
    }
  }

  function handleTranslationsJsonChange(value: string) {
    setForm(prev => ({ ...prev, translations: value }));

    if (!value.trim()) {
      parseTranslationsToDrafts({});
      return;
    }

    try {
      const parsed = JSON.parse(value);
      const normalized = normalizeTranslationsObject(parsed, getBaseTextContent());
      parseTranslationsToDrafts(normalized);
    } catch {
      // Keep raw JSON editable even while it is temporarily invalid.
    }
  }

  async function loadCuisines() {
    try {
      const response = await fetch("/api/admin/cuisines");
      const result = await response.json();
      setCuisines(result.data || []);
    } catch (error) {
      console.error("Failed to load cuisines:", error);
    }
  }

  async function loadRecipe(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/recipes/${id}`);
      const result = await response.json();
      const recipe = result.recipe;
      if (recipe) {
        const instructionsData = typeof recipe.instructions === 'string'
          ? JSON.parse(recipe.instructions || "[]")
          : recipe.instructions || [];
        const normalizedTranslations = normalizeTranslationsObject(recipe.translations, {
          title: (recipe.title || "").trim(),
          description: (recipe.description || "").trim(),
          instructions: Array.isArray(instructionsData)
            ? instructionsData.map((step: any) => String(step ?? "").trim()).filter(Boolean)
            : [],
          tips: normalizeLongText(recipe.tips || ""),
          serving_tips: normalizeLongText(recipe.serving_tips || ""),
          storage_tips: normalizeLongText(recipe.storage_tips || ""),
          recipe_note: normalizeLongText(recipe.recipe_note || ""),
        });

        setForm({
          id: recipe.id || "",
          title: recipe.title || "",
          description: recipe.description || "",
          image_url: recipe.image_url || "",
          step_images: recipe.step_images ? JSON.stringify(recipe.step_images) : "",
          cuisine_id: recipe.cuisine_id || "",
          dish_type: recipe.dish_type || "",
          course: recipe.course || "",
          owner_id: recipe.owner_id || "",
          is_user_defined: String(recipe.is_user_defined ?? false),
          author: recipe.author || "",
          contributor_ids: recipe.contributor_ids ? JSON.stringify(recipe.contributor_ids) : "",
          servings: recipe.servings || 4,
          prep_time: recipe.prep_time?.toString() || "",
          cook_time: recipe.cook_time?.toString() || "",
          difficulty: recipe.difficulty || "medium",
          tags: parseTagsField(recipe.tags),
          diet_tags: Array.isArray(recipe.diet_tags) ? recipe.diet_tags.join(", ") : "",
          allergen_tags: Array.isArray(recipe.allergen_tags) ? recipe.allergen_tags.join(", ") : "",
          cuisine_tags: Array.isArray(recipe.cuisine_tags) ? recipe.cuisine_tags.join(", ") : "",
          equipment: Array.isArray(recipe.equipment) ? recipe.equipment.join(", ") : "",
          tools_optional: Array.isArray(recipe.tools_optional) ? recipe.tools_optional.join(", ") : "",
          calories: recipe.calories?.toString() || "",
          protein: recipe.protein?.toString() || "",
          fat: recipe.fat?.toString() || "",
          carbs: recipe.carbs?.toString() || "",
          fiber: recipe.fiber?.toString() || "",
          sugar: recipe.sugar?.toString() || "",
          salt: recipe.salt?.toString() || "",
          saturated_fat: recipe.saturated_fat?.toString() || "",
          cholesterol: recipe.cholesterol?.toString() || "",
          sodium: recipe.sodium?.toString() || "",
          nutrition_per_100g: recipe.nutrition_per_100g ? JSON.stringify(recipe.nutrition_per_100g) : "",
          tips: recipe.tips || "",
          serving_tips: recipe.serving_tips || "",
          storage_tips: recipe.storage_tips || "",
          recipe_note: recipe.recipe_note || "",
          instructions: typeof recipe.instructions === 'string' ? recipe.instructions : JSON.stringify(recipe.instructions),
          comments_enabled: String(recipe.comments_enabled ?? true),
          comments_count: recipe.comments_count?.toString() || "",
          translations: Object.keys(normalizedTranslations).length
            ? JSON.stringify(normalizedTranslations, null, 2)
            : "",
        });

        if (Object.keys(normalizedTranslations).length > 0) {
          parseTranslationsToDrafts(normalizedTranslations);
        } else {
          parseTranslationsToDrafts({});
        }

        if (Array.isArray(result.ingredients) && result.ingredients.length > 0) {
          const ingredientsData = result.ingredients;

          const loadedIngredients: Ingredient[] = ingredientsData.map((ing: any) => ({
            id: crypto.randomUUID(),
            productId: ing.product_dictionary_id || ing.productId || '',
            productName: ing.name || ing.product_name || ing.productName || '',
            quantity: ing.amount ?? ing.quantity ?? 0,
            unit: ing.unit || 'g',
          }));

          setIngredients(loadedIngredients);
        } else if (recipe.ingredients) {
          const ingredientsData = typeof recipe.ingredients === 'string'
            ? JSON.parse(recipe.ingredients)
            : recipe.ingredients;

          const loadedIngredients: Ingredient[] = ingredientsData.map((ing: any) => ({
            id: crypto.randomUUID(),
            productId: ing.id || '',
            productName: ing.name || '',
            quantity: ing.quantity || 0,
            unit: ing.unit || 'g',
          }));

          setIngredients(loadedIngredients);
        }

        if (Array.isArray(result.steps) && result.steps.length > 0) {
          const instructionsData = result.steps.map((step: any) => step.text || "");
          const stepImagesData = parseStepImagesArray(recipe.step_images);

          const maxSteps = Math.max(instructionsData.length, stepImagesData.length, result.steps.length);
          const loadedSteps: RecipeStep[] = [];

          for (let i = 0; i < maxSteps; i += 1) {
            const stepText = instructionsData[i] || "";
            const stepImageRecord = resolveStepImageRecord(stepImagesData, i);
            const stepImage = stepImageRecord?.image_url || stepImageRecord?.imageUrl || "";
            const stepDuration = parseDurationMinutes(
              stepImageRecord?.duration_minutes ?? stepImageRecord?.durationMinutes,
              stepText
            );
            loadedSteps.push({
              id: crypto.randomUUID(),
              text: stepText,
              imageUrl: stepImage,
              durationMinutes: stepDuration,
            });
          }

          setSteps(loadedSteps);
        } else if (recipe.instructions || recipe.step_images) {
          const instructionsData = typeof recipe.instructions === 'string'
            ? JSON.parse(recipe.instructions || "[]")
            : recipe.instructions || [];

          const stepImagesData = parseStepImagesArray(recipe.step_images);

          const maxSteps = Math.max(instructionsData.length, stepImagesData.length);
          const loadedSteps: RecipeStep[] = [];

          for (let i = 0; i < maxSteps; i += 1) {
            const stepText = instructionsData[i] || "";
            const stepImageRecord = resolveStepImageRecord(stepImagesData, i);
            const stepImage = stepImageRecord?.image_url || stepImageRecord?.imageUrl || "";
            const stepDuration = parseDurationMinutes(
              stepImageRecord?.duration_minutes ?? stepImageRecord?.durationMinutes,
              stepText
            );
            loadedSteps.push({
              id: crypto.randomUUID(),
              text: stepText,
              imageUrl: stepImage,
              durationMinutes: stepDuration,
            });
          }

          setSteps(loadedSteps);
        }
      }
    } catch (error) {
      console.error("Failed to load recipe:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.title || !form.cuisine_id) {
      alert("Заполните обязательные поля: название и каталог");
      return;
    }

    const mealTagAliases = [
      "breakfast", "завтрак", "сніданок", "brunch",
      "lunch", "обед", "обід",
      "dinner", "supper", "ужин", "вечеря",
      "snack",
    ];
    const hasMealTag = form.tags.some(t => mealTagAliases.includes(t.toLowerCase()));
    if (!hasMealTag) {
      alert("Укажите хотя бы один тег приёма пищи:\nbreakfast / lunch / dinner / snack\n\nЕсли вставили JSON с тегами — убедитесь что поле \"tags\" есть в JSON и содержит один из этих тегов.");
      return;
    }

    setLoading(true);
    try {
      let translationsJson: string | null = null;
      try {
        const translationsPayload = buildTranslationsPayload();
        translationsJson = Object.keys(translationsPayload).length
          ? JSON.stringify(translationsPayload)
          : null;
      } catch (error) {
        alert(error instanceof Error ? error.message : "Ошибка перевода");
        setLoading(false);
        return;
      }

      const ingredientsJson = ingredients.map(ing => ({
        id: ing.productId,
        name: ing.productName,
        quantity: ing.quantity,
        unit: ing.unit,
      }));

      const instructionsJson = steps
        .filter(step => step.text.trim().length > 0)
        .map(step => step.text.trim());

      const stepImagesJson = steps.flatMap((step, index) => {
        const imageUrl = step.imageUrl.trim();
        const durationMinutes = step.durationMinutes > 0 ? step.durationMinutes : null;
        if (!imageUrl && durationMinutes === null) {
          return [];
        }

        return [{
          step: index + 1,
          image_url: imageUrl || null,
          duration_minutes: durationMinutes,
        }];
      });

      const payload = {
        id: form.id || crypto.randomUUID(),
        title: form.title,
        description: form.description || null,
        image_url: form.image_url || null,
        step_images: stepImagesJson.length ? JSON.stringify(stepImagesJson) : null,
        cuisine_id: form.cuisine_id,
        dish_type: form.dish_type || null,
        course: form.course || null,
        owner_id: form.owner_id || null,
        is_user_defined: form.is_user_defined === "true",
        author: form.author || null,
        contributor_ids: form.contributor_ids || null,
        servings: form.servings,
        prep_time: form.prep_time ? parseInt(form.prep_time) : null,
        cook_time: form.cook_time ? parseInt(form.cook_time) : null,
        difficulty: form.difficulty,
        tags: form.tags,
        diet_tags: form.diet_tags ? form.diet_tags.split(",").map(t => t.trim()) : [],
        allergen_tags: form.allergen_tags ? form.allergen_tags.split(",").map(t => t.trim()) : [],
        cuisine_tags: form.cuisine_tags ? form.cuisine_tags.split(",").map(t => t.trim()) : [],
        equipment: form.equipment ? form.equipment.split(",").map(e => e.trim()) : [],
        tools_optional: form.tools_optional ? form.tools_optional.split(",").map(e => e.trim()) : [],
        calories: form.calories ? parseFloat(form.calories) : null,
        protein: form.protein ? parseFloat(form.protein) : null,
        fat: form.fat ? parseFloat(form.fat) : null,
        carbs: form.carbs ? parseFloat(form.carbs) : null,
        fiber: form.fiber ? parseFloat(form.fiber) : null,
        sugar: form.sugar ? parseFloat(form.sugar) : null,
        salt: form.salt ? parseFloat(form.salt) : null,
        saturated_fat: form.saturated_fat ? parseFloat(form.saturated_fat) : null,
        cholesterol: form.cholesterol ? parseFloat(form.cholesterol) : null,
        sodium: form.sodium ? parseFloat(form.sodium) : null,
        nutrition_per_100g: form.nutrition_per_100g || null,
        tips: normalizeLongText(form.tips) || null,
        serving_tips: normalizeLongText(form.serving_tips) || null,
        storage_tips: normalizeLongText(form.storage_tips) || null,
        recipe_note: normalizeLongText(form.recipe_note) || null,
        ingredients: JSON.stringify(ingredientsJson),
        instructions: JSON.stringify(instructionsJson),
        comments_enabled: form.comments_enabled === "true",
        comments_count: form.comments_count ? parseInt(form.comments_count) : null,
        translations: translationsJson,
      };

      console.log("💾 Saving recipe nutrition:", {
        title: payload.title,
        calories: payload.calories,
        protein: payload.protein,
        fat: payload.fat,
        carbs: payload.carbs,
      });

      const response = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert("Рецепт сохранен!");
        if (!editId) {
          router.push(cuisineId ? `/catalogs/${cuisineId}` : "/catalogs");
        }
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save recipe:", error);
      alert("Ошибка при сохранении рецепта");
    } finally {
      setLoading(false);
    }
  }

  const selectedCuisine = cuisines.find(c => c.id === form.cuisine_id);
  const importPrompt = buildRecipeImportPrompt({
    selectedCuisine,
    cuisines,
    form,
    isEditing: Boolean(editId),
  });
  const activeTranslation = translationDrafts[activeTranslationLang] || emptyTranslationDraft;
  const translationsJsonPreview = (() => {
    try {
      const payload = buildTranslationsPayload();
      return Object.keys(payload).length ? JSON.stringify(payload, null, 2) : "";
    } catch {
      return form.translations;
    }
  })();
  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  };

  if (loading && editId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: 'var(--text-secondary)',
      }}>
        Загрузка рецепта...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-xl)', height: 'calc(100vh - 64px)' }}>
      {/* Left: Preview */}
      <div style={{
        width: '380px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-xl)',
        boxShadow: 'var(--shadow-card)',
        overflowY: 'auto',
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: 600,
          marginBottom: 'var(--spacing-lg)',
          color: 'var(--text-primary)',
        }}>
          Preview в приложении
        </h3>

        {/* Recipe Card Preview */}
        <div style={{
          background: '#f9f9fb',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border-light)',
        }}>
          {/* Image */}
          {form.image_url ? (
            <img
              src={form.image_url}
              alt={form.title}
              style={{
                width: '100%',
                height: '180px',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '180px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '56px',
            }}>
              🍽️
            </div>
          )}

          {/* Content */}
          <div style={{ padding: 'var(--spacing-md)' }}>
            <div style={{
              fontSize: '11px',
              color: '#667eea',
              fontWeight: 600,
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}>
              {selectedCuisine?.name || 'Категория'}
            </div>

            <h2 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#1a1a1a',
              marginBottom: 'var(--spacing-xs)',
            }}>
              {form.title || 'Название рецепта'}
            </h2>

            {form.description && (
              <p style={{
                fontSize: '13px',
                color: '#6e6e73',
                marginBottom: 'var(--spacing-sm)',
                lineHeight: 1.4,
              }}>
                {form.description}
              </p>
            )}

            {/* Meta Info */}
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)',
              fontSize: '12px',
              color: '#6e6e73',
            }}>
              {form.servings && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>👥</span>
                  <span>{form.servings} порций</span>
                </div>
              )}
              {(form.prep_time || form.cook_time) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⏱️</span>
                  <span>{(parseInt(form.prep_time) || 0) + (parseInt(form.cook_time) || 0)} мин</span>
                </div>
              )}
            </div>

            {/* Ingredients Preview */}
            {ingredients.length > 0 && (
              <div>
                <h4 style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: 'var(--spacing-xs)',
                  color: '#1a1a1a',
                }}>
                  Ингредиенты:
                </h4>
                <div style={{
                  background: 'white',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--spacing-xs)',
                  border: '1px solid #e5e5e7',
                }}>
                  {ingredients.slice(0, 3).map((ing, idx) => (
                    <div
                      key={ing.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: idx < Math.min(2, ingredients.length - 1) ? '1px solid #f0f0f0' : 'none',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: '#1a1a1a' }}>{ing.productName}</span>
                      <span style={{ color: '#6e6e73' }}>{ing.quantity}{ing.unit}</span>
                    </div>
                  ))}
                  {ingredients.length > 3 && (
                    <div style={{
                      textAlign: 'center',
                      padding: '4px 0',
                      fontSize: '11px',
                      color: '#667eea',
                    }}>
                      +{ingredients.length - 3} ещё
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingRight: 'var(--spacing-md)',
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 'var(--spacing-xl)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            {editId ? 'Редактировать рецепт' : 'Создать рецепт'}
          </h1>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowImportModal(true)}
            >
              Импорт JSON
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowInstagramModal(true)}
            >
              Импорт Instagram
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => router.back()}
              style={{ minWidth: '100px' }}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
              style={{ minWidth: '120px' }}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Основное */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowMainSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Основное
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showMainSection ? "▾" : "▸"}
            </span>
          </button>

          {showMainSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />
              {/* Название рецепта */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: 'var(--spacing-xs)',
                  color: 'var(--text-primary)',
                }}>
                  Название рецепта *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Борщ классический"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

          {/* Описание */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: 'var(--spacing-xs)',
              color: 'var(--text-primary)',
            }}>
              Описание
            </label>
            <textarea
              className="input"
              placeholder="Короткое описание рецепта"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Нюансы и советы
              </label>
              <textarea
                className="input"
                placeholder="Важные нюансы приготовления, ошибки, тонкости."
                value={form.tips}
                onChange={(e) => setForm({ ...form, tips: e.target.value })}
                rows={4}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Подача
              </label>
              <textarea
                className="input"
                placeholder="Как и с чем лучше подавать."
                value={form.serving_tips}
                onChange={(e) => setForm({ ...form, serving_tips: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Хранение
              </label>
              <textarea
                className="input"
                placeholder="Условия и срок хранения."
                value={form.storage_tips}
                onChange={(e) => setForm({ ...form, storage_tips: e.target.value })}
                rows={4}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Заметка
              </label>
              <textarea
                className="input"
                placeholder="Дополнительная заметка к рецепту."
                value={form.recipe_note}
                onChange={(e) => setForm({ ...form, recipe_note: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          {/* 2 колонки: Каталог и Сложность */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Каталог (кухня) *
              </label>
              <select
                className="input"
                value={form.cuisine_id}
                onChange={(e) => setForm({ ...form, cuisine_id: e.target.value })}
              >
                <option value="">Выберите каталог</option>
                {cuisines.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Сложность
              </label>
              <select
                className="input"
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              >
                <option value="easy">Легко</option>
                <option value="medium">Средне</option>
                <option value="hard">Сложно</option>
              </select>
            </div>
          </div>

          {/* URL изображения */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: 'var(--spacing-xs)',
              color: 'var(--text-primary)',
            }}>
              URL изображения
            </label>
            <input
              type="text"
              className="input"
              placeholder="https://example.com/image.jpg"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>

          {/* 2 колонки: Тип блюда и Курс */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Тип блюда (dish_type)
              </label>
              <input
                type="text"
                className="input"
                placeholder="soup, main, dessert"
                value={form.dish_type}
                onChange={(e) => setForm({ ...form, dish_type: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                Курс (course)
              </label>
              <input
                type="text"
                className="input"
                placeholder="breakfast, lunch, dinner"
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
              />
            </div>
          </div>

          {/* 2 колонки: owner_id и user_defined */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                owner_id (UUID)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input"
                  value={form.owner_id}
                  onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setForm({ ...form, owner_id: crypto.randomUUID() })}
                >
                  Сгенерировать
                </button>
              </div>
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                is_user_defined
              </label>
              <select
                className="input"
                value={form.is_user_defined}
                onChange={(e) => setForm({ ...form, is_user_defined: e.target.value })}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </div>
          </div>

          {/* 2 колонки: author и contributor_ids */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                author
              </label>
              <input
                type="text"
                className="input"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                contributor_ids (JSON/через запятую)
              </label>
              <input
                type="text"
                className="input"
                value={form.contributor_ids}
                onChange={(e) => setForm({ ...form, contributor_ids: e.target.value })}
              />
            </div>
          </div>

              {/* 3 колонки: Порций, Время подготовки, Время готовки */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 'var(--spacing-lg)',
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: 'var(--spacing-xs)',
                    color: 'var(--text-primary)',
                  }}>
                    Порций
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={form.servings}
                    onChange={(e) => setForm({ ...form, servings: parseInt(e.target.value) || 4 })}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: 'var(--spacing-xs)',
                    color: 'var(--text-primary)',
                  }}>
                    Время подготовки (мин)
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="15"
                    value={form.prep_time}
                    onChange={(e) => setForm({ ...form, prep_time: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: 'var(--spacing-xs)',
                    color: 'var(--text-primary)',
                  }}>
                    Время готовки (мин)
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="30"
                    value={form.cook_time}
                    onChange={(e) => setForm({ ...form, cook_time: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Теги и питание */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowTagsSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Теги и питание
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showTagsSection ? "▾" : "▸"}
            </span>
          </button>
          {showTagsSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />

              {/* ── Рулеточные теги (tags[]) ── */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '2px solid var(--color-primary, #f97316)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: 'var(--spacing-lg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🎰</span>
                  <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                    Теги для рулетки
                  </strong>
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>* обязательно</span>
                </div>
                {[
                  {
                    label: 'Приём пищи (обязательно ≥1)',
                    required: true,
                    tags: ['breakfast', 'lunch', 'dinner', 'snack'],
                  },
                  {
                    label: 'Скорость / Повод',
                    required: false,
                    tags: ['quick', 'special occasion'],
                  },
                  {
                    label: 'Сытность',
                    required: false,
                    tags: ['light', 'hearty'],
                  },
                  {
                    label: 'Тип блюда',
                    required: false,
                    tags: ['soup', 'salad', 'pasta', 'grill', 'baking', 'raw'],
                  },
                  {
                    label: 'Диета',
                    required: false,
                    tags: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
                  },
                ].map(group => (
                  <div key={group.label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                      {group.label}
                      {group.required && !group.tags.some(t => form.tags.includes(t)) && (
                        <span style={{ color: '#ef4444', marginLeft: 6 }}>← выберите</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {group.tags.map(tag => {
                        const active = form.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setForm(prev => ({
                              ...prev,
                              tags: active
                                ? prev.tags.filter(t => t !== tag)
                                : [...prev.tags, tag],
                            }))}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              border: active ? '2px solid var(--color-primary, #f97316)' : '1px solid var(--border-light)',
                              background: active ? 'var(--color-primary, #f97316)' : 'var(--bg-base)',
                              color: active ? '#fff' : 'var(--text-primary)',
                              fontSize: 13,
                              fontWeight: active ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {form.tags.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Выбрано: <strong>{form.tags.join(', ')}</strong>
                  </div>
                )}
              </div>

              <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                diet_tags
              </label>
              <input
                type="text"
                className="input"
                placeholder="keto, vegan"
                value={form.diet_tags}
                onChange={(e) => setForm({ ...form, diet_tags: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                allergen_tags
              </label>
              <input
                type="text"
                className="input"
                placeholder="nuts, milk"
                value={form.allergen_tags}
                onChange={(e) => setForm({ ...form, allergen_tags: e.target.value })}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                cuisine_tags
              </label>
              <input
                type="text"
                className="input"
                placeholder="italian"
                value={form.cuisine_tags}
                onChange={(e) => setForm({ ...form, cuisine_tags: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                equipment
              </label>
              <input
                type="text"
                className="input"
                placeholder="oven, blender"
                value={form.equipment}
                onChange={(e) => setForm({ ...form, equipment: e.target.value })}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                tools_optional
              </label>
              <input
                type="text"
                className="input"
                placeholder="mixer"
                value={form.tools_optional}
                onChange={(e) => setForm({ ...form, tools_optional: e.target.value })}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                calories
              </label>
              <input
                type="number"
                className="input"
                value={form.calories}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                protein
              </label>
              <input
                type="number"
                className="input"
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                fat
              </label>
              <input
                type="number"
                className="input"
                value={form.fat}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                carbs
              </label>
              <input
                type="number"
                className="input"
                value={form.carbs}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                fiber
              </label>
              <input
                type="number"
                className="input"
                value={form.fiber}
                onChange={(e) => setForm({ ...form, fiber: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                sugar
              </label>
              <input
                type="number"
                className="input"
                value={form.sugar}
                onChange={(e) => setForm({ ...form, sugar: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                salt
              </label>
              <input
                type="number"
                className="input"
                value={form.salt}
                onChange={(e) => setForm({ ...form, salt: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                saturated_fat
              </label>
              <input
                type="number"
                className="input"
                value={form.saturated_fat}
                onChange={(e) => setForm({ ...form, saturated_fat: e.target.value })}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                cholesterol
              </label>
              <input
                type="number"
                className="input"
                value={form.cholesterol}
                onChange={(e) => setForm({ ...form, cholesterol: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                sodium
              </label>
              <input
                type="number"
                className="input"
                value={form.sodium}
                onChange={(e) => setForm({ ...form, sodium: e.target.value })}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: 'var(--spacing-xs)',
                color: 'var(--text-primary)',
              }}>
                nutrition_per_100g (JSON)
              </label>
              <textarea
                className="input"
                placeholder='{"calories":120,"protein":10}'
                value={form.nutrition_per_100g}
                onChange={(e) => setForm({ ...form, nutrition_per_100g: e.target.value })}
                rows={3}
                style={{ fontFamily: 'monospace', fontSize: '13px' }}
              />
            </div>
          </div>
            </>
          )}
        </div>

        {/* Инструкции */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowInstructionsSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Инструкции по приготовлению
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showInstructionsSection ? "▾" : "▸"}
            </span>
          </button>

          {showInstructionsSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {steps.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Добавьте первый шаг.
                  </div>
                )}
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-md)',
                      background: 'white',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 'var(--spacing-sm)',
                    }}>
                      <strong>Шаг {index + 1}</strong>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                      >
                        Удалить
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--spacing-sm)' }}>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: 'var(--spacing-xs)',
                          color: 'var(--text-primary)',
                        }}>
                          Текст шага
                        </label>
                        <textarea
                          className="input"
                          placeholder="Шаг 1: Подготовить ингредиенты"
                          value={step.text}
                          onChange={(e) => {
                            const updated = steps.map(s => s.id === step.id ? { ...s, text: e.target.value } : s);
                            setSteps(updated);
                          }}
                          rows={3}
                        />
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: 'var(--spacing-xs)',
                          color: 'var(--text-primary)',
                        }}>
                          URL изображения шага
                        </label>
                        <input
                          className="input"
                          type="text"
                          placeholder="https://example.com/step.jpg"
                          value={step.imageUrl}
                          onChange={(e) => {
                            const updated = steps.map(s => s.id === step.id ? { ...s, imageUrl: e.target.value } : s);
                            setSteps(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: 'var(--spacing-xs)',
                          color: 'var(--text-primary)',
                        }}>
                          Время выполнения (минуты)
                        </label>
                        <input
                          className="input"
                          type="number"
                          placeholder="40"
                          min="0"
                          value={step.durationMinutes || ''}
                          onChange={(e) => {
                            const updated = steps.map(s => s.id === step.id ? { ...s, durationMinutes: parseInt(e.target.value) || 0 } : s);
                            setSteps(updated);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setSteps([...steps, { id: crypto.randomUUID(), text: "", imageUrl: "", durationMinutes: 0 }])}
                >
                  + Добавить шаг
                </button>
              </div>
            </>
          )}
        </div>

        {/* Ингредиенты */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowIngredientsSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Ингредиенты
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showIngredientsSection ? "▾" : "▸"}
            </span>
          </button>

          {showIngredientsSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />
              <RecipeIngredientsEditor
                value={ingredients}
                onChange={setIngredients}
                servings={form.servings}
              />
            </>
          )}
        </div>

        {/* Переводы */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowTranslationsSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Переводы
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showTranslationsSection ? "▾" : "▸"}
            </span>
          </button>

          {showTranslationsSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />
              <div style={{
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)',
                background: 'var(--bg-page)',
              }}>
                <div style={{
                  marginBottom: 'var(--spacing-md)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fff8e8',
                  border: '1px solid #f2d59c',
                  fontSize: '13px',
                  color: '#7a5c00',
                }}>
                  Базовые поля <strong>Название</strong>, <strong>Описание</strong>, блоки советов и шаги приготовления
                  являются единственным источником исходного текста. В переводах храните только
                  отличающиеся версии для других языков.
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: 'var(--spacing-md)',
                }}>
                  {translationLanguages.map(lang => (
                    <button
                      key={lang.code}
                      type="button"
                      className={activeTranslationLang === lang.code ? "btn btn-primary" : "btn btn-secondary"}
                      onClick={() => setActiveTranslationLang(lang.code)}
                      style={{ padding: '6px 10px' }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 'var(--spacing-md)',
                }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Заголовок перевода
                    </label>
                    <input
                      className="input"
                      value={activeTranslation.title}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { title: e.target.value })}
                      placeholder="Borscht"
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Описание
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.description}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Нюансы и советы
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.tips}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { tips: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Подача
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.serving_tips}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { serving_tips: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Хранение
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.storage_tips}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { storage_tips: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Заметка
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.recipe_note}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { recipe_note: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      Инструкции (каждый шаг с новой строки)
                    </label>
                    <textarea
                      className="input"
                      value={activeTranslation.instructions}
                      onChange={(e) => updateTranslationDraft(activeTranslationLang, { instructions: e.target.value })}
                      rows={4}
                    />
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: 'var(--spacing-md)',
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => applyBaseInstructions(activeTranslationLang)}
                  >
                    Подставить инструкции из базовых
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => updateTranslationDraft(activeTranslationLang, { ...emptyTranslationDraft })}
                  >
                    Очистить перевод
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowTranslationsJson(prev => !prev)}
                  >
                    {showTranslationsJson ? "Скрыть JSON" : "Показать JSON"}
                  </button>
                </div>

                {showTranslationsJson && (
                  <div style={{ marginTop: 'var(--spacing-md)' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: 'var(--spacing-xs)',
                      color: 'var(--text-primary)',
                    }}>
                      translations (JSON)
                    </label>
                    <textarea
                      className="input"
                      placeholder='{"ru":{"title":"..."}}'
                      value={translationsJsonPreview}
                      onChange={(e) => handleTranslationsJsonChange(e.target.value)}
                      rows={4}
                      style={{ fontFamily: 'monospace', fontSize: '13px' }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Комментарии */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-2xl)',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setShowCommentsSection(prev => !prev)}
            style={sectionHeaderStyle}
          >
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Комментарии
            </h3>
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              {showCommentsSection ? "▾" : "▸"}
            </span>
          </button>

          {showCommentsSection && (
            <>
              <div style={{ marginBottom: 'var(--spacing-lg)' }} />
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--spacing-lg)',
                marginBottom: 'var(--spacing-lg)',
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: 'var(--spacing-xs)',
                    color: 'var(--text-primary)',
                  }}>
                    comments_enabled
                  </label>
                  <select
                    className="input"
                    value={form.comments_enabled}
                    onChange={(e) => setForm({ ...form, comments_enabled: e.target.value })}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: 'var(--spacing-xs)',
                    color: 'var(--text-primary)',
                  }}>
                    comments_count
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={form.comments_count}
                    onChange={(e) => setForm({ ...form, comments_count: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showImportModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowImportModal(false);
            }
          }}
        >
          <div className="modal animate-slide-up" style={{ maxWidth: '760px' }}>
            <h2 className="modal-header">Импорт рецепта</h2>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                Промпт для AI
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '8px',
              }}>
                Скопируйте и используйте в чате. Ответ — JSON объект рецепта.
              </div>
              <div style={{
                background: 'var(--bg-page)',
                border: '1px dashed var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-sm)',
                fontSize: '12px',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
              }}>
                {importPrompt}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard.writeText(importPrompt)}
                >
                  Скопировать промпт
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label className="form-label">JSON рецепта</label>
              <textarea
                className="input"
                rows={10}
                placeholder="Вставьте JSON объекта рецепта"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label className="form-label">Или загрузите файл (.json)</label>
              <input
                type="file"
                accept=".json"
                className="input"
                onChange={handleImportFile}
              />
              {importFileName && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Загружен файл: {importFileName}
                </div>
              )}
            </div>

            {importStatus && (
              <div style={{ marginBottom: 'var(--spacing-md)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {importStatus}
              </div>
            )}

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => applyImportRecipe(importText)}
              >
                Применить
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowImportModal(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showInstagramModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInstagramModal(false);
            }
          }}
        >
          <div className="modal animate-slide-up" style={{ maxWidth: '600px' }}>
            <h2 className="modal-header">Импорт из Instagram</h2>

            <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label className="form-label">Ссылка на Reels/пост</label>
              <input
                className="input"
                placeholder="https://www.instagram.com/reel/..."
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
              />
            </div>

            {instagramStatus && (
              <div style={{ marginBottom: 'var(--spacing-md)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {instagramStatus}
              </div>
            )}

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={handleInstagramImport}
                disabled={instagramLoading}
              >
                {instagramLoading ? "Импорт..." : "Импортировать"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowInstagramModal(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
