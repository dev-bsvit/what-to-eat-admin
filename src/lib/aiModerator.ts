/**
 * AI Moderator - Smart automated product moderation
 *
 * Strategy for token economy:
 * 1. First try exact match (free)
 * 2. Then try fuzzy matching (free)
 * 3. Only use AI when fuzzy match confidence < 70%
 * 4. Cache AI decisions for 24 hours
 * 5. Batch similar requests
 */

import { supabaseAdmin } from "./supabaseAdmin";
import {
  refreshProductCache,
  findProductByExactName,
  getAllProducts,
  getCachedAIDecision,
  saveAIDecision,
  generateInputHash,
  normalizeForCache,
  type CachedProduct,
} from "./aiModeratorCache";
import {
  findBestMatch,
  normalize,
  type MatchResult,
} from "./stringUtils";

// Supported languages for translation
const SUPPORTED_LOCALES = ["ru", "uk", "en", "fr", "de", "it", "es", "pt"] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

// Queue for batch processing
interface QueueItem {
  id: string;
  type: "link" | "translate" | "fill" | "classify";
  input: string;
  productId?: string;
  resolve: (result: ModerationResult) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const processingQueue: QueueItem[] = [];
let isProcessing = false;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000; // Wait 2s to collect batch

export interface ModerationResult {
  success: boolean;
  action: "auto_linked" | "created" | "suggested" | "filled" | "skipped" | "error";
  productId?: string;
  productName?: string;
  confidence?: number;
  aiUsed: boolean;
  tokensUsed?: number;
  details?: unknown;
}

export interface ModeratorStats {
  totalProcessed: number;
  autoLinked: number;
  aiCalls: number;
  tokensUsed: number;
  cacheHits: number;
  errors: number;
}

// Session stats
const sessionStats: ModeratorStats = {
  totalProcessed: 0,
  autoLinked: 0,
  aiCalls: 0,
  tokensUsed: 0,
  cacheHits: 0,
  errors: 0,
};

/**
 * Strip markdown code blocks from AI response
 * Handles ```json ... ``` and ``` ... ``` formats
 */
function stripMarkdownCodeBlocks(content: string): string {
  let cleaned = content.trim();

  // Remove ```json or ``` at the start
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  // Remove ``` at the end
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

/**
 * Process a single ingredient name - main entry point
 */
export async function processIngredient(
  ingredientName: string,
  sourceLocale: Locale = "ru"
): Promise<ModerationResult> {
  await refreshProductCache();
  sessionStats.totalProcessed++;

  const normalized = normalizeForCache(ingredientName);
  if (!normalized || normalized.length < 2) {
    return { success: false, action: "skipped", aiUsed: false };
  }

  // Step 1: Exact match (free)
  const exactMatch = findProductByExactName(ingredientName);
  if (exactMatch) {
    sessionStats.autoLinked++;
    return {
      success: true,
      action: "auto_linked",
      productId: exactMatch.id,
      productName: exactMatch.canonical_name,
      confidence: 1.0,
      aiUsed: false,
    };
  }

  // Step 2: Fuzzy match (free)
  const products = getAllProducts();
  const fuzzyMatch = findBestMatch(ingredientName, products);

  if (fuzzyMatch && fuzzyMatch.confidence >= 0.9) {
    // High confidence - auto link
    sessionStats.autoLinked++;
    await addSynonymToProduct(fuzzyMatch.productId, ingredientName);
    return {
      success: true,
      action: "auto_linked",
      productId: fuzzyMatch.productId,
      productName: fuzzyMatch.productName,
      confidence: fuzzyMatch.confidence,
      aiUsed: false,
    };
  }

  if (fuzzyMatch && fuzzyMatch.confidence >= 0.7) {
    // Medium confidence - create moderation task
    await createModerationTask("link_suggestion", null, {
      ingredientName,
      suggestedProductId: fuzzyMatch.productId,
      suggestedProductName: fuzzyMatch.productName,
      confidence: fuzzyMatch.confidence,
      sourceLocale,
    }, fuzzyMatch.confidence);

    return {
      success: true,
      action: "suggested",
      productId: fuzzyMatch.productId,
      productName: fuzzyMatch.productName,
      confidence: fuzzyMatch.confidence,
      aiUsed: false,
    };
  }

  // Step 3: Check AI cache
  const cacheKey = generateInputHash(ingredientName, "link");
  const cachedDecision = await getCachedAIDecision(cacheKey);
  if (cachedDecision) {
    sessionStats.cacheHits++;
    return cachedDecision as ModerationResult;
  }

  // Step 4: Use AI only when necessary
  return await queueForAIProcessing(ingredientName, sourceLocale);
}

/**
 * Queue item for batch AI processing
 */
async function queueForAIProcessing(
  ingredientName: string,
  sourceLocale: Locale
): Promise<ModerationResult> {
  return new Promise((resolve, reject) => {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: "link",
      input: ingredientName,
      resolve,
      reject,
      timestamp: Date.now(),
    };

    processingQueue.push(item);

    // Start batch processing if not already running
    if (!isProcessing) {
      setTimeout(processBatch, BATCH_DELAY_MS);
    }
  });
}

/**
 * Process batch of queued items
 */
async function processBatch(): Promise<void> {
  if (isProcessing || processingQueue.length === 0) return;
  isProcessing = true;

  const batch = processingQueue.splice(0, BATCH_SIZE);
  const linkItems = batch.filter((item) => item.type === "link");

  if (linkItems.length > 0) {
    try {
      const results = await batchAILink(linkItems.map((i) => i.input));

      for (let i = 0; i < linkItems.length; i++) {
        const item = linkItems[i];
        const result = results[i];

        // Cache the result
        const cacheKey = generateInputHash(item.input, "link");
        await saveAIDecision(cacheKey, "link", result);

        item.resolve(result);
      }
    } catch (error) {
      for (const item of linkItems) {
        sessionStats.errors++;
        item.reject(error as Error);
      }
    }
  }

  isProcessing = false;

  // Process next batch if queue not empty
  if (processingQueue.length > 0) {
    setTimeout(processBatch, BATCH_DELAY_MS);
  }
}

/**
 * Batch AI link processing
 */
async function batchAILink(inputs: string[]): Promise<ModerationResult[]> {
  sessionStats.aiCalls++;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return inputs.map(() => ({
      success: false,
      action: "error" as const,
      aiUsed: true,
      details: "Missing OPENAI_API_KEY",
    }));
  }

  // Get some products for context (top 100 by usage)
  const products = getAllProducts().slice(0, 100);
  const productList = products.map((p) => `${p.canonical_name} (${p.category || "other"})`).join(", ");

  const prompt = `Ты помощник для модерации продуктов в приложении рецептов.

Задача: для каждого ингредиента определи, является ли он:
1. Синонимом существующего продукта (укажи какого)
2. Новым уникальным продуктом (нужно создать)
3. Мусором/опечаткой (пропустить)

Список существующих продуктов (примеры): ${productList}

Ингредиенты для анализа:
${inputs.map((input, i) => `${i + 1}. ${input}`).join("\n")}

Верни JSON массив с результатами для каждого ингредиента:
[
  {
    "index": 1,
    "action": "link" | "create" | "skip",
    "matchedProduct": "название если action=link",
    "confidence": 0.0-1.0,
    "reason": "краткое пояснение",
    "category": "категория если action=create (vegetables|fruits|meat|dairy|grains|fish|bakery|frozen|drinks|spices|canned|snacks|other)"
  }
]`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;

    if (!content) {
      throw new Error("Empty response from AI");
    }

    // Estimate tokens used
    sessionStats.tokensUsed += Math.ceil(prompt.length / 4) + Math.ceil(content.length / 4);

    // Strip markdown code blocks if present
    const cleanedContent = stripMarkdownCodeBlocks(content);
    const parsed = JSON.parse(cleanedContent);
    const results: ModerationResult[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const aiResult = parsed.find((r: { index: number }) => r.index === i + 1);

      if (!aiResult) {
        results.push({
          success: false,
          action: "error",
          aiUsed: true,
          details: "No AI result for this input",
        });
        continue;
      }

      if (aiResult.action === "link" && aiResult.matchedProduct) {
        // Find the product by name
        const matchedProduct = findProductByExactName(aiResult.matchedProduct);
        if (matchedProduct) {
          await addSynonymToProduct(matchedProduct.id, input);
          results.push({
            success: true,
            action: "auto_linked",
            productId: matchedProduct.id,
            productName: matchedProduct.canonical_name,
            confidence: aiResult.confidence || 0.8,
            aiUsed: true,
          });
        } else {
          // Create suggestion task
          await createModerationTask("link_suggestion", null, {
            ingredientName: input,
            suggestedProductName: aiResult.matchedProduct,
            confidence: aiResult.confidence || 0.7,
            aiReason: aiResult.reason,
          }, aiResult.confidence || 0.7);

          results.push({
            success: true,
            action: "suggested",
            productName: aiResult.matchedProduct,
            confidence: aiResult.confidence || 0.7,
            aiUsed: true,
          });
        }
      } else if (aiResult.action === "create") {
        // Create new product task
        await createModerationTask("new_product", null, {
          ingredientName: input,
          suggestedCategory: aiResult.category,
          confidence: aiResult.confidence || 0.8,
          aiReason: aiResult.reason,
        }, aiResult.confidence || 0.8);

        results.push({
          success: true,
          action: "suggested",
          confidence: aiResult.confidence || 0.8,
          aiUsed: true,
          details: { category: aiResult.category, reason: aiResult.reason },
        });
      } else {
        results.push({
          success: true,
          action: "skipped",
          aiUsed: true,
          confidence: aiResult.confidence || 0.5,
          details: { reason: aiResult.reason },
        });
      }
    }

    return results;
  } catch (error) {
    sessionStats.errors++;
    return inputs.map(() => ({
      success: false,
      action: "error" as const,
      aiUsed: true,
      details: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

/**
 * Fill missing product data with AI
 */
export async function fillProductWithAI(
  productId: string,
  productName: string
): Promise<{ success: boolean; fieldsUpdated: number; tokensUsed: number }> {
  // Check cache first
  const cacheKey = generateInputHash(productName, "fill");
  const cached = await getCachedAIDecision(cacheKey);
  if (cached) {
    sessionStats.cacheHits++;
    // Apply cached data
    const result = await applyAIData(productId, cached as Record<string, unknown>);
    return { ...result, tokensUsed: 0 };
  }

  sessionStats.aiCalls++;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, fieldsUpdated: 0, tokensUsed: 0 };
  }

  const prompt = `Для продукта "${productName}" верни JSON с данными:
{
  "calories": число ккал на 100г,
  "protein": граммы белка на 100г,
  "fat": граммы жира на 100г,
  "carbohydrates": граммы углеводов на 100г,
  "fiber": граммы клетчатки на 100г,
  "description": "краткое описание 1-2 предложения",
  "storage_tips": "советы по хранению",
  "typical_serving": число граммов типичной порции,
  "default_shelf_life_days": срок хранения в днях,
  "synonyms": ["массив", "синонимов", "5-8 штук"]
}

Верни ТОЛЬКО валидный JSON без markdown.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;

    const tokensUsed = Math.ceil(prompt.length / 4) + Math.ceil((content?.length || 0) / 4);
    sessionStats.tokensUsed += tokensUsed;

    if (!content) {
      return { success: false, fieldsUpdated: 0, tokensUsed };
    }

    // Strip markdown code blocks if present
    const cleanedContent = stripMarkdownCodeBlocks(content);
    const parsed = JSON.parse(cleanedContent);
    await saveAIDecision(cacheKey, "fill", parsed);

    const result = await applyAIData(productId, parsed);
    return { ...result, tokensUsed };
  } catch (error) {
    sessionStats.errors++;
    return { success: false, fieldsUpdated: 0, tokensUsed: 0 };
  }
}

/**
 * Apply AI data to product
 */
async function applyAIData(
  productId: string,
  aiData: Record<string, unknown>
): Promise<{ success: boolean; fieldsUpdated: number }> {
  // Get current product
  const { data: product, error } = await supabaseAdmin
    .from("product_dictionary")
    .select("*")
    .eq("id", productId)
    .single();

  if (error || !product) {
    return { success: false, fieldsUpdated: 0 };
  }

  const updates: Record<string, unknown> = {};
  let fieldsUpdated = 0;

  const fieldsToFill = [
    "calories", "protein", "fat", "carbohydrates", "fiber",
    "description", "storage_tips", "typical_serving", "default_shelf_life_days"
  ];

  for (const field of fieldsToFill) {
    if (product[field] === null && aiData[field] !== undefined) {
      updates[field] = aiData[field];
      fieldsUpdated++;
    }
  }

  // Merge synonyms
  if (Array.isArray(aiData.synonyms)) {
    const existing = Array.isArray(product.synonyms) ? product.synonyms : [];
    const merged = [...new Set([...existing, ...(aiData.synonyms as string[])])];
    if (merged.length > existing.length) {
      updates.synonyms = merged;
      fieldsUpdated++;
    }
  }

  if (fieldsUpdated > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("product_dictionary")
      .update(updates)
      .eq("id", productId);

    if (updateError) {
      return { success: false, fieldsUpdated: 0 };
    }
  }

  return { success: true, fieldsUpdated };
}

/**
 * Add synonym to product
 */
async function addSynonymToProduct(productId: string, synonym: string): Promise<void> {
  const { data: product } = await supabaseAdmin
    .from("product_dictionary")
    .select("canonical_name, synonyms")
    .eq("id", productId)
    .single();

  if (!product) return;

  const synonyms = Array.isArray(product.synonyms) ? product.synonyms : [];
  const normalizedSyn = normalize(synonym);
  const normalizedCanonical = normalize(product.canonical_name);

  // Don't add if already exists or matches canonical
  if (normalizedSyn === normalizedCanonical) return;
  if (synonyms.some((s) => normalize(s) === normalizedSyn)) return;

  await supabaseAdmin
    .from("product_dictionary")
    .update({ synonyms: [...synonyms, synonym] })
    .eq("id", productId);
}

/**
 * Create moderation task
 */
async function createModerationTask(
  taskType: string,
  productId: string | null,
  suggestedAction: object,
  confidence: number
): Promise<void> {
  // Check for existing similar task
  const { data: existing } = await supabaseAdmin
    .from("moderation_tasks")
    .select("id")
    .eq("task_type", taskType)
    .eq("status", "pending")
    .limit(1);

  // Simple duplicate check by suggested action content
  if (existing && existing.length > 0) {
    // Could be more sophisticated, for now just skip
  }

  await supabaseAdmin.from("moderation_tasks").insert({
    task_type: taskType,
    product_id: productId,
    suggested_action: suggestedAction,
    confidence,
    status: "pending",
  });
}

/**
 * Get current session stats
 */
export function getModeratorStats(): ModeratorStats {
  return { ...sessionStats };
}

/**
 * Reset session stats
 */
export function resetModeratorStats(): void {
  sessionStats.totalProcessed = 0;
  sessionStats.autoLinked = 0;
  sessionStats.aiCalls = 0;
  sessionStats.tokensUsed = 0;
  sessionStats.cacheHits = 0;
  sessionStats.errors = 0;
}

/**
 * Process multiple ingredients at once (batch)
 */
export async function processIngredientsBatch(
  ingredients: string[],
  sourceLocale: Locale = "ru"
): Promise<ModerationResult[]> {
  await refreshProductCache();

  const results: ModerationResult[] = [];
  const needsAI: { index: number; name: string }[] = [];

  // First pass: try to match without AI
  for (let i = 0; i < ingredients.length; i++) {
    const name = ingredients[i];
    const normalized = normalizeForCache(name);

    if (!normalized || normalized.length < 2) {
      results[i] = { success: false, action: "skipped", aiUsed: false };
      continue;
    }

    // Exact match
    const exactMatch = findProductByExactName(name);
    if (exactMatch) {
      sessionStats.autoLinked++;
      results[i] = {
        success: true,
        action: "auto_linked",
        productId: exactMatch.id,
        productName: exactMatch.canonical_name,
        confidence: 1.0,
        aiUsed: false,
      };
      continue;
    }

    // Fuzzy match
    const products = getAllProducts();
    const fuzzyMatch = findBestMatch(name, products);

    if (fuzzyMatch && fuzzyMatch.confidence >= 0.9) {
      sessionStats.autoLinked++;
      await addSynonymToProduct(fuzzyMatch.productId, name);
      results[i] = {
        success: true,
        action: "auto_linked",
        productId: fuzzyMatch.productId,
        productName: fuzzyMatch.productName,
        confidence: fuzzyMatch.confidence,
        aiUsed: false,
      };
      continue;
    }

    if (fuzzyMatch && fuzzyMatch.confidence >= 0.7) {
      await createModerationTask("link_suggestion", null, {
        ingredientName: name,
        suggestedProductId: fuzzyMatch.productId,
        suggestedProductName: fuzzyMatch.productName,
        confidence: fuzzyMatch.confidence,
        sourceLocale,
      }, fuzzyMatch.confidence);

      results[i] = {
        success: true,
        action: "suggested",
        productId: fuzzyMatch.productId,
        productName: fuzzyMatch.productName,
        confidence: fuzzyMatch.confidence,
        aiUsed: false,
      };
      continue;
    }

    // Check cache
    const cacheKey = generateInputHash(name, "link");
    const cached = await getCachedAIDecision(cacheKey);
    if (cached) {
      sessionStats.cacheHits++;
      results[i] = cached as ModerationResult;
      continue;
    }

    // Need AI
    needsAI.push({ index: i, name });
  }

  // Second pass: batch AI processing for items that need it
  if (needsAI.length > 0) {
    const aiResults = await batchAILink(needsAI.map((item) => item.name));
    for (let j = 0; j < needsAI.length; j++) {
      const { index, name } = needsAI[j];
      results[index] = aiResults[j];

      // Cache the result
      const cacheKey = generateInputHash(name, "link");
      await saveAIDecision(cacheKey, "link", aiResults[j]);
    }
  }

  return results;
}
