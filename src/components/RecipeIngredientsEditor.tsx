"use client";

import { useEffect, useRef, useState } from "react";

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
  imageUrl?: string;
}

interface Product {
  id: string;
  canonical_name: string;
  synonyms?: string[];
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrates?: number;
  preferred_unit?: string;
  icon: string;
  image_url?: string;
}

interface NutritionTotals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface RecipeIngredientsEditorProps {
  value: Ingredient[];
  onChange: (ingredients: Ingredient[]) => void;
  servings: number;
}

export default function RecipeIngredientsEditor({ value, onChange, servings }: RecipeIngredientsEditorProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(value);
  const isSyncingRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<"add" | "replace">("add");
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [unmatchedIds, setUnmatchedIds] = useState<Set<string>>(new Set());
  const [matchStatus, setMatchStatus] = useState<string | null>(null);

  useEffect(() => {
    isSyncingRef.current = true;
    setIngredients(value);
  }, [value]);

  // Синхронизация с родительским компонентом
  useEffect(() => {
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    onChange(ingredients);
  }, [ingredients]);

  useEffect(() => {
    setUnmatchedIds(() => new Set(ingredients.filter(ing => !ing.productId).map(ing => ing.id)));
  }, [ingredients]);

  // Поиск продуктов
  const searchProducts = async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/admin/products?search=${encodeURIComponent(term)}`);
      const result = await response.json();
      setSearchResults(result.data || []);
    } catch (error) {
      console.error("Ошибка поиска:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-z0-9а-я]+/gi, " ")
      .trim();

  const tokenize = (value: string) => normalizeName(value).split(" ").filter(Boolean);

  const computeMatchScore = (needle: string, product: Product) => {
    const normalizedNeedle = normalizeName(needle);
    if (!normalizedNeedle) return 0;
    const candidates = [product.canonical_name, ...(product.synonyms || [])].filter(Boolean);
    let best = 0;
    candidates.forEach((candidate) => {
      const normalizedCandidate = normalizeName(candidate);
      if (!normalizedCandidate) return;
      if (normalizedCandidate === normalizedNeedle) {
        best = Math.max(best, 1);
        return;
      }
      if (normalizedCandidate.includes(normalizedNeedle)) {
        best = Math.max(best, 0.85);
        return;
      }
      if (normalizedNeedle.includes(normalizedCandidate)) {
        best = Math.max(best, 0.75);
        return;
      }
      const needleTokens = tokenize(normalizedNeedle);
      const candidateTokens = tokenize(normalizedCandidate);
      if (!needleTokens.length || !candidateTokens.length) return;
      const intersection = needleTokens.filter(token => candidateTokens.includes(token));
      const overlap = intersection.length / Math.max(needleTokens.length, candidateTokens.length);
      if (overlap >= 0.6) {
        best = Math.max(best, 0.6);
      }
    });
    return best;
  };

  const fetchProducts = async (term: string) => {
    const response = await fetch(`/api/admin/products?search=${encodeURIComponent(term)}&include_synonyms=1`);
    const result = await response.json();
    return (result.data || []) as Product[];
  };

  const findBestMatch = async (name: string) => {
    if (name.trim().length < 2) return null;
    try {
      let items = await fetchProducts(name);
      if (!items.length) {
        const tokens = tokenize(name).filter(token => token.length > 2);
        const tokenResults = await Promise.all(tokens.map(fetchProducts));
        const merged = new Map<string, Product>();
        tokenResults.flat().forEach(item => merged.set(item.id, item));
        items = Array.from(merged.values());
      }

      if (!items.length) return null;
      let best: { item: Product; score: number } | null = null;
      for (const item of items) {
        const score = computeMatchScore(name, item);
        if (!best || score > best.score) {
          best = { item, score };
        }
      }
      if (!best || best.score < 0.6) {
        return null;
      }
      return best;
    } catch (error) {
      console.error("Ошибка автоподстановки:", error);
      return null;
    }
  };

  const autoMatchIngredients = async () => {
    const targets = ingredients.filter(ing => ing.productName.trim().length > 0);
    if (targets.length === 0) {
      setMatchStatus("Нет ингредиентов для сопоставления");
      return;
    }

    setMatchStatus(`Сопоставление ${targets.length} ингредиентов...`);
    setIsSearching(true);

    try {
      const updates = await Promise.all(
        targets.map(async (ing) => {
          const match = await findBestMatch(ing.productName);
          return { id: ing.id, match };
        })
      );

      const nextIngredients = ingredients.map(ing => {
        const update = updates.find(item => item.id === ing.id);
        if (!update || !update.match) return ing;

        if (update.match.score < 0.9 && ing.productId) {
          return ing;
        }

        if (ing.productId && update.match.item.id === ing.productId) {
          return ing;
        }

        console.log(`✅ Matched ${ing.productName}:`, {
          productId: update.match.item.id,
          calories: update.match.item.calories,
          protein: update.match.item.protein,
          fat: update.match.item.fat,
          carbohydrates: update.match.item.carbohydrates,
          score: update.match.score,
        });

        return {
          ...ing,
          productId: update.match.item.id,
          productName: update.match.item.canonical_name,
          unit: ing.unit || update.match.item.preferred_unit || "g",
          calories: update.match.item.calories,
          protein: update.match.item.protein,
          fat: update.match.item.fat,
          carbs: update.match.item.carbohydrates,
          icon: update.match.item.icon,
          imageUrl: update.match.item.image_url,
        };
      });

      const remaining = nextIngredients.filter(ing => !ing.productId).length;
      const beforeMap = new Map(ingredients.map(ing => [ing.id, ing.productId]));
      const matched = nextIngredients.filter(ing => ing.productId !== beforeMap.get(ing.id)).length;

      // Проверяем сколько имеют БЖУ данные
      const withNutrition = nextIngredients.filter(ing => ing.calories !== undefined && ing.calories > 0).length;
      if (matched === 0) {
        setMatchStatus("Новых совпадений не найдено");
      } else {
        setMatchStatus(`✅ Сопоставлено: ${matched}, с БЖУ: ${withNutrition}, без базы: ${remaining}`);
      }
      setIngredients(nextIngredients);
    } catch (error) {
      console.error("Ошибка автосопоставления:", error);
      setMatchStatus("❌ Ошибка при сопоставлении");
    } finally {
      setIsSearching(false);
    }
  };

  const createProductsFromUnmatched = async () => {
    const targets = ingredients.filter(ing => !ing.productId && ing.productName.trim().length > 0);
    if (targets.length === 0) {
      return;
    }

    const unitPreference = (unit: string) => {
      if (["g", "kg"].includes(unit)) return "g";
      if (["ml", "l"].includes(unit)) return "ml";
      if (["pcs"].includes(unit)) return "pcs";
      return "";
    };

    const items = targets.map(ing => ({
      canonical_name: ing.productName,
      preferred_unit: unitPreference(ing.unit),
    }));

    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Ошибка при создании продуктов");
        return;
      }

      const createdProducts: Array<{ id: string; canonical_name: string }> = result.data || [];
      const lookup = new Map(
        createdProducts.map(item => [normalizeName(item.canonical_name), item.id])
      );

      const nextIngredients = ingredients.map(ing => {
        if (ing.productId) return ing;
        const id = lookup.get(normalizeName(ing.productName));
        if (!id) return ing;
        return {
          ...ing,
          productId: id,
          productName: ing.productName,
        };
      });

      const remaining = nextIngredients.filter(ing => !ing.productId).length;
      const createdCount = Math.max(0, targets.length - remaining);
      setMatchStatus(`Создано: ${createdCount}, осталось без базы: ${remaining}`);
      setIngredients(nextIngredients);
    } catch (error) {
      console.error("Ошибка создания продуктов:", error);
      alert("Ошибка при создании продуктов");
    }
  };

  // Дебаунс поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        searchProducts(searchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Добавить ингредиент
  const addIngredient = (product: Product) => {
    const newIngredient: Ingredient = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.canonical_name,
      quantity: 100,
      unit: product.preferred_unit || "g",
      calories: product.calories,
      protein: product.protein,
      fat: product.fat,
      carbs: product.carbohydrates,
      icon: product.icon,
      imageUrl: product.image_url,
    };

    setIngredients([...ingredients, newIngredient]);
    setSearchTerm("");
    setSearchResults([]);
    setShowSearch(false);
    setSearchMode("add");
    setReplaceTargetId(null);
  };

  const replaceIngredient = (targetId: string, product: Product) => {
    setIngredients(
      ingredients.map((ing) =>
        ing.id === targetId
          ? {
              ...ing,
              productId: product.id,
              productName: product.canonical_name,
              unit: ing.unit || product.preferred_unit || "g",
              calories: product.calories,
              protein: product.protein,
              fat: product.fat,
              carbs: product.carbohydrates,
              icon: product.icon,
              imageUrl: product.image_url,
            }
          : ing
      )
    );
    setUnmatchedIds((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setSearchTerm("");
    setSearchResults([]);
    setShowSearch(false);
    setSearchMode("add");
    setReplaceTargetId(null);
  };

  const openAddSearch = () => {
    setSearchMode("add");
    setReplaceTargetId(null);
    setShowSearch(true);
  };

  const openAddSearchWithTerm = (term: string) => {
    setSearchMode("add");
    setReplaceTargetId(null);
    setSearchTerm(term);
    setShowSearch(true);
  };

  const openReplaceSearch = (id: string) => {
    setSearchMode("replace");
    setReplaceTargetId(id);
    setShowSearch(true);
  };

  const handleSelectProduct = (product: Product) => {
    if (searchMode === "replace" && replaceTargetId) {
      replaceIngredient(replaceTargetId, product);
      return;
    }
    addIngredient(product);
  };

  // Обновить ингредиент
  const updateIngredient = (id: string, field: keyof Ingredient, value: any) => {
    setIngredients(
      ingredients.map((ing) =>
        ing.id === id ? { ...ing, [field]: value } : ing
      )
    );
  };

  // Удалить ингредиент
  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  // Рассчитать БЖУ для ингредиента
  const calculateIngredientNutrition = (ing: Ingredient) => {
    const factor = ing.quantity / 100;
    return {
      calories: Math.round((ing.calories || 0) * factor),
      protein: ((ing.protein || 0) * factor).toFixed(1),
      fat: ((ing.fat || 0) * factor).toFixed(1),
      carbs: ((ing.carbs || 0) * factor).toFixed(1),
    };
  };

  // Рассчитать общее БЖУ
  const calculateTotalNutrition = (): NutritionTotals => {
    return ingredients.reduce(
      (total, ing) => {
        const factor = ing.quantity / 100;
        return {
          calories: total.calories + (ing.calories || 0) * factor,
          protein: total.protein + (ing.protein || 0) * factor,
          fat: total.fat + (ing.fat || 0) * factor,
          carbs: total.carbs + (ing.carbs || 0) * factor,
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
  };

  const totalNutrition = calculateTotalNutrition();
  const perServing = {
    calories: Math.round(totalNutrition.calories / servings),
    protein: (totalNutrition.protein / servings).toFixed(1),
    fat: (totalNutrition.fat / servings).toFixed(1),
    carbs: (totalNutrition.carbs / servings).toFixed(1),
  };

  const unitOptions = [
    { value: "g", label: "г" },
    { value: "kg", label: "кг" },
    { value: "ml", label: "мл" },
    { value: "l", label: "л" },
    { value: "pcs", label: "шт" },
    { value: "tbsp", label: "ст.л." },
    { value: "tsp", label: "ч.л." },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={autoMatchIngredients}
          disabled={isSearching}
        >
          {isSearching ? "Сопоставление..." : "Умное сопоставление"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={createProductsFromUnmatched}
          disabled={unmatchedIds.size === 0 || isSearching}
        >
          Создать продукты из ненайденных
        </button>
        {unmatchedIds.size > 0 && !isSearching && (
          <span style={{ fontSize: '12px', color: '#b00020' }}>
            Не найдено в базе: {unmatchedIds.size}
          </span>
        )}
        {matchStatus && (
          <span style={{ fontSize: '12px', color: matchStatus.includes('❌') ? '#b00020' : 'var(--text-secondary)' }}>
            {matchStatus}
          </span>
        )}
      </div>

      {/* Список ингредиентов */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {ingredients.map((ing, index) => {
          const nutrition = calculateIngredientNutrition(ing);
          const isUnmatched = unmatchedIds.has(ing.id) || !ing.productId;
          return (
            <div
              key={ing.id}
              style={{
                padding: 'var(--spacing-md)',
                border: isUnmatched ? '1.5px solid #ff6b6b' : '1.5px solid var(--border-input)',
                borderRadius: 'var(--radius-sm)',
                background: isUnmatched ? '#fff5f5' : 'var(--bg-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)' }}>
                {ing.imageUrl ? (
                  <img
                    src={ing.imageUrl}
                    alt={ing.productName}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      objectFit: 'cover',
                      background: 'var(--bg-page)',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '24px' }}>{ing.icon || "📦"}</span>
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {index + 1}. {ing.productName}
                    {isUnmatched && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#b00020' }}>
                        Нет в базе
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                    <input
                      type="number"
                      className="input-sm"
                      value={ing.quantity}
                      onChange={(e) =>
                        updateIngredient(ing.id, "quantity", parseFloat(e.target.value) || 0)
                      }
                      step="0.1"
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {unitOptions.map((unit) => {
                        const isActive = ing.unit === unit.value;
                        return (
                          <button
                            key={unit.value}
                            type="button"
                            className={isActive ? "btn btn-primary" : "btn btn-secondary"}
                            onClick={() => updateIngredient(ing.id, "unit", unit.value)}
                            style={{ padding: '4px 8px', minWidth: '52px' }}
                          >
                            {unit.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* БЖУ ингредиента */}
                  <div style={{ fontSize: '12px', color: ing.calories ? 'var(--text-secondary)' : '#b00020' }}>
                    {ing.calories ? (
                      `${nutrition.calories} ккал | Б: ${nutrition.protein}г | Ж: ${nutrition.fat}г | У: ${nutrition.carbs}г`
                    ) : (
                      "⚠️ БЖУ данные отсутствуют в базе"
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openAddSearchWithTerm(ing.productName)}
                    style={{ minWidth: '72px', height: '32px', padding: '0 8px' }}
                  >
                    Добавить
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openReplaceSearch(ing.id)}
                    style={{ minWidth: '72px', height: '32px', padding: '0 8px' }}
                  >
                    Заменить
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => removeIngredient(ing.id)}
                    style={{ minWidth: '72px', height: '32px', padding: '0 8px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Кнопка добавления */}
      {!showSearch && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={openAddSearch}
          style={{ width: '100%' }}
        >
          + Добавить ингредиент
        </button>
      )}

      {/* Поиск продуктов */}
      {showSearch && (
        <div style={{
          padding: 'var(--spacing-lg)',
          border: '2px solid var(--accent-primary)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-light)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            <input
              type="text"
              className="input"
              placeholder={searchMode === "replace" ? "Поиск для замены..." : "Поиск продукта..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />

            {isSearching && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Поиск...</div>
            )}

            {searchResults.length > 0 && (
              <div style={{
                maxHeight: '240px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    style={{
                      padding: 'var(--spacing-sm)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--border-input)',
                      background: 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-input-hover)';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-input)';
                      e.currentTarget.style.background = 'var(--bg-surface)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.canonical_name}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            background: 'var(--bg-page)',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '24px' }}>{product.icon}</span>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {product.canonical_name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {product.calories || 0} ккал/100г
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchTerm.length >= 2 && !isSearching && searchResults.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Ничего не найдено</div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowSearch(false);
                setSearchTerm("");
                setSearchResults([]);
                setSearchMode("add");
                setReplaceTargetId(null);
              }}
              style={{ width: '100%' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Итоговое БЖУ */}
      {ingredients.length > 0 && (
        <div style={{
          padding: 'var(--spacing-lg)',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(to right, #d1f4e0, #c3f0d9)',
          border: '1px solid #34c759',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--spacing-sm)' }}>
            Пищевая ценность:
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-sm)',
            fontSize: '14px',
          }}>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Всего на рецепт:</div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {Math.round(totalNutrition.calories)} ккал
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Б: {totalNutrition.protein.toFixed(1)}г | Ж: {totalNutrition.fat.toFixed(1)}г | У: {totalNutrition.carbs.toFixed(1)}г
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>На 1 порцию ({servings} порций):</div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {perServing.calories} ккал
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Б: {perServing.protein}г | Ж: {perServing.fat}г | У: {perServing.carbs}г
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
