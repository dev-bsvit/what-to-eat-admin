"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Product {
  id: string;
  canonical_name: string;
  category: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrates?: number;
  icon: string;
  image_url?: string;
  preferred_unit?: string;
  auto_created?: boolean;
  needs_moderation?: boolean;
  created_by_user_id?: string | null;
}

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const categories: CategoryInfo[] = [
  { id: "grains", name: "Сыпучие", icon: "🌾", color: "#ffd43b" },
  { id: "meat", name: "Мясное", icon: "🥩", color: "#ff6b6b" },
  { id: "dairy", name: "Молочка", icon: "🥛", color: "#4dabf7" },
  { id: "vegetables", name: "Овощи", icon: "🥕", color: "#51cf66" },
  { id: "fruits", name: "Фрукты", icon: "🍎", color: "#ff922b" },
  { id: "bakery", name: "Хлебобулочные", icon: "🍞", color: "#fab005" },
  { id: "fish", name: "Рыба", icon: "🐟", color: "#22b8cf" },
  { id: "frozen", name: "Замороженное", icon: "❄️", color: "#91a7ff" },
  { id: "drinks", name: "Напитки", icon: "🥤", color: "#cc5de8" },
  { id: "spices", name: "Специи", icon: "🌶️", color: "#ff6b6b" },
  { id: "canned", name: "Консервы", icon: "🥫", color: "#ffa94d" },
  { id: "snacks", name: "Снеки", icon: "🍿", color: "#fab005" },
  { id: "other", name: "Прочее", icon: "📦", color: "#adb5bd" },
];

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const editParam = searchParams.get("edit");
  const prefillParam = searchParams.get("prefill");
  const returnParam = searchParams.get("return");
  const linkParam = searchParams.get("link");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importCategory, setImportCategory] = useState<string | null>(categoryParam);
  const [importFileName, setImportFileName] = useState("");
  const [excludeNames, setExcludeNames] = useState<string[]>([]);
  const [excludeLoading, setExcludeLoading] = useState(false);
  const [iconStatus, setIconStatus] = useState("");
  const [iconLoading, setIconLoading] = useState(false);
  const [onlyAutoCreated, setOnlyAutoCreated] = useState(false);
  const [onlyNeedsModeration, setOnlyNeedsModeration] = useState(false);
  const [onlyUserCreated, setOnlyUserCreated] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<Product[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeStatus, setMergeStatus] = useState("");

  const [formData, setFormData] = useState({
    id: "",
    canonical_name: "",
    category: categoryParam || "other",
    calories: "",
    protein: "",
    fat: "",
    carbohydrates: "",
    fiber: "",
    icon: "📦",
    image_url: "",
    preferred_unit: "g",
    typical_serving: "",
    requires_expiry: "false",
    default_shelf_life_days: "",
    synonyms: "",
    description: "",
    storage_tips: "",
    seasonal_months: "",
    average_piece_weight_g: "",
    auto_created: false,
    needs_moderation: false,
    created_by_user_id: "",
  });

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (editParam) {
      loadProductForEdit(editParam);
    }
  }, [editParam]);

  useEffect(() => {
    if (!prefillParam || editParam) {
      return;
    }
    resetForm();
    setFormData((prev) => ({
      ...prev,
      canonical_name: prefillParam,
      category: categoryParam || prev.category,
    }));
    setShowAddModal(true);
  }, [prefillParam, editParam, categoryParam]);

  useEffect(() => {
    setImportCategory(categoryParam);
  }, [categoryParam]);

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }
    setProducts([]);
    setPage(1);
    setTotalCount(null);
    loadCategoryProducts(1, true);
  }, [selectedCategory, searchTerm, onlyAutoCreated, onlyNeedsModeration, onlyUserCreated]);

  useEffect(() => {
    if (!showImportModal) {
      return;
    }
    void loadExcludeNames(importCategory || selectedCategory);
  }, [showImportModal, importCategory, selectedCategory]);

  async function loadSummary() {
    try {
      const response = await fetch("/api/admin/products?summary=1");
      const result = await response.json();
      setCategoryCounts(result.counts || {});
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategoryProducts(nextPage: number, replace = false) {
    if (!selectedCategory) {
      return;
    }
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("category", selectedCategory);
      params.set("page", String(nextPage));
      params.set("limit", "50");
      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }
      if (onlyAutoCreated) {
        params.set("auto_created", "1");
      }
      if (onlyNeedsModeration) {
        params.set("needs_moderation", "1");
      }
      if (onlyUserCreated) {
        params.set("user_created", "1");
      }
      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      const data = result.data || [];
      setProducts((prev) => (replace ? data : [...prev, ...data]));
      setPage(nextPage);
      if (typeof result.count === "number") {
        setTotalCount(result.count);
        const currentCount = replace ? data.length : products.length + data.length;
        setHasMore(currentCount < result.count);
      } else {
        setHasMore(data.length === 50);
      }
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setListLoading(false);
    }
  }

  async function loadExcludeNames(categoryId?: string | null) {
    setExcludeLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("names", "1");
      if (categoryId) {
        params.set("category", categoryId);
      }
      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      const names = Array.isArray(result.names) ? result.names : [];
      const cleaned = names.map((name: string) => name.trim()).filter(Boolean);
      setExcludeNames(cleaned);
    } catch (error) {
      console.error("Failed to load product names:", error);
      setExcludeNames([]);
    } finally {
      setExcludeLoading(false);
    }
  }
  async function loadProductForEdit(productId: string) {
    try {
      const response = await fetch(`/api/admin/products?id=${productId}`);
      const result = await response.json();
      if (result.data && result.data.length > 0) {
        const product = result.data[0];
        setEditingProduct(product);
        setFormData({
          id: product.id || "",
          canonical_name: product.canonical_name || "",
          category: product.category || "other",
          calories: product.calories?.toString() || "",
          protein: product.protein?.toString() || "",
          fat: product.fat?.toString() || "",
          carbohydrates: product.carbohydrates?.toString() || "",
          fiber: product.fiber?.toString() || "",
          icon: product.icon || "📦",
          image_url: product.image_url || "",
          preferred_unit: product.preferred_unit || "g",
          typical_serving: product.typical_serving?.toString() || "",
          requires_expiry: product.requires_expiry?.toString() || "false",
          default_shelf_life_days: product.default_shelf_life_days?.toString() || "",
          synonyms: Array.isArray(product.synonyms) ? product.synonyms.join(", ") : "",
          description: product.description || "",
          storage_tips: product.storage_tips || "",
          seasonal_months: Array.isArray(product.seasonal_months) ? product.seasonal_months.join(", ") : "",
          average_piece_weight_g: product.average_piece_weight_g?.toString() || "",
          auto_created: Boolean(product.auto_created),
          needs_moderation: Boolean(product.needs_moderation),
          created_by_user_id: product.created_by_user_id || "",
        });
        setMergeSearch("");
        setMergeResults([]);
        setMergeStatus("");
        setShowAddModal(true);
      }
    } catch (error) {
      console.error("Failed to load product:", error);
    }
  }

  async function handleSaveProduct() {
    if (!formData.canonical_name || !formData.category) {
      alert("Заполните обязательные поля: название и категория");
      return;
    }

    try {
      const payload = {
        id: formData.id || crypto.randomUUID(),
        canonical_name: formData.canonical_name,
        category: formData.category,
        icon: formData.icon,
        preferred_unit: formData.preferred_unit,
        requires_expiry: formData.requires_expiry === "true",
        synonyms: formData.synonyms ? formData.synonyms.split(",").map((s) => s.trim()) : [],
        description: formData.description || null,
        storage_tips: formData.storage_tips || null,
        calories: formData.calories ? parseFloat(formData.calories) : null,
        protein: formData.protein ? parseFloat(formData.protein) : null,
        fat: formData.fat ? parseFloat(formData.fat) : null,
        carbohydrates: formData.carbohydrates ? parseFloat(formData.carbohydrates) : null,
        fiber: formData.fiber ? parseFloat(formData.fiber) : null,
        image_url: formData.image_url || null,
        typical_serving: formData.typical_serving ? parseFloat(formData.typical_serving) : null,
        default_shelf_life_days: formData.default_shelf_life_days ? parseInt(formData.default_shelf_life_days) : null,
        seasonal_months: formData.seasonal_months
          ? formData.seasonal_months.split(",").map((m) => parseInt(m.trim())).filter((m) => !isNaN(m))
          : null,
        average_piece_weight_g: formData.average_piece_weight_g ? parseFloat(formData.average_piece_weight_g) : null,
        auto_created: formData.auto_created,
        needs_moderation: formData.needs_moderation,
        created_by_user_id: formData.created_by_user_id || null,
      };

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        const savedId =
          result?.data?.id ||
          (Array.isArray(result?.data) ? result.data[0]?.id : null) ||
          payload.id;
        setShowAddModal(false);
        setEditingProduct(null);
        if (returnParam === "scan") {
          const linkName = linkParam || formData.canonical_name;
          if (linkName) {
            await fetch("/api/admin/ingredients/link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: linkName, productId: savedId }),
            });
          }
          router.push("/ingredients-scan");
        } else {
          router.push("/products");
        }
        resetForm();
        await loadSummary();
        if (selectedCategory) {
          setProducts([]);
          setPage(1);
          setTotalCount(null);
          await loadCategoryProducts(1, true);
        }
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save product:", error);
      alert("Ошибка при сохранении продукта");
    }
  }

  function applyAiData(data: Record<string, unknown>) {
    setFormData((prev) => {
      const next = { ...prev };
      type FormKey = keyof typeof next;
      const setIfEmpty = (key: FormKey, value: unknown) => {
        const current = String(next[key] ?? "");
        if (current.trim().length > 0) {
          return;
        }
        if (value === null || value === undefined) {
          return;
        }
        if (Array.isArray(value)) {
          (next as Record<string, unknown>)[key] = value.join(", ");
          return;
        }
        if (typeof value === "boolean") {
          (next as Record<string, unknown>)[key] = value ? "true" : "false";
          return;
        }
        (next as Record<string, unknown>)[key] = String(value);
      };

      setIfEmpty("canonical_name", data.canonical_name);
      setIfEmpty("synonyms", data.synonyms);
      setIfEmpty("category", data.category);
      setIfEmpty("calories", data.calories);
      setIfEmpty("protein", data.protein);
      setIfEmpty("fat", data.fat);
      setIfEmpty("carbohydrates", data.carbohydrates);
      setIfEmpty("fiber", data.fiber);
      setIfEmpty("preferred_unit", data.preferred_unit);
      setIfEmpty("typical_serving", data.typical_serving);
      setIfEmpty("requires_expiry", data.requires_expiry);
      setIfEmpty("default_shelf_life_days", data.default_shelf_life_days);
      setIfEmpty("seasonal_months", data.seasonal_months);
      setIfEmpty("description", data.description);
      setIfEmpty("storage_tips", data.storage_tips);

      return next;
    });
  }

  async function handleAiFill() {
    if (!aiInput.trim()) {
      setAiStatus("Введите название или описание продукта.");
      return;
    }

    setAiStatus("AI заполняет поля...");
    try {
      const response = await fetch("/api/admin/ai/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: aiInput }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAiStatus(`Ошибка AI: ${result.error || "не удалось получить данные"}`);
        return;
      }
      applyAiData(result.data || {});
      setAiStatus("Готово ✅ Заполнил пустые поля");
    } catch (error) {
      setAiStatus("Ошибка AI: не удалось подключиться");
    }
  }

  function resetForm() {
    setFormData({
      id: "",
      canonical_name: "",
      category: selectedCategory || "other",
      calories: "",
      protein: "",
      fat: "",
      carbohydrates: "",
      fiber: "",
      icon: "📦",
      image_url: "",
      preferred_unit: "g",
      typical_serving: "",
      requires_expiry: "false",
      default_shelf_life_days: "",
      synonyms: "",
      description: "",
      storage_tips: "",
      seasonal_months: "",
      average_piece_weight_g: "",
      auto_created: false,
      needs_moderation: false,
      created_by_user_id: "",
    });
  }

  function openCategory(categoryId: string) {
    setSelectedCategory(categoryId);
  }

  function closeCategory() {
    setSelectedCategory(null);
  }

  function openAddModal(category?: string) {
    resetForm();
    if (category) {
      setFormData((prev) => ({ ...prev, category }));
    }
    setMergeSearch("");
    setMergeResults([]);
    setMergeStatus("");
    setShowAddModal(true);
  }

  function openImportModal(category?: string) {
    setImportCategory(category || null);
    setImportText("");
    setImportStatus("");
    setImportFileName("");
    setShowImportModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setEditingProduct(null);
    setMergeSearch("");
    setMergeResults([]);
    setMergeStatus("");
    if (returnParam === "scan") {
      router.push("/ingredients-scan");
      return;
    }
    router.push("/products");
  }

  async function handleMergeSearch() {
    const term = mergeSearch.trim();
    if (!term) {
      setMergeResults([]);
      return;
    }
    setMergeLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("search", term);
      params.set("limit", "10");
      params.set("page", "1");
      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      const data = Array.isArray(result.data) ? result.data : [];
      setMergeResults(data.filter((item: Product) => item.id !== formData.id));
    } catch (error) {
      setMergeResults([]);
    } finally {
      setMergeLoading(false);
    }
  }

  async function handleMergeProduct(targetId: string) {
    if (!editingProduct?.id) {
      return;
    }
    const confirmed = window.confirm("Объединить выбранный продукт с текущим?");
    if (!confirmed) {
      return;
    }
    setMergeStatus("Объединение...");
    try {
      const response = await fetch("/api/admin/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: targetId, mergeIds: [editingProduct.id] }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMergeStatus(`Ошибка: ${result.error || "не удалось объединить"}`);
        return;
      }
      setMergeStatus(`✅ Объединено. Обновлено ингредиентов: ${result.ingredientsUpdated || 0}`);
      await loadSummary();
      if (selectedCategory) {
        setProducts([]);
        setPage(1);
        setTotalCount(null);
        await loadCategoryProducts(1, true);
      }
    } catch (error) {
      setMergeStatus("Ошибка: не удалось объединить");
    }
  }

  function getCategoryName(categoryId?: string | null) {
    if (!categoryId) {
      return "продуктов";
    }
    const found = categories.find((cat) => cat.id === categoryId);
    return found ? found.name.toLowerCase() : "продуктов";
  }

  function buildImportPrompt(categoryId?: string | null, excludeNames: string[] = []) {
    const label = getCategoryName(categoryId);
    const category = categoryId || "other";
    const excludeLine = excludeNames.length
      ? `\nНе включать (уже есть в каталоге): ${excludeNames.join(", ")}.\n`
      : "\n";
    return `Сгенерируй список из 50 ${label}.\nВерни ТОЛЬКО валидный JSON без markdown.\nФормат: массив объектов.\n${excludeLine}\nОбязательные поля:\n- canonical_name (строка)\n- category (строка, используй "${category}")\n- synonyms (массив строк, 5-8 штук, включая опечатки)\n- preferred_unit (g|kg|ml|l|pcs)\n- calories (число)\n- protein (число)\n- fat (число)\n- carbohydrates (число)\n- fiber (число)\n- typical_serving (число)\n- requires_expiry (boolean)\n- default_shelf_life_days (число)\n- seasonal_months (массив чисел 1-12)\n- description (строка)\n- storage_tips (строка)\n\nПример элемента:\n{\n  \"canonical_name\": \"Гречка\",\n  \"category\": \"${category}\",\n  \"synonyms\": [\"гречка\", \"гречневая крупа\", \"греча\", \"гречкка\", \"grechka\"],\n  \"preferred_unit\": \"g\",\n  \"calories\": 343,\n  \"protein\": 13.3,\n  \"fat\": 3.4,\n  \"carbohydrates\": 68.0,\n  \"fiber\": 10.0,\n  \"typical_serving\": 50,\n  \"requires_expiry\": true,\n  \"default_shelf_life_days\": 365,\n  \"seasonal_months\": [1,2,3,4,5,6,7,8,9,10,11,12],\n  \"description\": \"Крупа из гречки, подходит для гарниров\",\n  \"storage_tips\": \"Хранить в сухом месте\"\n}`;
  }

  function parseImportText(raw: string, fallbackCategory?: string | null) {
    const trimmed = raw.trim();
    const items: Array<Record<string, any>> = [];

    if (!trimmed) {
      return items;
    }

    const fallback = fallbackCategory || "other";

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (typeof entry === "string") {
              const name = entry.trim();
              if (name) {
                items.push({ canonical_name: name, category: fallback });
              }
              return;
            }
            if (entry && typeof entry === "object") {
              const name = String((entry as any).canonical_name || "").trim();
              if (name) {
                const category = String((entry as any).category || fallback).trim() || fallback;
                items.push({ ...entry, canonical_name: name, category });
              }
            }
          });
          return items;
        }
      } catch (error) {
        // fallback to plain parsing
      }
    }

    const jsonLines = trimmed.split(/\r?\n/).filter(Boolean);
    let parsedAny = false;
    if (jsonLines.length > 0 && jsonLines.every((line) => line.trim().startsWith("{"))) {
      for (const line of jsonLines) {
        try {
          const entry = JSON.parse(line);
          if (entry && typeof entry === "object") {
            const name = String(entry.canonical_name || "").trim();
            if (name) {
              const category = String(entry.category || fallback).trim() || fallback;
              items.push({ ...entry, canonical_name: name, category });
              parsedAny = true;
            }
          }
        } catch (error) {
          parsedAny = false;
          break;
        }
      }
      if (parsedAny) {
        return items;
      }
    }

    const lines = trimmed
      .split(/\r?\n|;|,/)
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      items.push({ canonical_name: line, category: fallback });
    });

    return items;
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImportFileName(file.name);
    const text = await file.text();
    setImportText(text);
  }

  async function handleImportSubmit() {
    const items = parseImportText(importText, importCategory || selectedCategory);
    if (items.length === 0) {
      setImportStatus("Введите список продуктов или загрузите файл.");
      return;
    }

    const uniqueMap = new Map<string, Record<string, unknown>>();
    items.forEach((item) => {
      const key = item.canonical_name.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    const payload = Array.from(uniqueMap.values());

      setImportStatus(`Импорт: ${payload.length} продуктов...`);
      try {
        const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const result = await response.json();
      if (!response.ok) {
        setImportStatus(`Ошибка импорта: ${result.error || "неизвестная ошибка"}`);
        return;
      }
      setImportStatus(`Готово ✅ Добавлено/обновлено: ${result.count || 0}`);
      await loadSummary();
      if (selectedCategory) {
        setProducts([]);
        setPage(1);
        setTotalCount(null);
        await loadCategoryProducts(1, true);
      }
    } catch (error) {
      setImportStatus("Ошибка импорта: не удалось подключиться");
    }
  }

  async function handleAutoIcons() {
    setIconLoading(true);
    setIconStatus("Проставляю иконки...");
    try {
      const response = await fetch("/api/admin/products/icons", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setIconStatus(`Ошибка: ${result.error || "не удалось обновить"}`);
        return;
      }
      setIconStatus(`Готово ✅ Обновлено: ${result.updated || 0}`);
      await loadSummary();
      if (selectedCategory) {
        setProducts([]);
        setPage(1);
        setTotalCount(null);
        await loadCategoryProducts(1, true);
      }
    } catch (error) {
      setIconStatus("Ошибка: не удалось подключиться");
    } finally {
      setIconLoading(false);
    }
  }

  const searchedProducts = products;

  const categoryWithProducts = categories.map((cat) => ({
    ...cat,
    count: categoryCounts[cat.id] || 0,
  }));

  const modal = showAddModal ? (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && returnParam !== "scan") {
          closeAddModal();
        }
      }}
    >
      <div
        className="modal animate-slide-up"
        style={{
          maxWidth: '800px',
        }}
      >
        <h2 className="modal-header">
          {editingProduct ? "Редактировать продукт" : "Добавить новый продукт"}
        </h2>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
            AI‑помощник
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Введите название продукта — AI заполнит пустые поля.
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              placeholder="Например: куриная грудка"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              style={{ flex: 1, minWidth: '240px' }}
            />
            <button className="btn btn-secondary" onClick={handleAiFill}>
              AI заполнить
            </button>
          </div>
          {aiStatus && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {aiStatus}
            </div>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}>
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input
              type="text"
              className="input"
              placeholder="Молоко"
              value={formData.canonical_name}
              onChange={(e) => setFormData({ ...formData, canonical_name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Категория *</label>
            <select
              className="input"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Иконка</label>
            <input
              type="text"
              className="input"
              placeholder="🥛"
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Изображение (URL)</label>
            <input
              type="url"
              className="input"
              placeholder="https://..."
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Единица измерения</label>
            <select
              className="input"
              value={formData.preferred_unit}
              onChange={(e) => setFormData({ ...formData, preferred_unit: e.target.value })}
            >
              <option value="g">г (граммы)</option>
              <option value="kg">кг (килограммы)</option>
              <option value="ml">мл (миллилитры)</option>
              <option value="l">л (литры)</option>
              <option value="pcs">шт (штуки)</option>
              <option value="tbsp">ст.л. (столовые ложки)</option>
              <option value="tsp">ч.л. (чайные ложки)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Калории (на 100г)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="60"
              value={formData.calories}
              onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Белки (г)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="3.2"
              value={formData.protein}
              onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Жиры (г)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="3.6"
              value={formData.fat}
              onChange={(e) => setFormData({ ...formData, fat: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Углеводы (г)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="4.8"
              value={formData.carbohydrates}
              onChange={(e) => setFormData({ ...formData, carbohydrates: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Средний вес 1 шт (г)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="150"
              value={formData.average_piece_weight_g}
              onChange={(e) => setFormData({ ...formData, average_piece_weight_g: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Синонимы (через запятую)</label>
            <input
              type="text"
              className="input"
              placeholder="молоко коровье, молоко свежее"
              value={formData.synonyms}
              onChange={(e) => setFormData({ ...formData, synonyms: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Автосозданный</label>
            <select
              className="input"
              value={formData.auto_created ? "true" : "false"}
              onChange={(e) => setFormData({ ...formData, auto_created: e.target.value === "true" })}
            >
              <option value="false">Нет</option>
              <option value="true">Да</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Нужна модерация</label>
            <select
              className="input"
              value={formData.needs_moderation ? "true" : "false"}
              onChange={(e) => setFormData({ ...formData, needs_moderation: e.target.value === "true" })}
            >
              <option value="false">Нет</option>
              <option value="true">Да</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Создан пользователем (ID)</label>
            <input
              type="text"
              className="input"
              value={formData.created_by_user_id}
              readOnly
            />
          </div>
        </div>

        {editingProduct && (
          <div style={{
            marginTop: 'var(--spacing-lg)',
            borderTop: '1px solid var(--border-light)',
            paddingTop: 'var(--spacing-lg)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>
              Объединить с другим продуктом
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Используйте, если продукт создан автоматически или нужно объединить дубликаты.
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="Поиск продукта для объединения"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
              />
              <button className="btn btn-secondary" onClick={handleMergeSearch} disabled={mergeLoading}>
                {mergeLoading ? "Поиск..." : "Найти"}
              </button>
            </div>
            {mergeResults.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--spacing-sm)',
              }}>
                {mergeResults.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: 'var(--spacing-sm)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.canonical_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.category || "other"}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: '8px', width: '100%' }}
                      onClick={() => handleMergeProduct(item.id)}
                    >
                      Объединить
                    </button>
                  </div>
                ))}
              </div>
            )}
            {mergeStatus && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {mergeStatus}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={handleSaveProduct}
            style={{ flex: 1 }}
          >
            {editingProduct ? "Сохранить" : "Создать"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              closeAddModal();
            }}
            style={{ flex: 1 }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const activeImportCategory = importCategory || selectedCategory;
  const uniqueExclude = Array.from(new Set(excludeNames.map((name) => name.toLowerCase()))).map(
    (name) => excludeNames.find((value) => value.toLowerCase() === name) as string
  );
  const cappedExclude = uniqueExclude.slice(0, 60);
  const importPrompt = buildImportPrompt(activeImportCategory, cappedExclude);

  const importModal = showImportModal ? (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowImportModal(false);
        }
      }}
    >
      <div
        className="modal animate-slide-up"
        style={{
          maxWidth: '760px',
        }}
      >
        <h2 className="modal-header">Импорт продуктов</h2>

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
            Скопируйте и используйте в чате. Ответ — JSON массив объектов с полями.
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
          {excludeLoading && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Загружаю список для исключения...
            </div>
          )}
          {!excludeLoading && uniqueExclude.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Исключаем уже существующие продукты: {uniqueExclude.length} (в промпте показаны первые {cappedExclude.length})
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <label className="form-label">Категория для импорта</label>
          <select
            className="input"
            value={importCategory || "other"}
            onChange={(e) => setImportCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <label className="form-label">Вставьте список продуктов</label>
          <textarea
            className="input"
            rows={8}
            placeholder="Каждый продукт с новой строки. Можно вставить JSON-массив."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <label className="form-label">Или загрузите файл (.txt / .csv / .json)</label>
          <input
            type="file"
            accept=".txt,.csv,.json"
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
          <button className="btn btn-primary" onClick={handleImportSubmit} style={{ flex: 1 }}>
            Импортировать
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowImportModal(false)}
            style={{ flex: 1 }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        fontSize: '18px',
        color: 'var(--text-secondary)',
      }}>
        Загрузка продуктов...
      </div>
    );
  }

  // Category view
  if (selectedCategory) {
    const category = categories.find((c) => c.id === selectedCategory);
    if (!category) {
      closeCategory();
      return null;
    }

    return (
      <div>
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <span onClick={closeCategory} style={{ cursor: 'pointer' }}>🥗 Продукты</span>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {category.icon} {category.name}
          </span>
        </div>

        {/* Header */}
        <div className="section-header" style={{ marginTop: 'var(--spacing-lg)' }}>
          <h1 className="section-title">
            {category.icon} {category.name}
          </h1>
          <p className="section-subtitle">
            {totalCount !== null ? `${searchedProducts.length} из ${totalCount}` : `${searchedProducts.length}`} продуктов
          </p>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-xl)',
          flexWrap: 'wrap',
        }}>
          <input
            type="text"
            className="input-large"
            placeholder="🔍 Поиск продукта..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, maxWidth: '400px' }}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            flexWrap: 'wrap',
          }}>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={onlyAutoCreated}
                onChange={(e) => setOnlyAutoCreated(e.target.checked)}
              />
              Автосозданные
            </label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={onlyNeedsModeration}
                onChange={(e) => setOnlyNeedsModeration(e.target.checked)}
              />
              Нужна модерация
            </label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={onlyUserCreated}
                onChange={(e) => setOnlyUserCreated(e.target.checked)}
              />
              Пользовательские
            </label>
          </div>
          <button
            className="btn-large btn-primary"
            onClick={() => openAddModal(selectedCategory)}
          >
            <span style={{ fontSize: '20px' }}>+</span>
            Добавить продукт
          </button>
          <button
            className="btn-large btn-secondary"
            onClick={() => openImportModal(selectedCategory)}
          >
            Импорт списка
          </button>
          <button
            className="btn-large btn-secondary"
            onClick={handleAutoIcons}
            disabled={iconLoading}
          >
            {iconLoading ? "Иконки..." : "Авто-иконки"}
          </button>
          <button
            className="btn-large btn-secondary"
            onClick={closeCategory}
          >
            ← Назад
          </button>
        </div>

        {/* Products Grid */}
        <div className="folder-grid">
          {searchedProducts.map((product) => (
            <div
              key={product.id}
              className="folder-card animate-slide-in"
              onClick={() => {
                void loadProductForEdit(product.id);
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-md)',
              }}>
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.canonical_name}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      objectFit: 'cover',
                      background: 'var(--bg-page)',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '48px' }}>
                    {product.icon}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}>
                    {product.canonical_name}
                  </h3>
                  {(product.auto_created || product.needs_moderation || product.created_by_user_id) && (
                    <div style={{
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap',
                      marginBottom: '4px',
                    }}>
                      {product.auto_created && (
                        <span className="badge badge-primary">Авто</span>
                      )}
                      {product.needs_moderation && (
                        <span className="badge badge-secondary">Модерация</span>
                      )}
                      {product.created_by_user_id && (
                        <span className="badge badge-success">Пользователь</span>
                      )}
                    </div>
                  )}
                  {product.calories && (
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}>
                      {product.calories} ккал / 100{product.preferred_unit || 'г'}
                    </p>
                  )}
                </div>
              </div>

              {(product.protein || product.fat || product.carbohydrates) && (
                <div style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: 'var(--spacing-sm)',
                }}>
                  {product.protein && <span>Б: {product.protein}г</span>}
                  {product.fat && <span>Ж: {product.fat}г</span>}
                  {product.carbohydrates && <span>У: {product.carbohydrates}г</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {listLoading && (
          <div style={{
            textAlign: 'center',
            padding: 'var(--spacing-lg)',
            color: 'var(--text-secondary)',
          }}>
            Загрузка...
          </div>
        )}

        {!listLoading && hasMore && (
          <div style={{ textAlign: 'center', marginTop: 'var(--spacing-lg)' }}>
            <button
              className="btn-large btn-secondary"
              onClick={() => loadCategoryProducts(page + 1)}
            >
              Загрузить ещё
            </button>
          </div>
        )}

        {!listLoading && searchedProducts.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 'var(--spacing-3xl)',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--border-medium)',
          }}>
            <div style={{ fontSize: '64px', marginBottom: 'var(--spacing-lg)' }}>{category.icon}</div>
            <p style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: 'var(--spacing-sm)' }}>
              {searchTerm ? "Продукты не найдены" : "Нет продуктов в этой категории"}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
              {searchTerm ? "Попробуйте изменить поисковый запрос" : "Добавьте первый продукт в категорию"}
            </p>
            {!searchTerm && (
              <button
                className="btn-large btn-primary"
                onClick={() => openAddModal(selectedCategory)}
              >
                <span style={{ fontSize: '20px' }}>+</span>
                Добавить продукт
              </button>
            )}
          </div>
        )}
        {modal}
        {importModal}
      </div>
    );
  }

  // Categories overview
  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h1 className="section-title">🥗 Справочник продуктов</h1>
        <p className="section-subtitle">Выберите категорию для просмотра продуктов</p>
      </div>

      {/* Add Button */}
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <button
          className="btn-large btn-primary"
          onClick={() => openAddModal()}
        >
          <span style={{ fontSize: '20px' }}>+</span>
          Добавить продукт
        </button>
        <button
          className="btn-large btn-secondary"
          onClick={() => openImportModal()}
          style={{ marginLeft: 'var(--spacing-md)' }}
        >
          Импорт списка
        </button>
        <button
          className="btn-large btn-secondary"
          onClick={handleAutoIcons}
          disabled={iconLoading}
          style={{ marginLeft: 'var(--spacing-md)' }}
        >
          {iconLoading ? "Иконки..." : "Авто-иконки"}
        </button>
      </div>
      {iconStatus && (
        <div style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          {iconStatus}
        </div>
      )}

      {/* Category Grid */}
      <div className="folder-grid">
        {categoryWithProducts.map((category) => (
          <div
            key={category.id}
            className="folder-card animate-slide-in"
            onClick={() => openCategory(category.id)}
            style={{
              borderLeftWidth: '4px',
              borderLeftColor: category.color,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-md)',
            }}>
              <div style={{ fontSize: '48px' }}>
                {category.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}>
                  {category.name}
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                }}>
                  {category.count} продуктов
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal}
      {importModal}
    </div>
  );
}
