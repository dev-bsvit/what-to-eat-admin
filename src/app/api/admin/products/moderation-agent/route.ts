import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APP_LANGUAGES } from "@/lib/translate";
import { normalize, similarity } from "@/lib/stringUtils";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const CATEGORIES = [
  "grains",
  "meat",
  "dairy",
  "vegetables",
  "fruits",
  "bakery",
  "fish",
  "frozen",
  "drinks",
  "spices",
  "canned",
  "snacks",
  "other",
] as const;

type ProductTranslation = {
  name?: string | null;
  synonyms?: string[] | null;
  description?: string | null;
  storage_tips?: string | null;
};

type ProductRow = {
  id: string;
  canonical_name: string;
  synonyms?: string[] | null;
  category?: string | null;
  icon?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbohydrates?: number | null;
  fiber?: number | null;
  preferred_unit?: string | null;
  typical_serving?: number | null;
  requires_expiry?: boolean | null;
  default_shelf_life_days?: number | null;
  seasonal_months?: number[] | null;
  description?: string | null;
  storage_tips?: string | null;
  image_url?: string | null;
  moderation_status?: string | null;
  needs_moderation?: boolean | null;
  auto_created?: boolean | null;
  usage_count?: number | null;
  translations?: Record<string, ProductTranslation> | ProductTranslation[] | null;
};

type ProductTranslationRow = ProductTranslation & {
  product_id: string;
  language_code: string;
};

type Candidate = {
  id: string;
  canonical_name: string;
  category?: string | null;
  icon?: string | null;
  score: number;
  matchedName: string;
  matchedInputName: string;
  matchType: "exact" | "same_family" | "contains" | "token_overlap" | "fuzzy";
  matchReason: string;
  translations?: Record<string, ProductTranslation> | ProductTranslation[] | null;
};

type NameEntry = {
  text: string;
  source: "canonical" | "synonym";
};

type AgentDecision = {
  productId: string;
  action: "approve_new" | "merge" | "needs_review" | "reject";
  confidence: number;
  mergeIntoProductId: string | null;
  reason: string;
  cleanProduct: {
    canonical_name: string;
    category: string;
    icon: string;
    preferred_unit: string | null;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrates: number | null;
    fiber: number | null;
    typical_serving: number | null;
    requires_expiry: boolean;
    default_shelf_life_days: number | null;
    seasonal_months: number[];
    description: string | null;
    storage_tips: string | null;
    synonyms: string[];
    translations: Record<string, ProductTranslation>;
  };
};

type ManualDecision = {
  productId: string;
  action: AgentDecision["action"];
  mergeIntoProductId?: string | null;
};

type RunRequest = {
  productIds?: string[];
  limit?: number;
  apply?: boolean;
  minAutoApplyConfidence?: number;
  applyDecision?: ManualDecision;
};

// ── String helpers ────────────────────────────────────────────────────────────

function stripMarkdownCodeBlocks(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueText(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = asText(value);
    if (!text) return;
    const key = normalize(text);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

function translationsAsRecord(
  translations: ProductRow["translations"]
): Record<string, ProductTranslation> {
  if (!translations) return {};
  if (Array.isArray(translations)) {
    const record: Record<string, ProductTranslation> = {};
    translations.forEach((item) => {
      const languageCode = (item as ProductTranslation & { language_code?: string }).language_code;
      if (languageCode) record[languageCode] = item;
    });
    return record;
  }
  return translations;
}

// ── Concept extraction ────────────────────────────────────────────────────────

/**
 * Maps any surface form → canonical product root.
 * Key insight: only tokens that identify the PRODUCT ENTITY go here.
 * Variants (green, pickled, red) are tracked separately.
 */
const PRODUCT_ROOTS: Record<string, string> = {
  // Onion family
  лук: "лук", луковица: "лук", луковиц: "лук",
  onion: "лук", onions: "лук", bulb: "лук",
  // Cucumber
  огурец: "огурец", огурцы: "огурец", огурц: "огурец",
  cucumber: "огурец", cucumbers: "огурец",
  pickle: "огурец", pickles: "огурец",
  // Honey
  мед: "мед", мёд: "мед", honey: "мед", honning: "мед",
  honig: "мед", miel: "мед",
  // Tomato
  томат: "томат", томаты: "томат", помидор: "томат",
  помидоры: "томат", tomato: "томат", tomatoes: "томат",
  // Potato
  картофель: "картофель", картошка: "картофель", potato: "картофель",
  potatoes: "картофель",
  // Carrot
  морковь: "морковь", морков: "морковь", carrot: "морковь",
  carrots: "морковь",
  // Garlic
  чеснок: "чеснок", чесн: "чеснок", garlic: "чеснок",
  // Pepper
  перец: "перец", pepper: "перец", peppers: "перец",
  // Cabbage
  капуста: "капуста", cabbage: "капуста",
  // Milk
  молоко: "молоко", milk: "молоко",
  // Flour
  мука: "мука", flour: "мука",
  // Sugar
  сахар: "сахар", sugar: "сахар",
  // Salt
  соль: "соль", salt: "соль",
  // Oil
  масло: "масло", oil: "масло",
  // Egg
  яйцо: "яйцо", яйца: "яйцо", яйц: "яйцо", egg: "яйцо", eggs: "яйцо",
  // Chicken
  курица: "курица", куриц: "курица", chicken: "курица",
  // Beef
  говядина: "говядина", beef: "говядина",
  // Pork
  свинина: "свинина", pork: "свинина",
  // Rice
  рис: "рис", rice: "рис",
  // Pasta
  макарон: "макароны", паст: "паста", pasta: "паста",
  spaghetti: "паста", noodles: "лапша", лапш: "лапша",
  // Cheese
  сыр: "сыр", cheese: "сыр",
  // Bread
  хлеб: "хлеб", bread: "хлеб",
  // Butter
  // (масло is shared with oil — use context/category to disambiguate)
  // Apple
  яблок: "яблоко", яблоко: "яблоко", apple: "яблоко", apples: "яблоко",
  // Lemon
  лимон: "лимон", lemon: "лимон", lemons: "лимон",
  // Basil
  базилик: "базилик", basil: "базилик",
  // Parsley
  петрушк: "петрушка", parsley: "петрушка",
  // Dill
  укроп: "укроп", dill: "укроп",
};

/**
 * Variant markers: these DIFFERENTIATE products within the same root group.
 * If product A has variant "green" and product B has no variant, they are DIFFERENT products.
 */
const VARIANT_MARKERS: Record<string, string> = {
  зеленый: "green", зеленая: "green", зеленое: "green", зеленые: "green",
  зелен: "green", green: "green", scallion: "green", scallions: "green",
  spring: "green",
  красный: "red", красная: "red", красн: "red", red: "red",
  маринованный: "pickled", маринованная: "pickled", маринованные: "pickled",
  маринован: "pickled", соленый: "pickled", соленая: "pickled",
  соленые: "pickled", солен: "pickled", pickled: "pickled", salted: "pickled",
  морской: "sea", морская: "sea", sea: "sea",
  коричневый: "brown", brown: "brown",
  белый: "white", белая: "white", white: "white",
  черный: "black", черная: "black", черн: "black", black: "black",
  молотый: "ground", молотая: "ground", ground: "ground", powdered: "ground",
  сухой: "dried", сухая: "dried", dried: "dried",
  копченый: "smoked", копченая: "smoked", смок: "smoked", smoked: "smoked",
};

/**
 * These tokens do NOT identify the product and should be stripped before comparison.
 * Sizes, quantities, packaging, texture, flavor, and generic state words.
 */
const DESCRIPTOR_TOKENS = new Set([
  // Size / portion
  "средний", "средняя", "среднее", "средние", "средн",
  "крупный", "крупная", "мелкий", "мелкая", "крупн", "мелк",
  "небольшой", "небольшая", "небольш",
  "большой", "большая", "больш",
  // Prep state (generic — not differentiating variants)
  "свежий", "свежая", "свежее", "свежие", "свеж",
  "очищенный", "очищенная", "нарезанный", "нарезанная", "очищ",
  "вареный", "вареная", "вареные", "варен",
  "жареный", "жареная", "жарен",
  "замороженный", "замороженная", "заморожен",
  "консервированный", "консервированная", "консервир",
  "натуральный", "натурал",
  "спелый", "спелая", "спелые",
  "молодой", "молодая", "молод",
  // Texture / taste (these are descriptors, not product identity)
  "хрустящий", "хрустящая", "хрустящее", "хрустящие", "хрустящ",
  "острый", "острая", "острое", "острые", "остр",
  "сладкий", "сладкая", "сладкое", "сладкие", "сладк",
  "нежный", "нежная", "нежн",
  "ароматный", "ароматная", "аромат",
  "закусочный", "закусочная", "закусочные", "закусочн",
  "столовый", "столовая", "столов",
  "домашний", "домашняя", "домашн",
  // Quantity / packaging
  "грамм", "граммов", "гр", "кг", "мл", "литр", "литра", "шт", "штука",
  "упаковка", "пачка", "банка", "бутылка", "пакет",
  // English equivalents
  "fresh", "dry", "sweet", "crispy", "crunchy", "spicy", "tender",
  "medium", "large", "small", "big",
  "gram", "grams", "kg", "ml", "liter", "litre", "pcs", "pack", "package",
  "organic", "natural", "homemade",
]);

function rawTokens(value: string): string[] {
  return normalize(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+([.,]\d+)?\b/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function lightStem(token: string): string {
  const n = normalize(token);
  const suffixes = [
    "ями", "ами", "ого", "его", "ому", "ему", "ыми", "ими",
    "ах", "ях", "ой", "ей", "ую", "юю", "ый", "ий", "ая", "яя", "ое", "ее",
    "ов", "ев", "ом", "ем", "ым", "им", "а", "я", "о", "е", "у", "ю", "ы", "и", "й",
  ];
  for (const suffix of suffixes) {
    if (n.endsWith(suffix) && n.length > suffix.length + 3) {
      return n.slice(0, -suffix.length);
    }
  }
  return n;
}

function extractConcept(name: string): { roots: Set<string>; variants: Set<string> } {
  const roots = new Set<string>();
  const variants = new Set<string>();

  for (const token of rawTokens(name)) {
    const norm = normalize(token);
    const stemmed = lightStem(norm);

    // Check variant markers first (маринованный, зеленый, …)
    const variant = VARIANT_MARKERS[norm] ?? VARIANT_MARKERS[stemmed];
    if (variant) {
      variants.add(variant);
      continue;
    }

    // Check descriptors (medium, large, package, …)
    if (DESCRIPTOR_TOKENS.has(norm) || DESCRIPTOR_TOKENS.has(stemmed)) continue;

    // Check product roots dictionary
    const root = PRODUCT_ROOTS[norm] ?? PRODUCT_ROOTS[stemmed];
    if (root) {
      roots.add(root);
      continue;
    }

    // No alias → use stemmed form as-is if long enough
    if (stemmed.length >= 3) roots.add(stemmed);
  }

  return { roots, variants };
}

function hasVariantConflict(a: Set<string>, b: Set<string>): boolean {
  const meaningful = new Set(["green", "red", "pickled", "smoked", "black", "brown", "sea", "ground", "dried", "white"]);
  for (const variant of meaningful) {
    if (a.has(variant) !== b.has(variant)) return true;
  }
  return false;
}

/**
 * Compute the union of variants across ALL names of a product (canonical + synonyms).
 * This ensures a product with "соленые огурцы" as canonical and "огурцы закусочные" as
 * synonym is always treated as "pickled" — even when scoring against a specific synonym.
 */
function productVariantUnion(product: ProductRow): Set<string> {
  const all = new Set<string>();
  const names = [product.canonical_name, ...(product.synonyms ?? [])];
  for (const name of names) {
    const { variants } = extractConcept(name);
    variants.forEach((v) => all.add(v));
  }
  return all;
}

function tokenOverlap(a: string, b: string): number {
  const aRoots = extractConcept(a).roots;
  const bRoots = extractConcept(b).roots;
  if (aRoots.size === 0 || bRoots.size === 0) return 0;
  let shared = 0;
  aRoots.forEach((r) => { if (bRoots.has(r)) shared++; });
  return shared / Math.min(aRoots.size, bRoots.size);
}

// ── Candidate matching ────────────────────────────────────────────────────────

function nameEntries(product: ProductRow): NameEntry[] {
  const names: NameEntry[] = [
    { text: product.canonical_name, source: "canonical" },
    ...(product.synonyms ?? []).map((text) => ({ text, source: "synonym" as const })),
  ];
  const seen = new Set<string>();
  return names.filter((entry) => {
    const key = normalize(entry.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMatchReason(
  matchType: Candidate["matchType"],
  commonRoots: string[],
  matchedProductName: string,
  matchedCandidateName: string,
): string {
  switch (matchType) {
    case "exact":
      return `Точное совпадение: «${matchedProductName}»`;
    case "same_family":
      return commonRoots.length > 0
        ? `Одна продуктовая группа: ${commonRoots.slice(0, 3).join(", ")}`
        : "Одна продуктовая группа";
    case "contains":
      return `Одно название включает другое: «${matchedProductName}» / «${matchedCandidateName}»`;
    case "token_overlap":
      return `Общие продуктовые слова: ${commonRoots.slice(0, 3).join(", ")}`;
    case "fuzzy":
      return `Похожее написание: «${matchedProductName}» → «${matchedCandidateName}»`;
  }
}

function candidateScore(product: ProductRow, candidate: ProductRow): Candidate | null {
  // Product-level variant union: checked once at product level, not per name pair.
  // Prevents "огурцы закусочные" (synonym without "соленые") from bypassing pickled↔fresh conflict.
  const productVariants = productVariantUnion(product);
  const candidateVariants = productVariantUnion(candidate);
  if (hasVariantConflict(productVariants, candidateVariants)) return null;

  const productNames = nameEntries(product);
  const candidateNames = nameEntries(candidate);
  let bestScore = 0;
  let matchedName = candidate.canonical_name;
  let matchedInputName = product.canonical_name;
  let matchType: Candidate["matchType"] = "fuzzy";
  let bestCommonRoots: string[] = [];

  for (const pn of productNames) {
    const pNorm = normalize(pn.text);
    const pConcept = extractConcept(pn.text);

    for (const cn of candidateNames) {
      const cNorm = normalize(cn.text);
      const cConcept = extractConcept(cn.text);
      const commonRoots = Array.from(pConcept.roots).filter((r) => cConcept.roots.has(r));
      const overlap = tokenOverlap(pn.text, cn.text);
      let score = 0;
      let curType: Candidate["matchType"] = "fuzzy";

      // Must share at least one root OR be an exact string match
      if (commonRoots.length === 0 && pNorm !== cNorm) continue;

      if (pNorm === cNorm) {
        score = 1;
        curType = "exact";
      } else if (commonRoots.length > 0) {
        const sameRootSet =
          pConcept.roots.size === cConcept.roots.size &&
          commonRoots.length === pConcept.roots.size;
        score = sameRootSet ? 0.94 : 0.84 + 0.08 * overlap;
        curType = "same_family";
      } else if (pNorm.includes(cNorm) || cNorm.includes(pNorm)) {
        const shorter = Math.min(pNorm.length, cNorm.length);
        const longer = Math.max(pNorm.length, cNorm.length);
        score = 0.70 + 0.20 * (shorter / Math.max(longer, 1));
        curType = "contains";
      } else if (overlap >= 0.5) {
        score = 0.72 + 0.14 * overlap;
        curType = "token_overlap";
      } else {
        const fuzzy = similarity(pNorm, cNorm);
        if (fuzzy >= 0.84 && overlap > 0) {
          score = fuzzy;
          curType = "fuzzy";
        }
      }

      // Small bonus for matching category
      if (product.category && candidate.category &&
          product.category === candidate.category &&
          product.category !== "other") {
        score = Math.min(1, score + 0.02);
      }

      if (score > bestScore) {
        bestScore = score;
        matchedName = cn.text;
        matchedInputName = pn.text;
        matchType = curType;
        bestCommonRoots = commonRoots;
      }
    }
  }

  if (bestScore < 0.80) return null;

  return {
    id: candidate.id,
    canonical_name: candidate.canonical_name,
    category: candidate.category,
    icon: candidate.icon,
    score: Number(bestScore.toFixed(3)),
    matchedName,
    matchedInputName,
    matchType,
    matchReason: buildMatchReason(matchType, bestCommonRoots, matchedInputName, matchedName),
    translations: candidate.translations,
  };
}

function findCandidates(product: ProductRow, pool: ProductRow[]): Candidate[] {
  return pool
    .filter((c) => c.id !== product.id)
    .map((c) => candidateScore(product, c))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function withTranslations(products: ProductRow[]): Promise<ProductRow[]> {
  const ids = products.map((p) => p.id).filter(Boolean);
  if (ids.length === 0) return products;

  const { data, error } = await supabaseAdmin
    .from("product_translations")
    .select("product_id, language_code, name, synonyms, description, storage_tips")
    .in("product_id", ids);

  if (error) throw new Error(error.message);

  const byProduct = new Map<string, Record<string, ProductTranslation>>();
  ((data ?? []) as ProductTranslationRow[]).forEach((row) => {
    const existing = byProduct.get(row.product_id) ?? {};
    existing[row.language_code] = {
      name: row.name,
      synonyms: row.synonyms,
      description: row.description,
      storage_tips: row.storage_tips,
    };
    byProduct.set(row.product_id, existing);
  });

  return products.map((p) => ({ ...p, translations: byProduct.get(p.id) ?? {} }));
}

async function fetchProductsByIds(ids: string[]): Promise<ProductRow[]> {
  const { data, error } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return withTranslations((data ?? []) as ProductRow[]);
}

async function fetchPendingProducts(limit: number): Promise<ProductRow[]> {
  const { data, error } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .or("needs_moderation.eq.true,moderation_status.eq.pending")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return withTranslations((data ?? []) as ProductRow[]);
}

async function fetchCandidatePool(): Promise<ProductRow[]> {
  const { data, error } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .order("usage_count", { ascending: false, nullsFirst: false })
    .limit(2500);
  if (error) throw new Error(error.message);
  return withTranslations((data ?? []) as ProductRow[]);
}

// ── Compact serializers (for AI prompt) ──────────────────────────────────────

function compactProduct(p: ProductRow) {
  return {
    id: p.id,
    canonical_name: p.canonical_name,
    synonyms: p.synonyms ?? [],
    category: p.category ?? "other",
    icon: p.icon ?? "📦",
    calories: p.calories ?? null,
    protein: p.protein ?? null,
    fat: p.fat ?? null,
    carbohydrates: p.carbohydrates ?? null,
    fiber: p.fiber ?? null,
    preferred_unit: p.preferred_unit ?? null,
    typical_serving: p.typical_serving ?? null,
    requires_expiry: p.requires_expiry ?? false,
    default_shelf_life_days: p.default_shelf_life_days ?? null,
    seasonal_months: p.seasonal_months ?? [],
    description: p.description ?? null,
    storage_tips: p.storage_tips ?? null,
    translations: translationsAsRecord(p.translations),
  };
}

function compactCandidate(c: Candidate) {
  return {
    id: c.id,
    canonical_name: c.canonical_name,
    category: c.category ?? "other",
    icon: c.icon ?? "📦",
    score: c.score,
    matchedName: c.matchedName,
    matchedInputName: c.matchedInputName,
    matchType: c.matchType,
    matchReason: c.matchReason,
    translations: translationsAsRecord(c.translations),
  };
}

// ── AI call ───────────────────────────────────────────────────────────────────

async function askAgent(product: ProductRow, candidates: Candidate[]): Promise<AgentDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const candidateNote = candidates.length === 0
    ? "Похожих продуктов не найдено."
    : `Похожие кандидаты (уже отфильтрованы — случайных продуктов здесь нет):\n${JSON.stringify(candidates.map(compactCandidate), null, 2)}`;

  const prompt = `Ты AI-агент модерации справочника продуктов кулинарного приложения.

ЗАДАЧА: принять решение по одному продукту и вернуть чистый JSON.

ВАЖНЫЕ ПРАВИЛА ОБЪЕДИНЕНИЯ:
- Объединяй ТОЛЬКО если это буквально тот же продукт (лук = лук репчатый = луковица = onion).
- НЕ объединяй: "рис" и "рисовый уксус", "молоко" и "кокосовое молоко", "огурец" и "солёный огурец" (если они должны быть разными продуктами в базе).
- Если есть сомнения — выбирай needs_review, не merge.

ДЕЙСТВИЯ:
- "approve_new" — нормальный самостоятельный продукт, добавить в базу.
- "merge" — точный дубль кандидата. Обязательно укажи mergeIntoProductId.
- "needs_review" — неоднозначно, нужен человек.
- "reject" — мусорное название, не продукт.

КАТЕГОРИИ (только эти): ${CATEGORIES.join(", ")}
ЯЗЫКИ (все обязательны): ${APP_LANGUAGES.join(", ")}

Продукт на модерации:
${JSON.stringify(compactProduct(product), null, 2)}

${candidateNote}

Верни ТОЛЬКО валидный JSON (без markdown):
{
  "productId": "${product.id}",
  "action": "approve_new|merge|needs_review|reject",
  "confidence": 0.95,
  "mergeIntoProductId": null,
  "reason": "коротко и конкретно почему",
  "cleanProduct": {
    "canonical_name": "Лучшее каноническое имя",
    "category": "vegetables",
    "icon": "🥕",
    "preferred_unit": "g",
    "calories": 41,
    "protein": 0.9,
    "fat": 0.2,
    "carbohydrates": 9.6,
    "fiber": 2.8,
    "typical_serving": 80,
    "requires_expiry": true,
    "default_shelf_life_days": 14,
    "seasonal_months": [],
    "description": "Одно предложение.",
    "storage_tips": "Одно предложение.",
    "synonyms": ["альтернативные имена для поиска"],
    "translations": {
      "en": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "ru": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "de": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "it": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "fr": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "es": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "pt-BR": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."},
      "uk": {"name": "...", "synonyms": ["..."], "description": "...", "storage_tips": "..."}
    }
  }
}`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4o-mini", input: prompt, temperature: 0.1 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.output?.[0]?.content?.[0]?.text;
  if (!content) throw new Error("Empty response from AI");

  const cleaned = stripMarkdownCodeBlocks(content);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return sanitizeDecision(JSON.parse(jsonMatch ? jsonMatch[0] : cleaned), product, candidates);
}

function sanitizeDecision(raw: unknown, product: ProductRow, candidates: Candidate[]): AgentDecision {
  const value = (raw ?? {}) as Record<string, unknown>;
  const clean = ((value.cleanProduct ?? {}) as Record<string, unknown>);
  const rawAction = asText(value.action) ?? "needs_review";
  const action = (["approve_new", "merge", "needs_review", "reject"] as const).includes(
    rawAction as AgentDecision["action"]
  )
    ? (rawAction as AgentDecision["action"])
    : "needs_review";

  const category = asText(clean.category);
  const allowedCategory =
    category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])
      ? category
      : (product.category ?? "other");

  const mergeIntoProductId = asText(value.mergeIntoProductId);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const safeMergeId =
    mergeIntoProductId && candidateIds.has(mergeIntoProductId) ? mergeIntoProductId : null;

  const rawTranslations = (clean.translations ?? {}) as Record<string, ProductTranslation>;
  const translations: Record<string, ProductTranslation> = {};

  APP_LANGUAGES.forEach((lang) => {
    const t = rawTranslations[lang] ?? {};
    const fallbackName =
      lang === "en"
        ? asText(clean.canonical_name) ?? product.canonical_name
        : asText(t.name) ?? asText(clean.canonical_name) ?? product.canonical_name;
    translations[lang] = {
      name: fallbackName,
      synonyms: uniqueText(Array.isArray(t.synonyms) ? t.synonyms : []),
      description: asText(t.description),
      storage_tips: asText(t.storage_tips),
    };
  });

  return {
    productId: product.id,
    action: action === "merge" && !safeMergeId ? "needs_review" : action,
    confidence: Math.max(0, Math.min(1, asNumber(value.confidence) ?? 0)),
    mergeIntoProductId: safeMergeId,
    reason: asText(value.reason) ?? "AI moderation result",
    cleanProduct: {
      canonical_name: asText(clean.canonical_name) ?? product.canonical_name,
      category: allowedCategory,
      icon: asText(clean.icon) ?? product.icon ?? "📦",
      preferred_unit: asText(clean.preferred_unit),
      calories: asNumber(clean.calories),
      protein: asNumber(clean.protein),
      fat: asNumber(clean.fat),
      carbohydrates: asNumber(clean.carbohydrates),
      fiber: asNumber(clean.fiber),
      typical_serving: asNumber(clean.typical_serving),
      requires_expiry:
        typeof clean.requires_expiry === "boolean" ? clean.requires_expiry : (product.requires_expiry ?? false),
      default_shelf_life_days: asNumber(clean.default_shelf_life_days),
      seasonal_months: Array.isArray(clean.seasonal_months)
        ? clean.seasonal_months
            .map(asNumber)
            .filter((m): m is number => m !== null && m >= 1 && m <= 12)
        : [],
      description: asText(clean.description),
      storage_tips: asText(clean.storage_tips),
      synonyms: uniqueText(Array.isArray(clean.synonyms) ? clean.synonyms : (product.synonyms ?? [])),
      translations,
    },
  };
}

// ── Apply decisions ───────────────────────────────────────────────────────────

async function applyApproveNew(
  decision: AgentDecision,
  minConfidence: number
): Promise<{ applied: boolean; reason: string }> {
  if (decision.confidence < minConfidence) {
    return { applied: false, reason: "confidence_below_threshold" };
  }

  const cp = decision.cleanProduct;
  const { error: prodError } = await supabaseAdmin
    .from("product_dictionary")
    .update({
      canonical_name: cp.canonical_name,
      category: cp.category,
      icon: cp.icon,
      preferred_unit: cp.preferred_unit,
      calories: cp.calories,
      protein: cp.protein,
      fat: cp.fat,
      carbohydrates: cp.carbohydrates,
      fiber: cp.fiber,
      typical_serving: cp.typical_serving,
      requires_expiry: cp.requires_expiry,
      default_shelf_life_days: cp.default_shelf_life_days,
      seasonal_months: cp.seasonal_months,
      description: cp.description,
      storage_tips: cp.storage_tips,
      synonyms: cp.synonyms,
      moderation_status: "approved",
      needs_moderation: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", decision.productId);

  if (prodError) throw new Error(prodError.message);

  const translationRows = Object.entries(cp.translations).map(([language_code, t]) => ({
    product_id: decision.productId,
    language_code,
    name: t.name,
    synonyms: t.synonyms ?? [],
    description: t.description ?? null,
    storage_tips: t.storage_tips ?? null,
  }));

  const { error: transError } = await supabaseAdmin
    .from("product_translations")
    .upsert(translationRows, { onConflict: "product_id,language_code" });

  if (transError) throw new Error(transError.message);

  return { applied: true, reason: "approved_new_product" };
}

async function applyMerge(
  mergedId: string,
  targetId: string,
  mergedProduct: ProductRow
): Promise<{ applied: boolean; reason: string }> {
  const { data: target, error: fetchError } = await supabaseAdmin
    .from("product_dictionary")
    .select("id, canonical_name, synonyms")
    .eq("id", targetId)
    .single();

  if (fetchError || !target) {
    return { applied: false, reason: "merge_target_not_found" };
  }

  // Collect all names from the duplicate to add to target's synonyms
  const namesToAdd = [
    mergedProduct.canonical_name,
    ...(mergedProduct.synonyms ?? []),
  ].filter((name) => normalize(name) !== normalize(target.canonical_name as string));

  const existingSynonyms = (target.synonyms as string[]) ?? [];
  const existingNorms = new Set(existingSynonyms.map((s) => normalize(s)));
  const mergedSynonyms = [...existingSynonyms];

  for (const name of namesToAdd) {
    if (!existingNorms.has(normalize(name))) {
      mergedSynonyms.push(name);
      existingNorms.add(normalize(name));
    }
  }

  const { error: updateTargetError } = await supabaseAdmin
    .from("product_dictionary")
    .update({ synonyms: mergedSynonyms, updated_at: new Date().toISOString() })
    .eq("id", targetId);

  if (updateTargetError) throw new Error(updateTargetError.message);

  const { error: markMergedError } = await supabaseAdmin
    .from("product_dictionary")
    .update({
      moderation_status: "merged",
      needs_moderation: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mergedId);

  if (markMergedError) throw new Error(markMergedError.message);

  return { applied: true, reason: `merged_into_${targetId}` };
}

async function applyDecision(
  decision: AgentDecision,
  minConfidence: number,
  products: ProductRow[]
): Promise<{ applied: boolean; reason: string }> {
  const { action } = decision;

  if (action === "approve_new") {
    return applyApproveNew(decision, minConfidence);
  }

  if (action === "merge") {
    if (!decision.mergeIntoProductId) {
      return { applied: false, reason: "merge_target_not_specified" };
    }
    const product = products.find((p) => p.id === decision.productId);
    if (!product) return { applied: false, reason: "product_not_found" };
    return applyMerge(decision.productId, decision.mergeIntoProductId, product);
  }

  if (action === "needs_review") {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        moderation_status: "needs_review",
        needs_moderation: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", decision.productId);
    if (error) throw new Error(error.message);
    return { applied: true, reason: "marked_needs_review" };
  }

  if (action === "reject") {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        moderation_status: "rejected",
        needs_moderation: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", decision.productId);
    if (error) throw new Error(error.message);
    return { applied: true, reason: "marked_rejected" };
  }

  return { applied: false, reason: "unknown_action" };
}

/** Apply a manual decision (from UI override, no AI cleanProduct available). */
async function applyManualDecision(
  manual: ManualDecision,
  product: ProductRow | undefined
): Promise<{ applied: boolean; reason: string }> {
  if (!product) return { applied: false, reason: "product_not_found" };

  if (manual.action === "approve_new") {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        moderation_status: "approved",
        needs_moderation: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", manual.productId);
    if (error) throw new Error(error.message);
    return { applied: true, reason: "manually_approved" };
  }

  if (manual.action === "merge") {
    if (!manual.mergeIntoProductId) {
      return { applied: false, reason: "merge_target_not_specified" };
    }
    return applyMerge(manual.productId, manual.mergeIntoProductId, product);
  }

  if (manual.action === "needs_review") {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        moderation_status: "needs_review",
        needs_moderation: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", manual.productId);
    if (error) throw new Error(error.message);
    return { applied: true, reason: "marked_needs_review" };
  }

  if (manual.action === "reject") {
    const { error } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        moderation_status: "rejected",
        needs_moderation: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", manual.productId);
    if (error) throw new Error(error.message);
    return { applied: true, reason: "marked_rejected" };
  }

  return { applied: false, reason: "unknown_action" };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunRequest;

    // ── Manual single-decision apply ─────────────────────────────────────────
    if (body.applyDecision) {
      const manual = body.applyDecision;
      if (!manual.productId || !manual.action) {
        return NextResponse.json(
          { error: "applyDecision requires productId and action" },
          { status: 400 }
        );
      }
      const [product] = await fetchProductsByIds([manual.productId]);
      const result = await applyManualDecision(manual, product);
      return NextResponse.json({ success: true, result });
    }

    // ── Batch dry-run or auto-apply ──────────────────────────────────────────
    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);
    const apply = body.apply === true;
    const minAutoApplyConfidence = Math.max(0.9, Math.min(1, body.minAutoApplyConfidence ?? 0.98));
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 50)
      : [];

    const products =
      productIds.length > 0
        ? await fetchProductsByIds(productIds)
        : await fetchPendingProducts(limit);

    const candidatePool = await fetchCandidatePool();

    const results = [];
    for (const product of products) {
      const candidates = findCandidates(product, candidatePool);
      const decision = await askAgent(product, candidates);
      const applyResult = apply
        ? await applyDecision(decision, minAutoApplyConfidence, products)
        : { applied: false, reason: "dry_run" };

      results.push({
        productId: product.id,
        original: compactProduct(product),
        candidates: candidates.map(compactCandidate),
        decision,
        applyResult,
      });
    }

    return NextResponse.json({
      success: true,
      dryRun: !apply,
      processed: results.length,
      minAutoApplyConfidence,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "Product moderation agent v2",
    status: "ready",
    endpoints: {
      dryRun: { method: "POST", body: { limit: 5, apply: false } },
      autoApply: { method: "POST", body: { limit: 5, apply: true, minAutoApplyConfidence: 0.98 } },
      manualApply: {
        method: "POST",
        body: {
          applyDecision: {
            productId: "<uuid>",
            action: "approve_new | merge | needs_review | reject",
            mergeIntoProductId: "<uuid or null>",
          },
        },
      },
    },
  });
}
