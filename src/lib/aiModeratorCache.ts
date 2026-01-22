/**
 * AI Moderator Cache - for token economy
 * Caches product data and AI decisions to minimize API calls
 */

import { supabaseAdmin } from "./supabaseAdmin";

// In-memory cache (refreshed periodically)
let productCache: Map<string, CachedProduct> = new Map();
let normalizedNameIndex: Map<string, string[]> = new Map(); // normalized name -> product IDs
let lastCacheRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CachedProduct {
  id: string;
  canonical_name: string;
  synonyms: string[];
  category: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
}

// AI decision cache (persisted in DB)
export interface AIDecisionCache {
  input_hash: string;
  decision_type: "link" | "create" | "translate" | "fill";
  result: unknown;
  created_at: string;
  expires_at: string;
}

/**
 * Normalize string for cache lookup
 */
export function normalizeForCache(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate hash for AI decision caching
 */
export function generateInputHash(input: string, type: string): string {
  const normalized = normalizeForCache(input);
  // Simple hash for caching
  let hash = 0;
  const str = `${type}:${normalized}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Refresh product cache from database
 */
export async function refreshProductCache(): Promise<void> {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL && productCache.size > 0) {
    return; // Cache still valid
  }

  const { data: products, error } = await supabaseAdmin
    .from("product_dictionary")
    .select("id, canonical_name, synonyms, category, calories, protein, fat, carbohydrates");

  if (error || !products) {
    console.error("Failed to refresh product cache:", error);
    return;
  }

  productCache.clear();
  normalizedNameIndex.clear();

  for (const product of products) {
    const cached: CachedProduct = {
      id: product.id,
      canonical_name: product.canonical_name || "",
      synonyms: Array.isArray(product.synonyms) ? product.synonyms : [],
      category: product.category,
      calories: product.calories,
      protein: product.protein,
      fat: product.fat,
      carbohydrates: product.carbohydrates,
    };

    productCache.set(product.id, cached);

    // Index by normalized canonical name
    const normalizedName = normalizeForCache(cached.canonical_name);
    if (normalizedName) {
      const existing = normalizedNameIndex.get(normalizedName) || [];
      existing.push(product.id);
      normalizedNameIndex.set(normalizedName, existing);
    }

    // Index by normalized synonyms
    for (const syn of cached.synonyms) {
      const normalizedSyn = normalizeForCache(syn);
      if (normalizedSyn) {
        const existing = normalizedNameIndex.get(normalizedSyn) || [];
        if (!existing.includes(product.id)) {
          existing.push(product.id);
          normalizedNameIndex.set(normalizedSyn, existing);
        }
      }
    }
  }

  lastCacheRefresh = now;
  console.log(`Product cache refreshed: ${productCache.size} products, ${normalizedNameIndex.size} names indexed`);
}

/**
 * Find product by exact normalized name (fast lookup)
 */
export function findProductByExactName(name: string): CachedProduct | null {
  const normalized = normalizeForCache(name);
  const ids = normalizedNameIndex.get(normalized);
  if (ids && ids.length > 0) {
    return productCache.get(ids[0]) || null;
  }
  return null;
}

/**
 * Find products by prefix (for fuzzy matching)
 */
export function findProductsByPrefix(prefix: string, limit = 20): CachedProduct[] {
  const normalizedPrefix = normalizeForCache(prefix);
  const results: CachedProduct[] = [];
  const seen = new Set<string>();

  for (const [name, ids] of normalizedNameIndex.entries()) {
    if (name.startsWith(normalizedPrefix)) {
      for (const id of ids) {
        if (!seen.has(id) && results.length < limit) {
          seen.add(id);
          const product = productCache.get(id);
          if (product) results.push(product);
        }
      }
    }
  }

  return results;
}

/**
 * Get all products for matching
 */
export function getAllProducts(): CachedProduct[] {
  return Array.from(productCache.values());
}

/**
 * Get cached AI decision
 */
export async function getCachedAIDecision(
  inputHash: string
): Promise<unknown | null> {
  const { data } = await supabaseAdmin
    .from("ai_decision_cache")
    .select("result, expires_at")
    .eq("input_hash", inputHash)
    .single();

  if (data && new Date(data.expires_at) > new Date()) {
    return data.result;
  }

  return null;
}

/**
 * Save AI decision to cache
 */
export async function saveAIDecision(
  inputHash: string,
  decisionType: "link" | "create" | "translate" | "fill",
  result: unknown,
  ttlHours = 24
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await supabaseAdmin.from("ai_decision_cache").upsert({
    input_hash: inputHash,
    decision_type: decisionType,
    result,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("ai_decision_cache")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("input_hash");

  if (error) {
    console.error("Failed to clear expired cache:", error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Invalidate cache for specific product (when updated)
 */
export function invalidateProductCache(productId: string): void {
  productCache.delete(productId);
  // Force refresh on next access
  lastCacheRefresh = 0;
}

/**
 * Get cache stats
 */
export function getCacheStats(): {
  productCount: number;
  indexedNames: number;
  cacheAge: number;
  isStale: boolean;
} {
  const now = Date.now();
  return {
    productCount: productCache.size,
    indexedNames: normalizedNameIndex.size,
    cacheAge: lastCacheRefresh ? now - lastCacheRefresh : -1,
    isStale: now - lastCacheRefresh > CACHE_TTL,
  };
}
