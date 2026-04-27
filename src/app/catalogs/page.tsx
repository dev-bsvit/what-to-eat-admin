"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FolderOpen,
  Gift,
  Image as ImageIcon,
  LockKeyhole,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  UserRound,
} from "lucide-react";
import {
  CATALOG_DIETARY_OPTIONS,
  CATALOG_GENERAL_TAG_OPTIONS,
  CATALOG_LEVEL_OPTIONS,
  CATALOG_TIME_OPTIONS,
} from "@/lib/catalogRecommendationTags";

interface Cuisine {
  id: string;
  name: string;
  catalog_id?: string | null;
  image_url?: string;
  landing_image_url?: string;
  type?: string | null;
  status?: string | null;
  moderation_status?: string | null;
  recommendation_levels?: string[] | null;
  recommendation_times?: string[] | null;
  recommendation_dietary?: string[] | null;
  recommendation_tags?: string[] | null;
  recipe_count?: number;
  is_user_generated?: boolean;
  owner_id?: string;
}

function toggleValue(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function CheckboxGroup({
  title,
  values,
  options,
  onChange,
}: {
  title: string;
  values: string[];
  options: readonly { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{title}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(toggleValue(values, option.value))}
              style={{
                border: "1px solid",
                borderColor: selected ? "#007aff" : "var(--border-light)",
                background: selected ? "rgba(0,122,255,0.12)" : "var(--bg-surface)",
                color: selected ? "#007aff" : "var(--text-primary)",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TYPE_FILTERS = [
  { value: "all", label: "Все" },
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "gift", label: "Gift" },
  { value: "unlockable", label: "Unlockable" },
] as const;

function getTypeMeta(type?: string | null) {
  switch (type) {
    case "premium":
      return { label: "Premium", icon: LockKeyhole, className: "catalog-chip catalog-chip-premium" };
    case "gift":
      return { label: "Gift", icon: Gift, className: "catalog-chip catalog-chip-gift" };
    case "unlockable":
      return { label: "Unlockable", icon: Unlock, className: "catalog-chip catalog-chip-muted" };
    default:
      return { label: "Free", icon: Sparkles, className: "catalog-chip catalog-chip-free" };
  }
}

export default function CatalogsPage() {
  const router = useRouter();
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideUserGenerated, setHideUserGenerated] = useState(false);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newCuisine, setNewCuisine] = useState({
    id: "",
    name: "",
    image_url: "",
    landing_image_url: "",
    type: "free",
    recommendation_levels: [] as string[],
    recommendation_times: [] as string[],
    recommendation_dietary: [] as string[],
    recommendation_tags: [] as string[],
  });

  useEffect(() => {
    loadCuisines();
  }, []);

  async function loadCuisines() {
    try {
      const [cuisinesRes, recipesRes] = await Promise.all([
        fetch("/api/admin/cuisines"),
        fetch("/api/admin/recipes"),
      ]);

      const cuisinesData = await cuisinesRes.json();
      const recipesData = await recipesRes.json();

      const cuisinesWithCount = (cuisinesData.data || []).map((cuisine: Cuisine) => ({
        ...cuisine,
        recipe_count: (recipesData.data || []).filter((r: any) => r.cuisine_id === cuisine.id).length,
      }));

      setCuisines(cuisinesWithCount);
    } catch (error) {
      console.error("Failed to load cuisines:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCuisine() {
    setCreateError("");
    if (!newCuisine.name) {
      setCreateError("Заполните обязательное поле: название каталога.");
      return;
    }

    const needsRecommendation = newCuisine.type === "premium" || newCuisine.type === "gift";
    if (needsRecommendation && (
      newCuisine.recommendation_levels.length === 0 ||
      newCuisine.recommendation_times.length === 0 ||
      newCuisine.recommendation_tags.length === 0
    )) {
      setCreateError("Для premium/gift каталога выберите уровень, время и общие теги для подарка.");
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        id: newCuisine.id.trim() || null,
        name: newCuisine.name.trim(),
        image_url: newCuisine.image_url.trim() || null,
        landing_image_url: newCuisine.landing_image_url.trim() || null,
        type: newCuisine.type || "free",
        status: "active",
        moderation_status: "approved",
        recommendation_levels: newCuisine.recommendation_levels,
        recommendation_times: newCuisine.recommendation_times,
        recommendation_dietary: newCuisine.recommendation_dietary,
        recommendation_tags: newCuisine.recommendation_tags,
      };

      console.log("Отправка данных:", payload);

      const response = await fetch("/api/admin/cuisines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.ok) {
        const createdId = result.data?.id;
        setShowAddModal(false);
        setCreateError("");
        setNewCuisine({
          id: "",
          name: "",
          image_url: "",
          landing_image_url: "",
          type: "free",
          recommendation_levels: [],
          recommendation_times: [],
          recommendation_dietary: [],
          recommendation_tags: [],
        });
        if (createdId) {
          router.push(`/catalogs/${createdId}`);
        } else {
          loadCuisines();
        }
      } else {
        console.error("Ошибка API:", result);
        setCreateError(result.error || "Не удалось создать каталог.");
      }
    } catch (error) {
      console.error("Failed to create cuisine:", error);
      setCreateError("Ошибка соединения при создании каталога.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteCuisine(cuisineId: string, cuisineName: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent card click

    // Найдем количество рецептов в каталоге
    const cuisine = cuisines.find(c => c.id === cuisineId);
    const recipeCount = cuisine?.recipe_count || 0;

    const confirmMessage = recipeCount > 0
      ? `Вы уверены, что хотите удалить каталог "${cuisineName}"?\n\nВ каталоге ${recipeCount} рецептов. Они также будут удалены!`
      : `Вы уверены, что хотите удалить каталог "${cuisineName}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Сначала удаляем все рецепты из каталога
      if (recipeCount > 0) {
        const recipesResponse = await fetch(`/api/admin/recipes?cuisine_id=${cuisineId}`, {
          method: "DELETE",
        });

        if (!recipesResponse.ok) {
          const error = await recipesResponse.json();
          alert(`Ошибка при удалении рецептов: ${error.error || "Неизвестная ошибка"}`);
          return;
        }
      }

      // Затем удаляем сам каталог
      const response = await fetch(`/api/admin/cuisines?id=${cuisineId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadCuisines();
      } else {
        const error = await response.json();
        alert(`Ошибка при удалении каталога: ${error.error || "Неизвестная ошибка"}`);
      }
    } catch (error) {
      console.error("Failed to delete cuisine:", error);
      alert("Ошибка при удалении каталога");
    }
  }

  function openCuisine(cuisineId: string) {
    router.push(`/catalogs/${cuisineId}`);
  }

  const filteredCuisines = cuisines
    .filter(c => {
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch = !query || [c.name, c.catalog_id, c.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesUserFilter = !hideUserGenerated || !c.is_user_generated;
      const matchesType = typeFilter === "all" || (c.type || "free") === typeFilter;
      return matchesSearch && matchesUserFilter && matchesType;
    });

  const totalRecipes = cuisines.reduce((sum, c) => sum + (c.recipe_count || 0), 0);
  const paidCount = cuisines.filter((c) => c.type === "premium" || c.type === "gift").length;
  const userCount = cuisines.filter((c) => c.is_user_generated).length;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: 'var(--text-secondary)',
      }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div className="catalogs-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="section-header">
          <h1 className="section-title">Каталоги рецептов</h1>
          <p className="section-subtitle">
            Создавайте каталог, заполняйте лендинг через JSON-промпт и проверяйте рецепты в одном месте
          </p>
          <div className="catalog-summary">
            <span><FolderOpen size={14} /> {cuisines.length} каталогов</span>
            <span><BookOpen size={14} /> {totalRecipes} рецептов</span>
            <span><LockKeyhole size={14} /> {paidCount} платных/подарочных</span>
            <span><UserRound size={14} /> {userCount} пользовательских</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} />
          Создать каталог
        </button>
      </div>

      {/* Search and Filters */}
      <div className="catalog-toolbar">
        <div className="catalog-search">
          <Search size={18} />
          <input
            type="text"
            className="input"
            placeholder="Поиск по названию, Catalog ID или UUID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="catalog-type-filter" aria-label="Фильтр по типу каталога">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={typeFilter === filter.value ? "is-active" : ""}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="catalog-toggle">
          <input
            type="checkbox"
            checked={hideUserGenerated}
            onChange={(e) => setHideUserGenerated(e.target.checked)}
          />
          <span>Скрыть пользовательские каталоги</span>
        </label>
      </div>

      {/* Catalogs Grid - smaller cards */}
      <div className="catalog-grid">
        {filteredCuisines.map((cuisine) => {
          const imageUrl = cuisine.landing_image_url || cuisine.image_url;
          const typeMeta = getTypeMeta(cuisine.type);
          const TypeIcon = typeMeta.icon;
          const recommendationCount = [
            cuisine.recommendation_levels,
            cuisine.recommendation_times,
            cuisine.recommendation_dietary,
            cuisine.recommendation_tags,
          ].reduce((sum, items) => sum + (items?.length || 0), 0);

          return (
            <div
              key={cuisine.id}
              className="catalog-card animate-slide-up"
              onClick={() => openCuisine(cuisine.id)}
            >
              {/* Delete button */}
              <button
                onClick={(e) => handleDeleteCuisine(cuisine.id, cuisine.name, e)}
                className="catalog-delete-button"
                title="Удалить каталог"
              >
                <Trash2 size={16} />
              </button>

              <div className="catalog-card-media">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={cuisine.name}
                  />
                ) : (
                  <div className="catalog-card-placeholder">
                    <ImageIcon size={24} />
                    {(cuisine.name || "C").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className={typeMeta.className}>
                  <TypeIcon size={13} />
                  {typeMeta.label}
                </span>
              </div>

              <div className="catalog-card-body">
                <div>
                  <h3>{cuisine.name}</h3>
                  <p>{cuisine.catalog_id || cuisine.id}</p>
                </div>

                <div className="catalog-card-meta">
                  <span><BookOpen size={14} /> {cuisine.recipe_count || 0} рецептов</span>
                  {recommendationCount > 0 && <span><Sparkles size={14} /> {recommendationCount} тегов</span>}
                  {cuisine.is_user_generated && <span><UserRound size={14} /> пользовательский</span>}
                  {cuisine.status && cuisine.status !== "active" && <span>{cuisine.status}</span>}
                </div>

                <button type="button" className="catalog-open-button">
                  Открыть редактор
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCuisines.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <div className="empty-state-title">
            {searchTerm ? "Каталоги не найдены" : "Нет каталогов"}
          </div>
          <div className="empty-state-description">
            {searchTerm
              ? "Попробуйте изменить поиск или фильтр типа"
              : "Создайте первый каталог, затем откройте его и заполните JSON лендинга"
            }
          </div>
          {!searchTerm && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
              Создать каталог
            </button>
          )}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowAddModal(false);
        }}>
          <div className="modal animate-slide-up">
            <div className="modal-title-row">
              <div>
                <h2 className="modal-header">Создать новый каталог</h2>
                <p className="modal-subtitle">После создания откройте каталог: там можно скопировать промпт, получить JSON и вставить готовый лендинг.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowAddModal(false)} aria-label="Закрыть">
                ×
              </button>
            </div>

            {createError && (
              <div className="form-error">
                {createError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">ID (UUID)</label>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="оставьте пустым для авто"
                  value={newCuisine.id}
                  onChange={(e) => setNewCuisine({ ...newCuisine, id: e.target.value })}
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setNewCuisine({ ...newCuisine, id: crypto.randomUUID() })}
                >
                  UUID
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Название *</label>
              <input
                type="text"
                className="input"
                placeholder="Украинская кухня"
                value={newCuisine.name}
                onChange={(e) => setNewCuisine({ ...newCuisine, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">URL мини-изображения</label>
              <input
                type="text"
                className="input"
                placeholder="https://..."
                value={newCuisine.image_url}
                onChange={(e) => setNewCuisine({ ...newCuisine, image_url: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">URL landing-изображения</label>
              <input
                type="text"
                className="input"
                placeholder="https://..."
                value={newCuisine.landing_image_url}
                onChange={(e) => setNewCuisine({ ...newCuisine, landing_image_url: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Тип каталога</label>
              <select
                className="input"
                value={newCuisine.type}
                onChange={(e) => setNewCuisine({ ...newCuisine, type: e.target.value })}
              >
                <option value="free">free — бесплатный</option>
                <option value="premium">premium — платный</option>
                <option value="gift">gift — подарочный</option>
                <option value="unlockable">unlockable — разблокируемый</option>
              </select>
            </div>

            {(newCuisine.type === "premium" || newCuisine.type === "gift") && (
              <div className="recommendation-box">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>
                  Наклейки для подарка *
                </div>
                <CheckboxGroup
                  title="Уровень *"
                  values={newCuisine.recommendation_levels}
                  options={CATALOG_LEVEL_OPTIONS}
                  onChange={(values) => setNewCuisine({ ...newCuisine, recommendation_levels: values })}
                />
                <CheckboxGroup
                  title="Время *"
                  values={newCuisine.recommendation_times}
                  options={CATALOG_TIME_OPTIONS}
                  onChange={(values) => setNewCuisine({ ...newCuisine, recommendation_times: values })}
                />
                <CheckboxGroup
                  title="Питание"
                  values={newCuisine.recommendation_dietary}
                  options={CATALOG_DIETARY_OPTIONS}
                  onChange={(values) => setNewCuisine({ ...newCuisine, recommendation_dietary: values })}
                />
                <CheckboxGroup
                  title="Общие теги *"
                  values={newCuisine.recommendation_tags}
                  options={CATALOG_GENERAL_TAG_OPTIONS}
                  onChange={(values) => setNewCuisine({ ...newCuisine, recommendation_tags: values })}
                />
              </div>
            )}

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={handleCreateCuisine}
                disabled={isCreating}
                style={{ flex: 1 }}
              >
                {isCreating ? "Создаю..." : "Создать и перейти к лендингу"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1 }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
