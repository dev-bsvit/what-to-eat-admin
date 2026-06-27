export const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export type RecipeDifficulty = "easy" | "medium" | "hard";

export const normalizeDifficulty = (value: unknown): RecipeDifficulty => {
  const text = normalizeText(value)?.toLowerCase().replace(/ё/g, "е");
  if (!text) return "medium";

  if (["easy", "легко", "легкий", "легкая", "легке", "лёгкий", "лёгкая", "простий", "проста", "simple"].includes(text)) {
    return "easy";
  }
  if (["hard", "сложно", "сложный", "сложная", "важко", "складний", "складна", "difficult", "advanced"].includes(text)) {
    return "hard";
  }
  if (["medium", "средне", "средний", "средняя", "середній", "середня", "normal", "moderate"].includes(text)) {
    return "medium";
  }

  return "medium";
};

const normalizeEnumArray = (
  value: unknown,
  aliases: Record<string, string>,
  fallback: string[] = []
): string[] => {
  const values = parseTextArray(value) ?? [];
  const normalized = values
    .map((item) => item.toLowerCase().replace(/ё/g, "е").trim())
    .map((item) => aliases[item])
    .filter((item): item is string => Boolean(item));

  return normalized.length > 0 ? [...new Set(normalized)] : fallback;
};

export const normalizeMoodTags = (value: unknown): string[] =>
  normalizeEnumArray(
    value,
    {
      comfort: "comfort",
      comfortable: "comfort",
      комфорт: "comfort",
      комфортный: "comfort",
      комфортне: "comfort",
      light: "light",
      легкий: "light",
      легкая: "light",
      легке: "light",
      energizing: "energizing",
      energetic: "energizing",
      бодрящий: "energizing",
      енергійне: "energizing",
      festive: "festive",
      праздничный: "festive",
      праздничное: "festive",
      святкове: "festive",
      quick: "quick",
      быстрый: "quick",
      быстро: "quick",
      швидке: "quick",
      cozy: "cozy",
      уютный: "cozy",
      уютное: "cozy",
      затишне: "cozy",
    },
    ["comfort"]
  );

export const normalizeMealRoles = (value: unknown): string[] =>
  normalizeEnumArray(value, {
    breakfast: "breakfast",
    завтрак: "breakfast",
    сніданок: "breakfast",
    lunch_main: "lunch_main",
    lunch: "lunch_main",
    обед: "lunch_main",
    обід: "lunch_main",
    lunch_side: "lunch_side",
    side: "lunch_side",
    гарнир: "lunch_side",
    гарнір: "lunch_side",
    dinner: "dinner",
    ужин: "dinner",
    вечеря: "dinner",
    snack: "snack",
    перекус: "snack",
    dessert: "dessert",
    десерт: "dessert",
  });

export const normalizeSeasons = (value: unknown): string[] =>
  normalizeEnumArray(
    value,
    {
      spring: "spring",
      весна: "spring",
      summer: "summer",
      лето: "summer",
      літо: "summer",
      autumn: "autumn",
      fall: "autumn",
      осень: "autumn",
      осінь: "autumn",
      winter: "winter",
      зима: "winter",
      all: "all",
      any: "all",
      круглый_год: "all",
      "круглый год": "all",
      "цілий рік": "all",
    },
    ["all"]
  );

export const normalizeGoalTags = (value: unknown): string[] =>
  normalizeEnumArray(value, {
    weight_loss: "weight_loss",
    похудение: "weight_loss",
    схуднення: "weight_loss",
    muscle_gain: "muscle_gain",
    набор_массы: "muscle_gain",
    "набор массы": "muscle_gain",
    balanced: "balanced",
    баланс: "balanced",
    сбалансированное: "balanced",
    quick: "quick",
    быстро: "quick",
    budget: "budget",
    бюджет: "budget",
    variety: "variety",
    разнообразие: "variety",
    різноманіття: "variety",
    meal_prep: "meal_prep",
    заготовки: "meal_prep",
  });

export const normalizeMainIngredient = (value: unknown): string | null => {
  const text = normalizeText(value)?.toLowerCase().replace(/ё/g, "е");
  if (!text) return null;

  const aliases: Record<string, string> = {
    chicken: "chicken", курица: "chicken", курка: "chicken",
    beef: "beef", говядина: "beef", яловичина: "beef", телятина: "beef",
    fish: "fish", рыба: "fish", риба: "fish", морепродукты: "fish", seafood: "fish",
    pasta: "pasta", паста: "pasta", макароны: "pasta", макарони: "pasta", лапша: "pasta",
    rice: "rice", рис: "rice",
    vegetables: "vegetables", овощи: "vegetables", овочі: "vegetables", картофель: "vegetables",
    eggs: "eggs", egg: "eggs", яйца: "eggs", яйцо: "eggs", яйця: "eggs",
    legumes: "legumes", бобовые: "legumes", бобові: "legumes", фасоль: "legumes", квасоля: "legumes",
  };

  return aliases[text] ?? "vegetables";
};

export const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number => {
  const parsed = parseNumber(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const parseBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  return null;
};

const parseJsonIfNeeded = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
};

export const parseJson = (value: unknown): unknown | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return parseJsonIfNeeded(value);
  }
  return value;
};

export const parseTextArray = (value: unknown): string[] | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item)).filter((item) => item.length > 0)
        : null;
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return null;
};

export const parseIntArray = (value: unknown): number[] | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        : null;
    }
    return trimmed
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  return null;
};

export const parseUuidArray = (value: unknown): string[] | null => {
  return parseTextArray(value);
};
