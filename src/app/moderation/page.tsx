"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type RecipeSource = {
  id: string;
  title: string;
  sourceUrl?: string;
};

type ModerationTask = {
  id: string;
  task_type: "link_suggestion" | "merge_suggestion" | "new_product";
  product_id: string | null;
  suggested_action: Record<string, unknown>;
  confidence: number;
  status: string;
  created_at: string;
  productInfo?: {
    id: string;
    canonical_name: string;
    display_name?: string;
    category?: string;
    icon?: string;
  } | null;
  suggestedProductInfo?: {
    id: string;
    canonical_name: string;
    display_name?: string;
    category?: string;
    icon?: string;
  } | null;
  matchedProductInfo?: {
    id: string;
    canonical_name: string;
    display_name?: string;
    category?: string;
    icon?: string;
  } | null;
  productRecipeSource?: RecipeSource | null;
  matchedRecipeSource?: RecipeSource | null;
};

type MissingItem = {
  name: string;
  count: number;
  recipeTitles: string[];
};

type IncompleteProduct = {
  id: string;
  canonical_name: string;
  category?: string;
  icon?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrates?: number;
  description?: string;
  completeness: number;
  missingFields: string[];
};

type ProductCandidate = {
  id: string;
  canonical_name: string;
  icon?: string;
  image_url?: string;
  category?: string;
};

type Stats = {
  pendingTasks: number;
  pendingProducts: number;
  totalProducts: number;
  autoApprovedToday: number;
  tasksByType: Record<string, number>;
  reviewedLastWeek: number;
  approvedLastWeek: number;
  approvalRate: number;
};

type TabType = "link_suggestion" | "merge_suggestion" | "new_product" | "all" | "unlinked" | "incomplete" | "user_products";

type UserProduct = {
  id: string;
  canonical_name: string;
  category?: string;
  icon?: string;
  synonyms?: string[];
  calories?: number;
  auto_created?: boolean;
};

const categories = [
  { id: "grains", name: "Сыпучие", icon: "🌾" },
  { id: "meat", name: "Мясное", icon: "🥩" },
  { id: "dairy", name: "Молочка", icon: "🥛" },
  { id: "vegetables", name: "Овощи", icon: "🥕" },
  { id: "fruits", name: "Фрукты", icon: "🍎" },
  { id: "bakery", name: "Хлебобулочные", icon: "🍞" },
  { id: "fish", name: "Рыба", icon: "🐟" },
  { id: "frozen", name: "Замороженное", icon: "❄️" },
  { id: "drinks", name: "Напитки", icon: "🥤" },
  { id: "spices", name: "Специи", icon: "🌶️" },
  { id: "canned", name: "Консервы", icon: "🥫" },
  { id: "snacks", name: "Снеки", icon: "🍿" },
  { id: "other", name: "Прочее", icon: "📦" },
];

export default function ModerationPage() {
  const [tasks, setTasks] = useState<ModerationTask[]>([]);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [incompleteProducts, setIncompleteProducts] = useState<IncompleteProduct[]>([]);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [runningNormalization, setRunningNormalization] = useState(false);
  const [normalizationResult, setNormalizationResult] = useState<string | null>(null);

  // Link modal state
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);

  // Create product modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForIngredient, setCreateForIngredient] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    canonical_name: "",
    category: "other",
    icon: "📦",
    calories: "",
    protein: "",
    fat: "",
    carbohydrates: "",
    description: "",
  });
  const [createStatus, setCreateStatus] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // User products (needs_moderation) state
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [userProductsCount, setUserProductsCount] = useState(0);
  const [userProductsBusy, setUserProductsBusy] = useState<Record<string, boolean>>({});
  const [userMerge, setUserMerge] = useState<{ productId: string; search: string; results: UserProduct[]; searching: boolean } | null>(null);

  // AI batch fill state
  const [aiFillLoading, setAiFillLoading] = useState(false);
  const [aiFillStatus, setAiFillStatus] = useState("");
  const [selectedForAiFill, setSelectedForAiFill] = useState<Set<string>>(new Set());

  // Cache: track which tabs have already been loaded to avoid re-fetching on tab switch
  const loadedTabsRef = useRef(new Set<TabType>());

  const loadUserProducts = useCallback(async (force = false) => {
    if (activeTab !== "user_products") return;
    if (!force && loadedTabsRef.current.has("user_products")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products?needs_moderation=1&limit=100");
      const data = await res.json();
      setUserProducts(data.data ?? []);
      setUserProductsCount(data.count ?? 0);
      loadedTabsRef.current.add("user_products");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadTasks = useCallback(async (force = false) => {
    if (activeTab === "unlinked" || activeTab === "incomplete" || activeTab === "user_products") return;
    if (!force && loadedTabsRef.current.has(activeTab)) return;
    setLoading(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      params.set("status", "pending");
      if (activeTab !== "all") {
        params.set("type", activeTab);
      }

      const response = await fetch(`/api/admin/moderation?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось загрузить задачи"}`);
        setTasks([]);
        return;
      }

      setTasks(result.tasks || []);
      loadedTabsRef.current.add(activeTab);
    } catch {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadMissing = useCallback(async (force = false) => {
    if (activeTab !== "unlinked") return;
    if (!force && loadedTabsRef.current.has("unlinked")) return;
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/ingredients/missing");
      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось загрузить список"}`);
        setMissingItems([]);
        return;
      }
      setMissingItems(result.items || []);
      loadedTabsRef.current.add("unlinked");
    } catch {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadIncomplete = useCallback(async (force = false) => {
    if (activeTab !== "incomplete") return;
    if (!force && loadedTabsRef.current.has("incomplete")) return;
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/products/incomplete?limit=100");
      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось загрузить список"}`);
        setIncompleteProducts([]);
        return;
      }
      setIncompleteProducts(result.data || []);
      setIncompleteCount(result.count || 0);
      loadedTabsRef.current.add("incomplete");
    } catch {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/moderation/stats");
      const result = await response.json();
      if (response.ok) {
        setStats(result.stats);
      }
    } catch {
      // Silently ignore stats errors
    }
  }, []);

  useEffect(() => {
    if (activeTab === "unlinked") {
      void loadMissing();
    } else if (activeTab === "incomplete") {
      void loadIncomplete();
    } else if (activeTab === "user_products") {
      void loadUserProducts();
    } else {
      void loadTasks();
    }
    void loadStats();
  }, [loadTasks, loadMissing, loadIncomplete, loadUserProducts, loadStats, activeTab]);

  async function handleAction(taskId: string, action: "approve" | "reject" | "skip") {
    setStatus(`Обработка...`);
    try {
      const response = await fetch("/api/admin/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });

      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error}`);
        return;
      }

      setStatus(`Задача ${action === "approve" ? "одобрена" : action === "reject" ? "отклонена" : "пропущена"}`);
      await loadTasks(true);
      await loadStats();
    } catch {
      setStatus("Ошибка: не удалось выполнить действие");
    }
  }

  async function handleMerge(primaryId: string, mergeId: string) {
    setStatus("Объединение продуктов...");
    try {
      const response = await fetch("/api/admin/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, mergeIds: [mergeId] }),
      });

      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error}`);
        return;
      }

      setStatus(`Объединено! Обновлено ингредиентов: ${result.ingredientsUpdated}`);
      await loadTasks(true);
      await loadStats();
    } catch {
      setStatus("Ошибка: не удалось объединить");
    }
  }

  async function handleLink(name: string, productId: string) {
    setStatus(`Связываю "${name}"...`);
    try {
      const response = await fetch("/api/admin/ingredients/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, productId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось связать"}`);
        return;
      }
      setStatus(`Готово! Обновлено рецептов: ${result.updated || 0}`);
      setLinkTarget(null);
      await loadMissing(true);
      await loadStats();
    } catch {
      setStatus("Ошибка: не удалось подключиться");
    }
  }

  async function loadCandidates(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      setCandidates([]);
      return;
    }
    setCandidateLoading(true);
    setCandidateStatus("");
    try {
      const params = new URLSearchParams();
      params.set("search", trimmed);
      params.set("limit", "50");
      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        setCandidateStatus(`Ошибка: ${result.error || "не удалось загрузить"}`);
        setCandidates([]);
        return;
      }
      setCandidates(result.data || []);
      if ((result.data || []).length === 0) {
        setCandidateStatus("Ничего не найдено");
      }
    } catch {
      setCandidateStatus("Ошибка: не удалось подключиться");
      setCandidates([]);
    } finally {
      setCandidateLoading(false);
    }
  }

  function openLinkModal(name: string) {
    setLinkTarget(name);
    setCandidateQuery(name);
    setCandidates([]);
    setCandidateStatus("");
    void loadCandidates(name);
  }

  function openCreateModal(ingredientName?: string) {
    setCreateForIngredient(ingredientName || null);
    setCreateForm({
      canonical_name: ingredientName || "",
      category: "other",
      icon: "📦",
      calories: "",
      protein: "",
      fat: "",
      carbohydrates: "",
      description: "",
    });
    setCreateStatus("");
    setShowCreateModal(true);
  }

  async function handleAiFill() {
    if (!createForm.canonical_name.trim()) {
      setCreateStatus("Введите название продукта");
      return;
    }
    setAiLoading(true);
    setCreateStatus("AI заполняет поля...");
    try {
      const response = await fetch("/api/admin/ai/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: createForm.canonical_name }),
      });
      const result = await response.json();
      if (!response.ok) {
        setCreateStatus(`Ошибка AI: ${result.error || "не удалось получить данные"}`);
        return;
      }
      const data = result.data || {};
      setCreateForm((prev) => ({
        ...prev,
        category: data.category || prev.category,
        calories: data.calories?.toString() || prev.calories,
        protein: data.protein?.toString() || prev.protein,
        fat: data.fat?.toString() || prev.fat,
        carbohydrates: data.carbohydrates?.toString() || prev.carbohydrates,
        description: data.description || prev.description,
      }));
      setCreateStatus("Поля заполнены");
    } catch {
      setCreateStatus("Ошибка AI: не удалось подключиться");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCreateProduct() {
    if (!createForm.canonical_name.trim()) {
      setCreateStatus("Введите название продукта");
      return;
    }
    setCreateStatus("Создание продукта...");
    try {
      const payload = {
        id: crypto.randomUUID(),
        canonical_name: createForm.canonical_name.trim(),
        category: createForm.category,
        icon: createForm.icon,
        calories: createForm.calories ? parseFloat(createForm.calories) : null,
        protein: createForm.protein ? parseFloat(createForm.protein) : null,
        fat: createForm.fat ? parseFloat(createForm.fat) : null,
        carbohydrates: createForm.carbohydrates ? parseFloat(createForm.carbohydrates) : null,
        description: createForm.description || null,
      };

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setCreateStatus(`Ошибка: ${result.error}`);
        return;
      }

      const savedId = result?.data?.id || (Array.isArray(result?.data) ? result.data[0]?.id : null) || payload.id;

      // If created from ingredient, link it
      if (createForIngredient) {
        await fetch("/api/admin/ingredients/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: createForIngredient, productId: savedId }),
        });
      }

      setShowCreateModal(false);
      setCreateForIngredient(null);
      setCreateStatus("");
      setStatus(`Продукт "${createForm.canonical_name}" создан`);
      if (activeTab === "unlinked") {
        await loadMissing(true);
      }
      await loadStats();
    } catch {
      setCreateStatus("Ошибка: не удалось создать продукт");
    }
  }

  async function runNormalization() {
    setRunningNormalization(true);
    setNormalizationResult(null);
    setStatus("Запуск автоматической нормализации...");

    try {
      const response = await fetch("/api/cron/normalize-ingredients", {
        method: "POST",
      });

      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error}`);
        setRunningNormalization(false);
        return;
      }

      setNormalizationResult(
        `Нормализация завершена за ${result.duration_ms}мс:\n` +
        `• Найдено несвязанных: ${result.unlinked_found}\n` +
        `• Авто-связано: ${result.auto_linked}\n` +
        `• На проверку: ${result.suggested_for_review}\n` +
        `• Найдено дубликатов: ${result.duplicates_found}`
      );
      setStatus("");
      await loadTasks(true);
      await loadStats();
    } catch {
      setStatus("Ошибка: не удалось запустить нормализацию");
    } finally {
      setRunningNormalization(false);
    }
  }

  async function handleBatchAiFill() {
    const ids = Array.from(selectedForAiFill);
    if (ids.length === 0) {
      setAiFillStatus("Выберите продукты для заполнения");
      return;
    }
    setAiFillLoading(true);
    setAiFillStatus(`Заполнение ${ids.length} продуктов...`);
    try {
      const response = await fetch("/api/admin/products/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAiFillStatus(`Ошибка: ${result.error}`);
        return;
      }
      setAiFillStatus(`Заполнено ${result.updated} из ${result.processed} продуктов (${result.totalFieldsUpdated} полей)`);
      setSelectedForAiFill(new Set());
      await loadIncomplete(true);
    } catch {
      setAiFillStatus("Ошибка: не удалось заполнить");
    } finally {
      setAiFillLoading(false);
    }
  }

  function toggleSelectAll() {
    if (selectedForAiFill.size === incompleteProducts.length) {
      setSelectedForAiFill(new Set());
    } else {
      setSelectedForAiFill(new Set(incompleteProducts.map((p) => p.id)));
    }
  }

  function toggleSelectProduct(id: string) {
    const next = new Set(selectedForAiFill);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedForAiFill(next);
  }

  async function approveUserProduct(id: string) {
    setUserProductsBusy((p) => ({ ...p, [id]: true }));
    await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    setUserProducts((ps) => ps.filter((p) => p.id !== id));
    setUserProductsCount((c) => c - 1);
    setUserProductsBusy((p) => ({ ...p, [id]: false }));
  }

  async function deleteUserProduct(id: string) {
    if (!confirm("Удалить продукт?")) return;
    setUserProductsBusy((p) => ({ ...p, [id]: true }));
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    setUserProducts((ps) => ps.filter((p) => p.id !== id));
    setUserProductsCount((c) => c - 1);
    setUserProductsBusy((p) => ({ ...p, [id]: false }));
  }

  async function searchMergeProducts(search: string) {
    if (!userMerge) return;
    setUserMerge((m) => m ? { ...m, search, searching: true, results: [] } : null);
    const res = await fetch(`/api/admin/products?search=${encodeURIComponent(search)}&include_synonyms=1&limit=10`);
    const data = await res.json();
    setUserMerge((m) => m ? { ...m, results: data.data ?? [], searching: false } : null);
  }

  async function doUserMerge(primaryId: string) {
    if (!userMerge) return;
    setUserProductsBusy((p) => ({ ...p, [userMerge.productId]: true }));
    await fetch("/api/admin/products/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId, mergeIds: [userMerge.productId] }),
    });
    setUserProducts((ps) => ps.filter((p) => p.id !== userMerge.productId));
    setUserProductsCount((c) => c - 1);
    setUserMerge(null);
    setUserProductsBusy((p) => ({ ...p, [userMerge.productId]: false }));
  }

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "user_products", label: "Новые от пользователей", count: userProductsCount || undefined },
    { key: "all", label: "AI задачи", count: stats?.pendingTasks },
    { key: "link_suggestion", label: "Связывание", count: stats?.tasksByType?.link_suggestion },
    { key: "merge_suggestion", label: "Дубликаты", count: stats?.tasksByType?.merge_suggestion },
    { key: "new_product", label: "Новые (AI)", count: stats?.tasksByType?.new_product },
    { key: "unlinked", label: "Несвязанные", count: missingItems.length || undefined },
    { key: "incomplete", label: "Незаполненные", count: incompleteCount || undefined },
  ];

  function getTaskTypeIcon(type: string): string {
    switch (type) {
      case "link_suggestion": return "🔗";
      case "merge_suggestion": return "🔀";
      case "new_product": return "✨";
      default: return "📋";
    }
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return "var(--success)";
    if (confidence >= 0.7) return "var(--warning)";
    return "var(--error)";
  }

  function getMissingFieldLabel(field: string): string {
    switch (field) {
      case "calories": return "калории";
      case "protein": return "белки";
      case "fat": return "жиры";
      case "carbohydrates": return "углеводы";
      case "description": return "описание";
      default: return field;
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📋 Модерация продуктов</h1>
        <p className="section-subtitle">Проверка, связывание ингредиентов, объединение дубликатов, заполнение данных</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--spacing-md)",
          marginBottom: "var(--spacing-xl)",
        }}>
          <div className="stat-card">
            <div className="stat-value">{stats.pendingTasks}</div>
            <div className="stat-label">Задач на проверку</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalProducts}</div>
            <div className="stat-label">Всего продуктов</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.autoApprovedToday}</div>
            <div className="stat-label">Авто-одобрено сегодня</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.approvalRate}%</div>
            <div className="stat-label">Одобрено за неделю</div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: "flex",
        gap: "var(--spacing-md)",
        flexWrap: "wrap",
        marginBottom: "var(--spacing-xl)",
      }}>
        <button
          className="btn-large btn-primary"
          onClick={runNormalization}
          disabled={runningNormalization}
        >
          {runningNormalization ? "⏳ Нормализация..." : "🔄 Запустить нормализацию"}
        </button>
        <button className="btn-large btn-secondary" onClick={() => {
          if (activeTab === "user_products") void loadUserProducts(true);
          else if (activeTab === "unlinked") void loadMissing(true);
          else if (activeTab === "incomplete") void loadIncomplete(true);
          else void loadTasks(true);
          void loadStats();
        }}>
          Обновить список
        </button>
        {activeTab === "unlinked" && (
          <button className="btn-large btn-secondary" onClick={() => openCreateModal()}>
            ➕ Создать продукт
          </button>
        )}
      </div>

      {/* Normalization Result */}
      {normalizationResult && (
        <div style={{
          background: "var(--bg-surface)",
          padding: "var(--spacing-lg)",
          borderRadius: "var(--radius-lg)",
          marginBottom: "var(--spacing-xl)",
          whiteSpace: "pre-line",
          border: "1px solid var(--success)",
        }}>
          {normalizationResult}
        </div>
      )}

      {status && (
        <div style={{
          marginBottom: "var(--spacing-lg)",
          color: status.includes("Ошибка") ? "var(--error)" : "var(--text-secondary)",
          fontSize: "12px",
        }}>
          {status}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "var(--spacing-sm)",
        marginBottom: "var(--spacing-lg)",
        borderBottom: "1px solid var(--border-light)",
        paddingBottom: "var(--spacing-sm)",
        flexWrap: "wrap",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              background: activeTab === tab.key ? "var(--bg-surface)" : "transparent",
              border: activeTab === tab.key ? "1px solid var(--border-light)" : "1px solid transparent",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                marginLeft: "6px",
                background: "var(--accent)",
                color: "white",
                padding: "2px 6px",
                borderRadius: "10px",
                fontSize: "11px",
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Description */}
      {(() => {
        const descriptions: Partial<Record<TabType, { title: string; text: string }>> = {
          user_products: {
            title: "Продукты, созданные пользователями",
            text: "Когда пользователь вводит ингредиент, которого нет в базе, приложение создаёт его автоматически и помечает флагом «требует проверки». Одобрите продукт, объедините его с уже существующим (если это дубликат) или удалите.",
          },
          all: {
            title: "Все AI-задачи",
            text: "После нормализации AI анализирует ингредиенты рецептов и создаёт задачи трёх типов: связать ингредиент с продуктом, объединить возможные дубликаты, подтвердить новый продукт. Здесь отображаются все задачи сразу.",
          },
          link_suggestion: {
            title: "Связывание ингредиентов",
            text: "AI нашёл ингредиент в рецепте, который ещё не привязан к продукту в справочнике, и предлагает конкретный продукт. Одобрите — и ингредиент будет автоматически сопоставляться с этим продуктом при поиске.",
          },
          merge_suggestion: {
            title: "Возможные дубликаты",
            text: "AI обнаружил два продукта, которые могут быть одним и тем же (например «Куриное филе» и «Филе курицы»). При объединении один продукт становится синонимом другого, все ссылки из рецептов и кладовки переносятся автоматически.",
          },
          new_product: {
            title: "Новые продукты от AI",
            text: "AI предлагает добавить новый продукт, который часто встречается в рецептах, но отсутствует в справочнике. Одобрите — продукт появится в базе и станет доступен для связывания с ингредиентами.",
          },
          unlinked: {
            title: "Несвязанные ингредиенты",
            text: "Ингредиенты из рецептов, которые не удалось сопоставить ни с одним продуктом в справочнике. Найдите подходящий продукт и свяжите вручную, либо создайте новый продукт прямо здесь.",
          },
          incomplete: {
            title: "Незаполненные продукты",
            text: "Продукты в справочнике, у которых нет КБЖУ или описания. Выберите один или несколько и нажмите «AI заполнить» — система автоматически подберёт данные.",
          },
        };
        const desc = descriptions[activeTab];
        if (!desc) return null;
        return (
          <div style={{
            padding: "10px 14px",
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
            marginBottom: "var(--spacing-lg)",
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: "1.5",
          }}>
            <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: 3 }}>{desc.title}</strong>
            {desc.text}
          </div>
        );
      })()}

      {/* Content based on active tab */}
      {loading ? (
        <div style={{ padding: "var(--spacing-lg)", color: "var(--text-secondary)" }}>
          Загрузка...
        </div>
      ) : activeTab === "user_products" ? (
        /* User-created products needing moderation */
        userProducts.length === 0 ? (
          <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)" }}>
            🎉 Нет продуктов, требующих модерации
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={async () => {
                if (!confirm(`Одобрить все ${userProducts.length} продуктов?`)) return;
                for (const p of userProducts) {
                  await fetch(`/api/admin/products/${p.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ approve: true }),
                  });
                }
                setUserProducts([]);
                setUserProductsCount(0);
              }}>
                ✓ Одобрить все ({userProducts.length})
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {userProducts.map((product) => (
                <div key={product.id} style={{
                  background: "var(--bg-surface)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)", padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 14,
                  opacity: userProductsBusy[product.id] ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: 26, flexShrink: 0, width: 34, textAlign: "center" }}>{product.icon || "📦"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{product.canonical_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {product.category || "other"}
                      {product.synonyms?.length ? ` · ${product.synonyms.slice(0, 3).join(", ")}` : ""}
                      {product.calories ? ` · ${Math.round(product.calories)} ккал` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => approveUserProduct(product.id)} disabled={!!userProductsBusy[product.id]} title="Одобрить"
                      style={{ width: 30, height: 30, borderRadius: 6, background: "#34c759", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>✓</button>
                    <button onClick={() => setUserMerge({ productId: product.id, search: product.canonical_name, results: [], searching: false })} disabled={!!userProductsBusy[product.id]} title="Объединить"
                      style={{ width: 30, height: 30, borderRadius: 6, background: "#007aff", color: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}>⇄</button>
                    <button onClick={() => deleteUserProduct(product.id)} disabled={!!userProductsBusy[product.id]} title="Удалить"
                      style={{ width: 30, height: 30, borderRadius: 6, background: "#ff3b30", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : activeTab === "unlinked" ? (
        /* Unlinked ingredients tab */
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          overflow: "hidden",
        }}>
          {missingItems.length === 0 ? (
            <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--text-secondary)" }}>
              🎉 Все ингредиенты связаны с продуктами
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ингредиент</th>
                  <th>Встречается</th>
                  <th>Рецепты (пример)</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {missingItems.map((item) => (
                  <tr key={item.name}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>{item.count}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                      {item.recipeTitles.join(", ")}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => openCreateModal(item.name)}
                        >
                          Создать
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => openLinkModal(item.name)}
                        >
                          Связать
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : activeTab === "incomplete" ? (
        /* Incomplete products tab */
        <div>
          {/* AI Fill Controls */}
          <div style={{
            display: "flex",
            gap: "var(--spacing-md)",
            alignItems: "center",
            marginBottom: "var(--spacing-lg)",
            flexWrap: "wrap",
          }}>
            <button
              className="btn btn-secondary"
              onClick={toggleSelectAll}
            >
              {selectedForAiFill.size === incompleteProducts.length ? "Снять выделение" : "Выбрать все"}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleBatchAiFill}
              disabled={aiFillLoading || selectedForAiFill.size === 0}
            >
              {aiFillLoading ? "⏳ Заполнение..." : `🤖 AI заполнить (${selectedForAiFill.size})`}
            </button>
            {aiFillStatus && (
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {aiFillStatus}
              </span>
            )}
          </div>

          <div style={{
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            overflow: "hidden",
          }}>
            {incompleteProducts.length === 0 ? (
              <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--text-secondary)" }}>
                🎉 Все продукты заполнены
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}></th>
                    <th>Продукт</th>
                    <th>Категория</th>
                    <th>Заполнено</th>
                    <th>Отсутствует</th>
                  </tr>
                </thead>
                <tbody>
                  {incompleteProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedForAiFill.has(product.id)}
                          onChange={() => toggleSelectProduct(product.id)}
                        />
                      </td>
                      <td>
                        <span style={{ marginRight: "6px" }}>{product.icon || "📦"}</span>
                        {product.canonical_name}
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                        {product.category || "other"}
                      </td>
                      <td>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}>
                          <div style={{
                            width: "60px",
                            height: "6px",
                            background: "var(--bg-page)",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${product.completeness}%`,
                              height: "100%",
                              background: product.completeness >= 80 ? "var(--success)" : product.completeness >= 40 ? "var(--warning)" : "var(--error)",
                            }} />
                          </div>
                          <span style={{ fontSize: "12px" }}>{product.completeness}%</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                        {product.missingFields.map(getMissingFieldLabel).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div style={{
          padding: "var(--spacing-xl)",
          textAlign: "center",
          color: "var(--text-secondary)",
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
        }}>
          🎉 Нет задач на модерацию
        </div>
      ) : (
        /* Tasks List */
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-light)",
                padding: "var(--spacing-lg)",
              }}
            >
              {/* Header */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "var(--spacing-md)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                  <span style={{ fontSize: "20px" }}>{getTaskTypeIcon(task.task_type)}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {task.task_type === "link_suggestion" && "Связывание ингредиента"}
                      {task.task_type === "merge_suggestion" && "Возможный дубликат"}
                      {task.task_type === "new_product" && "Новый продукт"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {new Date(task.created_at).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-sm)",
                  padding: "4px 8px",
                  background: `${getConfidenceColor(task.confidence)}20`,
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: getConfidenceColor(task.confidence),
                }}>
                  {Math.round(task.confidence * 100)}%
                </div>
              </div>

              {/* Content based on task type */}
              {task.task_type === "link_suggestion" && (
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Ингредиент:</span>{" "}
                    <strong>{task.suggested_action?.ingredientName as string}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>→</span>
                    <span>
                      {task.suggestedProductInfo?.icon || "📦"}{" "}
                      {task.suggestedProductInfo?.canonical_name || task.suggested_action?.suggestedProductName as string}
                    </span>
                    {task.suggestedProductInfo?.category && (
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        background: "var(--bg-page)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-secondary)",
                      }}>
                        {task.suggestedProductInfo.category}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {task.task_type === "merge_suggestion" && (
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  {!task.productInfo || !task.matchedProductInfo ? (
                    <div style={{
                      padding: "var(--spacing-md)",
                      background: "var(--error)10",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--error)",
                      color: "var(--error)",
                      textAlign: "center",
                    }}>
                      ⚠️ Один из продуктов был удалён. Задача устарела - отклоните её.
                      <div style={{ marginTop: "var(--spacing-sm)", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {!task.productInfo && `Продукт "${task.suggested_action?.productName}" не найден. `}
                        {!task.matchedProductInfo && `Продукт "${task.suggested_action?.matchedWithName}" не найден.`}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-md)",
                        padding: "var(--spacing-md)",
                        background: "var(--bg-page)",
                        borderRadius: "var(--radius-md)",
                      }}>
                        <div style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: "24px", marginBottom: "4px" }}>
                            {task.productInfo?.icon || "📦"}
                          </div>
                          <div style={{ fontWeight: 600 }}>
                            {task.productInfo?.canonical_name || task.suggested_action?.productName as string}
                          </div>
                          {task.productRecipeSource && (
                            <div style={{ marginTop: "6px" }}>
                              {task.productRecipeSource.sourceUrl ? (
                                <a
                                  href={task.productRecipeSource.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--accent)",
                                    textDecoration: "none",
                                  }}
                                  title={task.productRecipeSource.title}
                                >
                                  📎 {task.productRecipeSource.title.length > 20
                                    ? task.productRecipeSource.title.slice(0, 20) + "..."
                                    : task.productRecipeSource.title}
                                </a>
                              ) : (
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  📎 {task.productRecipeSource.title.length > 20
                                    ? task.productRecipeSource.title.slice(0, 20) + "..."
                                    : task.productRecipeSource.title}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "20px" }}>⟷</div>
                        <div style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: "24px", marginBottom: "4px" }}>
                            {task.matchedProductInfo?.icon || "📦"}
                          </div>
                          <div style={{ fontWeight: 600 }}>
                            {task.matchedProductInfo?.canonical_name || task.suggested_action?.matchedWithName as string}
                          </div>
                          {task.matchedRecipeSource && (
                            <div style={{ marginTop: "6px" }}>
                              {task.matchedRecipeSource.sourceUrl ? (
                                <a
                                  href={task.matchedRecipeSource.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--accent)",
                                    textDecoration: "none",
                                  }}
                                  title={task.matchedRecipeSource.title}
                                >
                                  📎 {task.matchedRecipeSource.title.length > 20
                                    ? task.matchedRecipeSource.title.slice(0, 20) + "..."
                                    : task.matchedRecipeSource.title}
                                </a>
                              ) : (
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  📎 {task.matchedRecipeSource.title.length > 20
                                    ? task.matchedRecipeSource.title.slice(0, 20) + "..."
                                    : task.matchedRecipeSource.title}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{
                        marginTop: "var(--spacing-sm)",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        textAlign: "center",
                      }}>
                        Тип совпадения: {task.suggested_action?.matchType as string}
                      </div>
                    </>
                  )}
                </div>
              )}

              {task.task_type === "new_product" && task.productInfo && (
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                    <span style={{ fontSize: "24px" }}>{task.productInfo.icon || "📦"}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{task.productInfo.canonical_name}</div>
                      {task.productInfo.category && (
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {task.productInfo.category}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{
                display: "flex",
                gap: "var(--spacing-sm)",
                paddingTop: "var(--spacing-md)",
                borderTop: "1px solid var(--border-light)",
                flexWrap: "wrap",
              }}>
                {task.task_type === "merge_suggestion" ? (
                  task.productInfo && task.matchedProductInfo ? (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const primaryId = task.product_id;
                          const mergeId = task.suggested_action?.matchedWithId as string;
                          if (primaryId && mergeId) {
                            void handleMerge(primaryId, mergeId);
                          }
                        }}
                      >
                        🔀 Объединить (оставить первый)
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          const primaryId = task.suggested_action?.matchedWithId as string;
                          const mergeId = task.product_id;
                          if (primaryId && mergeId) {
                            void handleMerge(primaryId, mergeId);
                          }
                        }}
                      >
                        Объединить (оставить второй)
                      </button>
                    </>
                  ) : null
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => void handleAction(task.id, "approve")}
                  >
                    Одобрить
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => void handleAction(task.id, "reject")}
                >
                  Отклонить
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void handleAction(task.id, "skip")}
                >
                  Пропустить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Modal */}
      {linkTarget && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLinkTarget(null);
            }
          }}
        >
          <div
            className="modal animate-slide-up"
            style={{ maxWidth: "720px" }}
          >
            <h2 className="modal-header">Связать ингредиент</h2>
            <div style={{ marginBottom: "var(--spacing-md)", color: "var(--text-secondary)", fontSize: "12px" }}>
              Ингредиент из рецептов: <strong>{linkTarget}</strong>
            </div>
            <div className="form-group" style={{ marginBottom: "var(--spacing-lg)" }}>
              <label className="form-label">Поиск продукта</label>
              <input
                type="text"
                className="input"
                value={candidateQuery}
                onChange={(e) => {
                  setCandidateQuery(e.target.value);
                  void loadCandidates(e.target.value);
                }}
                placeholder="Введите название продукта"
              />
            </div>
            {candidateStatus && (
              <div style={{ marginBottom: "var(--spacing-md)", color: "var(--text-secondary)", fontSize: "12px" }}>
                {candidateStatus}
              </div>
            )}
            {candidateLoading ? (
              <div style={{ padding: "var(--spacing-md)", color: "var(--text-secondary)" }}>
                Поиск...
              </div>
            ) : (
              <div style={{
                maxHeight: "320px",
                overflow: "auto",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
              }}>
                {candidates.length === 0 ? (
                  <div style={{ padding: "var(--spacing-md)", color: "var(--text-secondary)" }}>
                    Нет результатов.
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Продукт</th>
                        <th>Категория</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.canonical_name}
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "6px",
                                  objectFit: "cover",
                                  marginRight: "6px",
                                  verticalAlign: "middle",
                                  background: "var(--bg-page)",
                                }}
                              />
                            ) : (
                              <span style={{ marginRight: "6px" }}>{item.icon || "📦"}</span>
                            )}
                            {item.canonical_name}
                          </td>
                          <td style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                            {item.category || "other"}
                          </td>
                          <td>
                            <button
                              className="btn btn-primary"
                              onClick={async () => {
                                await handleLink(linkTarget, item.id);
                              }}
                            >
                              Связать
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => openCreateModal(linkTarget)}>
                Создать новый продукт
              </button>
              <button className="btn btn-secondary" onClick={() => setLinkTarget(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Products Merge Modal */}
      {userMerge && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setUserMerge(null)}>
          <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", padding: 24, width: 480, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>Объединить с продуктом</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              «{userProducts.find((p) => p.id === userMerge.productId)?.canonical_name}» станет синонимом выбранного
            </p>
            <input type="text" placeholder="Поиск продукта..." defaultValue={userMerge.search} autoFocus
              onChange={(e) => searchMergeProducts(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-main)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto" }}>
              {userMerge.searching && <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" }}>Поиск...</div>}
              {userMerge.results.filter((r) => r.id !== userMerge.productId).map((result) => (
                <button key={result.id} onClick={() => doUserMerge(result.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", marginBottom: 4, textAlign: "left", background: "var(--bg-main)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
                  <span style={{ fontSize: 20 }}>{result.icon || "📦"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{result.canonical_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{result.category}</div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setUserMerge(null)}
              style={{ marginTop: 12, width: "100%", padding: "8px 0", fontSize: 13, background: "none", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-secondary)" }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div
            className="modal animate-slide-up"
            style={{ maxWidth: "600px" }}
          >
            <h2 className="modal-header">
              {createForIngredient ? `Создать продукт: ${createForIngredient}` : "Создать новый продукт"}
            </h2>

            {/* AI Helper */}
            <div style={{
              background: "var(--bg-page)",
              padding: "var(--spacing-md)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--spacing-lg)",
            }}>
              <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center" }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleAiFill}
                  disabled={aiLoading}
                >
                  {aiLoading ? "⏳ Загрузка..." : "🤖 AI заполнить"}
                </button>
                {createStatus && (
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {createStatus}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: "var(--spacing-md)", gridTemplateColumns: "1fr 1fr" }}>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Название *</label>
                <input
                  type="text"
                  className="input"
                  value={createForm.canonical_name}
                  onChange={(e) => setCreateForm({ ...createForm, canonical_name: e.target.value })}
                  placeholder="Например: Маскарпоне"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Категория</label>
                <select
                  className="input"
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
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
                  value={createForm.icon}
                  onChange={(e) => setCreateForm({ ...createForm, icon: e.target.value })}
                  placeholder="📦"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Калории (на 100г)</label>
                <input
                  type="number"
                  className="input"
                  value={createForm.calories}
                  onChange={(e) => setCreateForm({ ...createForm, calories: e.target.value })}
                  placeholder="250"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Белки (г)</label>
                <input
                  type="number"
                  className="input"
                  value={createForm.protein}
                  onChange={(e) => setCreateForm({ ...createForm, protein: e.target.value })}
                  placeholder="4.8"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Жиры (г)</label>
                <input
                  type="number"
                  className="input"
                  value={createForm.fat}
                  onChange={(e) => setCreateForm({ ...createForm, fat: e.target.value })}
                  placeholder="41"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Углеводы (г)</label>
                <input
                  type="number"
                  className="input"
                  value={createForm.carbohydrates}
                  onChange={(e) => setCreateForm({ ...createForm, carbohydrates: e.target.value })}
                  placeholder="3.6"
                />
              </div>

              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Описание</label>
                <textarea
                  className="input"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Итальянский сливочный сыр..."
                  rows={2}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleCreateProduct}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .stat-card {
          background: var(--bg-surface);
          padding: var(--spacing-lg);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-light);
          text-align: center;
        }
        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .stat-label {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
