export const CATALOG_LEVEL_OPTIONS = [
  { value: "beginner", label: "Новичок" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
] as const;

export const CATALOG_TIME_OPTIONS = [
  { value: "under20", label: "До 20 минут" },
  { value: "from20to40", label: "20-40 минут" },
  { value: "over60", label: "Час и больше" },
] as const;

export const CATALOG_DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Вегетарианское" },
  { value: "gluten_free", label: "Без глютена" },
  { value: "dairy_free", label: "Без молочки" },
  { value: "low_carb", label: "Низкоуглеводное" },
] as const;

export const CATALOG_GENERAL_TAG_OPTIONS = [
  { value: "quick", label: "Быстро" },
  { value: "simple", label: "Просто" },
  { value: "meal_prep", label: "Заготовки" },
  { value: "high_protein", label: "Много белка" },
  { value: "comfort_food", label: "Комфортная еда" },
  { value: "asian", label: "Азия" },
  { value: "wok", label: "Вок/лапша" },
  { value: "street_food", label: "Стрит-фуд" },
  { value: "world", label: "Кухни мира" },
  { value: "variety", label: "Разнообразие" },
  { value: "spicy", label: "Острое" },
] as const;

const values = <T extends readonly { value: string }[]>(items: T) => items.map((item) => item.value);

export const CATALOG_LEVEL_VALUES = values(CATALOG_LEVEL_OPTIONS);
export const CATALOG_TIME_VALUES = values(CATALOG_TIME_OPTIONS);
export const CATALOG_DIETARY_VALUES = values(CATALOG_DIETARY_OPTIONS);
export const CATALOG_GENERAL_TAG_VALUES = values(CATALOG_GENERAL_TAG_OPTIONS);

export const CATALOG_RECOMMENDATION_PROMPT = `
Recommendation fields for onboarding gift matching:
- recommendation_levels: choose one or more from ${CATALOG_LEVEL_VALUES.join(", ")}
- recommendation_times: choose one or more from ${CATALOG_TIME_VALUES.join(", ")}
- recommendation_dietary: choose zero or more from ${CATALOG_DIETARY_VALUES.join(", ")}; empty means suitable for everyone
- recommendation_tags: choose one or more from ${CATALOG_GENERAL_TAG_VALUES.join(", ")}
Use only these exact machine values.
`.trim();
