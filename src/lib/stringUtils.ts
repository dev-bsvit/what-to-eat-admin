/**
 * String utilities for product matching and normalization
 */

/**
 * Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize string for comparison
 */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  const distance = levenshtein(normA, normB);
  return 1 - distance / maxLen;
}

/**
 * Check if one string contains another (normalized)
 */
export function containsMatch(a: string, b: string): boolean {
  const normA = normalize(a);
  const normB = normalize(b);
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Common prefix length
 */
export function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  for (; i < len; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

/**
 * Check if UUID
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Russian stemming (basic)
 * Removes common Russian suffixes
 */
export function stemRussian(word: string): string {
  const normalized = normalize(word);

  // Common Russian noun/adjective endings
  const suffixes = [
    'ами', 'ями', 'ому', 'ему', 'ого', 'его', 'ыми', 'ими',
    'ах', 'ях', 'ой', 'ей', 'ую', 'юю', 'ом', 'ем', 'ым', 'им',
    'ов', 'ев', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее',
    'а', 'я', 'о', 'е', 'у', 'ю', 'ы', 'и', 'й'
  ];

  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 2) {
      return normalized.slice(0, -suffix.length);
    }
  }

  return normalized;
}

/**
 * Match score between ingredient name and product
 */
export interface MatchResult {
  productId: string;
  productName: string;
  confidence: number;
  matchType: 'exact' | 'normalized' | 'contains' | 'levenshtein' | 'stem' | 'synonym';
}

export function calculateMatchScore(
  ingredientName: string,
  product: {
    id: string;
    canonical_name: string;
    synonyms?: string[] | null;
  }
): MatchResult | null {
  const ingNorm = normalize(ingredientName);
  const prodNorm = normalize(product.canonical_name);

  // 1. Exact match
  if (ingNorm === prodNorm) {
    return {
      productId: product.id,
      productName: product.canonical_name,
      confidence: 1.0,
      matchType: 'exact'
    };
  }

  // 2. Check synonyms for exact match
  const synonyms = product.synonyms || [];
  for (const syn of synonyms) {
    if (normalize(syn) === ingNorm) {
      return {
        productId: product.id,
        productName: product.canonical_name,
        confidence: 0.98,
        matchType: 'synonym'
      };
    }
  }

  // 3. Contains match
  if (containsMatch(ingNorm, prodNorm)) {
    const shorter = Math.min(ingNorm.length, prodNorm.length);
    const longer = Math.max(ingNorm.length, prodNorm.length);
    const containsScore = 0.7 + (0.2 * shorter / longer);
    return {
      productId: product.id,
      productName: product.canonical_name,
      confidence: containsScore,
      matchType: 'contains'
    };
  }

  // 4. Stem match
  const ingStem = stemRussian(ingredientName);
  const prodStem = stemRussian(product.canonical_name);
  if (ingStem === prodStem && ingStem.length >= 3) {
    return {
      productId: product.id,
      productName: product.canonical_name,
      confidence: 0.85,
      matchType: 'stem'
    };
  }

  // 5. Levenshtein distance
  const sim = similarity(ingNorm, prodNorm);
  if (sim >= 0.7) {
    return {
      productId: product.id,
      productName: product.canonical_name,
      confidence: sim,
      matchType: 'levenshtein'
    };
  }

  // 6. Check synonyms with fuzzy matching
  for (const syn of synonyms) {
    const synSim = similarity(ingNorm, normalize(syn));
    if (synSim >= 0.8) {
      return {
        productId: product.id,
        productName: product.canonical_name,
        confidence: synSim * 0.95,
        matchType: 'synonym'
      };
    }
  }

  return null;
}

/**
 * Find best match from a list of products
 */
export function findBestMatch(
  ingredientName: string,
  products: Array<{
    id: string;
    canonical_name: string;
    synonyms?: string[] | null;
  }>
): MatchResult | null {
  let bestMatch: MatchResult | null = null;

  for (const product of products) {
    const match = calculateMatchScore(ingredientName, product);
    if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
      bestMatch = match;
    }
  }

  return bestMatch;
}

/**
 * Find duplicate candidates in product list
 */
export interface DuplicateCandidate {
  productId: string;
  productName: string;
  matchedWithId: string;
  matchedWithName: string;
  confidence: number;
  matchType: 'exact' | 'levenshtein' | 'contains' | 'stem' | 'synonym';
}

export function findDuplicateCandidates(
  products: Array<{
    id: string;
    canonical_name: string;
    synonyms?: string[] | null;
  }>
): DuplicateCandidate[] {
  const duplicates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const normalizedSynonyms = new Map<string, Set<string>>();
  products.forEach((product) => {
    const set = new Set<string>();
    (product.synonyms || []).forEach((syn) => {
      if (syn) {
        set.add(normalize(syn));
      }
    });
    normalizedSynonyms.set(product.id, set);
  });

  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];

      const pairKey = [a.id, b.id].sort().join('-');
      if (seen.has(pairKey)) continue;

      const aNorm = normalize(a.canonical_name);
      const bNorm = normalize(b.canonical_name);
      const aSyn = normalizedSynonyms.get(a.id) || new Set<string>();
      const bSyn = normalizedSynonyms.get(b.id) || new Set<string>();

      if (aSyn.has(bNorm) || bSyn.has(aNorm)) {
        seen.add(pairKey);
        duplicates.push({
          productId: a.id,
          productName: a.canonical_name,
          matchedWithId: b.id,
          matchedWithName: b.canonical_name,
          confidence: 0.97,
          matchType: 'synonym'
        });
        continue;
      }

      // Exact match after normalization
      if (aNorm === bNorm) {
        seen.add(pairKey);
        duplicates.push({
          productId: a.id,
          productName: a.canonical_name,
          matchedWithId: b.id,
          matchedWithName: b.canonical_name,
          confidence: 1.0,
          matchType: 'exact'
        });
        continue;
      }

      // Levenshtein distance <= 2
      const distance = levenshtein(aNorm, bNorm);
      if (distance <= 2 && Math.max(aNorm.length, bNorm.length) > 4) {
        seen.add(pairKey);
        duplicates.push({
          productId: a.id,
          productName: a.canonical_name,
          matchedWithId: b.id,
          matchedWithName: b.canonical_name,
          confidence: 1 - (distance / Math.max(aNorm.length, bNorm.length)),
          matchType: 'levenshtein'
        });
        continue;
      }

      // One contains another (for short strings)
      if (aNorm.length >= 4 && bNorm.length >= 4) {
        if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
          const shorter = Math.min(aNorm.length, bNorm.length);
          const longer = Math.max(aNorm.length, bNorm.length);
          // Only if the shorter is at least 70% of the longer
          if (shorter / longer >= 0.7) {
            seen.add(pairKey);
            duplicates.push({
              productId: a.id,
              productName: a.canonical_name,
              matchedWithId: b.id,
              matchedWithName: b.canonical_name,
              confidence: shorter / longer,
              matchType: 'contains'
            });
            continue;
          }
        }
      }

      // Stem match
      const aStem = stemRussian(a.canonical_name);
      const bStem = stemRussian(b.canonical_name);
      if (aStem === bStem && aStem.length >= 4) {
        seen.add(pairKey);
        duplicates.push({
          productId: a.id,
          productName: a.canonical_name,
          matchedWithId: b.id,
          matchedWithName: b.canonical_name,
          confidence: 0.85,
          matchType: 'stem'
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.confidence - a.confidence);
}
