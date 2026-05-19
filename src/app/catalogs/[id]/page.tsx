"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, BookOpen, Camera, FolderOpen, Plus, Save, Trash2 } from "lucide-react";
import LandingEditor from "./LandingEditor";
import {
  CATALOG_DIETARY_OPTIONS,
  CATALOG_GENERAL_TAG_OPTIONS,
  CATALOG_LEVEL_OPTIONS,
  CATALOG_TIME_OPTIONS,
} from "@/lib/catalogRecommendationTags";
import styles from "../catalogs-blueprint.module.css";

interface Recipe {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  cuisine_id?: string;
  servings?: number;
  cook_time?: number;
  prep_time?: number;
  difficulty?: string;
  calories?: number;
}

interface Cuisine {
  id: string;
  name: string;
  description?: string | null;
  translations?: Record<string, unknown> | null;
  image_url?: string;
  landing_image_url?: string;
  catalog_id?: string | null;
  type?: string | null;
  price?: number | null;
  is_default?: boolean | null;
  unlock_conditions?: any;
  owner_id?: string | null;
  is_user_generated?: boolean | null;
  moderation_status?: string | null;
  status?: string | null;
  popularity_score?: number | null;
  downloads_count?: number | null;
  purchases_count?: number | null;
  tags?: string[] | null;
  recommendation_levels?: string[] | null;
  recommendation_times?: string[] | null;
  recommendation_dietary?: string[] | null;
  recommendation_tags?: string[] | null;
  revenue_share?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function toggleValue(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function RecommendationCheckboxGroup({
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
                borderColor: selected ? "var(--color-deep-black)" : "var(--color-subtle-ash)",
                background: selected ? "var(--color-deep-black)" : "var(--color-canvas-white)",
                color: selected ? "var(--color-canvas-white)" : "var(--color-rich-black)",
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

export default function CatalogDetailPage() {
  const router = useRouter();
  const params = useParams();
  const cuisineId = params.id as string;

  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    description: "",
    image_url: "",
    landing_image_url: "",
    catalog_id: "",
    type: "free",
    price: "",
    is_default: "false",
    unlock_conditions: "",
    owner_id: "",
    is_user_generated: "false",
    moderation_status: "approved",
    status: "active",
    popularity_score: "",
    downloads_count: "",
    purchases_count: "",
    tags: "",
    recommendation_levels: [] as string[],
    recommendation_times: [] as string[],
    recommendation_dietary: [] as string[],
    recommendation_tags: [] as string[],
    translations: "",
    revenue_share: "",
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "landing" | "translations" | "recipes" | "technical">("settings");
  const [triggerLandingSave, setTriggerLandingSave] = useState(0);
  const [isSavingAll, setIsSavingAll] = useState(false);

  useEffect(() => {
    loadData();
  }, [cuisineId]);

  async function loadData() {
    try {
      const [cuisineRes, recipesRes] = await Promise.all([
        fetch(`/api/admin/cuisines?id=${cuisineId}`),
        fetch(`/api/admin/recipes?cuisine_id=${cuisineId}`),
      ]);

      const cuisineData = await cuisineRes.json();
      const recipesData = await recipesRes.json();

      const loadedCuisine = cuisineData.data?.[0] || null;
      setCuisine(loadedCuisine);
      setRecipes(recipesData.data || []);
      if (loadedCuisine) {
        setEditForm({
          id: loadedCuisine.id || "",
          name: loadedCuisine.name || "",
          description: loadedCuisine.description || "",
          image_url: loadedCuisine.image_url || "",
          landing_image_url: loadedCuisine.landing_image_url || "",
          catalog_id: loadedCuisine.catalog_id || "",
          type: loadedCuisine.type || "free",
          price: loadedCuisine.price?.toString() || "",
          is_default: String(loadedCuisine.is_default ?? false),
          unlock_conditions: loadedCuisine.unlock_conditions
            ? JSON.stringify(loadedCuisine.unlock_conditions)
            : "",
          owner_id: loadedCuisine.owner_id || "",
          is_user_generated: String(loadedCuisine.is_user_generated ?? false),
          moderation_status: loadedCuisine.moderation_status || "approved",
          status: loadedCuisine.status || "active",
          popularity_score: loadedCuisine.popularity_score?.toString() || "",
          downloads_count: loadedCuisine.downloads_count?.toString() || "",
          purchases_count: loadedCuisine.purchases_count?.toString() || "",
          tags: Array.isArray(loadedCuisine.tags) ? loadedCuisine.tags.join(", ") : "",
          recommendation_levels: Array.isArray(loadedCuisine.recommendation_levels) ? loadedCuisine.recommendation_levels : [],
          recommendation_times: Array.isArray(loadedCuisine.recommendation_times) ? loadedCuisine.recommendation_times : [],
          recommendation_dietary: Array.isArray(loadedCuisine.recommendation_dietary) ? loadedCuisine.recommendation_dietary : [],
          recommendation_tags: Array.isArray(loadedCuisine.recommendation_tags) ? loadedCuisine.recommendation_tags : [],
          translations: loadedCuisine.translations ? JSON.stringify(loadedCuisine.translations) : "",
          revenue_share: loadedCuisine.revenue_share?.toString() || "",
        });
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    router.push("/catalogs");
  }

  function openRecipe(recipeId: string) {
    router.push(`/recipes?edit=${recipeId}`);
  }

  async function deleteRecipe(recipeId: string, title: string) {
    if (!confirm(`Удалить рецепт «${title}»? Это действие необратимо.`)) return;
    try {
      const res = await fetch(`/api/admin/recipes/${recipeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(`Ошибка: ${data.error ?? "не удалось удалить"}`);
        return;
      }
      setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    } catch {
      alert("Ошибка соединения");
    }
  }

  function createRecipe() {
    router.push(`/recipes?new=true&cuisine=${cuisineId}`);
  }

  function handleCuisineImport(imported: {
    name?: string;
    description?: string;
    price?: string;
    recommendation_levels?: string[];
    recommendation_times?: string[];
    recommendation_dietary?: string[];
    recommendation_tags?: string[];
  }) {
    setEditForm(prev => ({
      ...prev,
      name: imported.name ?? prev.name,
      description: imported.description ?? prev.description,
      price: imported.price ?? prev.price,
      recommendation_levels: imported.recommendation_levels ?? prev.recommendation_levels,
      recommendation_times: imported.recommendation_times ?? prev.recommendation_times,
      recommendation_dietary: imported.recommendation_dietary ?? prev.recommendation_dietary,
      recommendation_tags: imported.recommendation_tags ?? prev.recommendation_tags,
    }));
  }

  async function saveAll() {
    setIsSavingAll(true);
    const savedCatalog = await handleSaveCuisine();
    if (savedCatalog) {
      setTriggerLandingSave(v => v + 1);
    }
    setIsSavingAll(false);
  }

  async function handleSaveCuisine(): Promise<boolean> {
    if (!editForm.name.trim()) {
      alert("Название обязательно");
      return false;
    }

    const nextCatalogId = editForm.catalog_id.trim();

    if (editForm.type === "premium" && !nextCatalogId) {
      alert("Для premium каталога нужно выбрать Catalog ID (StoreKit)");
      return false;
    }

    if ((editForm.type === "premium" || editForm.type === "gift") && (
      editForm.recommendation_levels.length === 0 ||
      editForm.recommendation_times.length === 0 ||
      editForm.recommendation_tags.length === 0
    )) {
      alert("Для premium/gift каталога выберите уровень, время и общие теги для подарка");
      return false;
    }

    setSaveStatus("Сохраняю...");
    try {
      const payload = {
        id: editForm.id,
        name: editForm.name,
        description: editForm.description || null,
        image_url: editForm.image_url || null,
        landing_image_url: editForm.landing_image_url || null,
        catalog_id: nextCatalogId || null,
        type: editForm.type || null,
        price: editForm.price ? parseFloat(editForm.price) : null,
        is_default: editForm.is_default === "true",
        unlock_conditions: editForm.unlock_conditions || null,
        owner_id: editForm.owner_id || null,
        is_user_generated: editForm.is_user_generated === "true",
        moderation_status: editForm.moderation_status || null,
        status: editForm.status || null,
        popularity_score: editForm.popularity_score ? parseInt(editForm.popularity_score) : null,
        downloads_count: editForm.downloads_count ? parseInt(editForm.downloads_count) : null,
        purchases_count: editForm.purchases_count ? parseInt(editForm.purchases_count) : null,
        tags: editForm.tags || null,
        recommendation_levels: editForm.recommendation_levels,
        recommendation_times: editForm.recommendation_times,
        recommendation_dietary: editForm.recommendation_dietary,
        recommendation_tags: editForm.recommendation_tags,
        translations: editForm.translations || null,
        revenue_share: editForm.revenue_share ? parseFloat(editForm.revenue_share) : null,
        };
      const response = await fetch("/api/admin/cuisines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setSaveStatus(`Ошибка: ${result.error || "не удалось сохранить"}`);
        return false;
      }
      setCuisine(result.data || cuisine);
      setSaveStatus("Готово");
      return true;
    } catch {
      setSaveStatus("Ошибка: не удалось подключиться");
      return false;
    }
  }

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
        Загрузка...
      </div>
    );
  }

  if (!cuisine) {
    return (
      <div style={{
        textAlign: 'center',
        padding: 'var(--spacing-3xl)',
      }}>
        <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>Каталог не найден</p>
        <button
          className="btn-large btn-secondary"
          onClick={goBack}
          style={{ marginTop: 'var(--spacing-lg)' }}
        >
          ← Назад к каталогам
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.blueprint} ${styles.wide}`}>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <span onClick={goBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FolderOpen size={14} />
          Каталоги
        </span>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {cuisine.name}
        </span>
      </div>

      <div className="page-header" style={{ marginTop: 'var(--spacing-lg)' }}>
        <div className="section-header">
          <h1 className="section-title">
            {cuisine.name}
          </h1>
          <p className="section-subtitle">
            Настройки каталога, лендинг, переводы и рецепты в одном рабочем сценарии
          </p>
          <div className={styles.metricStrip}>
            <span className={styles.metric}><BookOpen size={14} /> {recipes.length} рецептов</span>
            <span className={styles.metric}>{editForm.type || "free"}</span>
            <span className={styles.metric}>{editForm.status || "active"}</span>
          </div>
        </div>
        <div className={styles.actionBar} style={{ margin: 0 }}>
          <button className="btn-large btn-secondary" onClick={goBack}>
            <ArrowLeft size={16} />
            Назад
          </button>
          <button className="btn-large btn-primary" onClick={saveAll} disabled={isSavingAll}>
            <Save size={16} />
            {isSavingAll ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className={styles.tabs}>
        {([
          { key: 'settings', label: 'Настройки' },
          { key: 'landing', label: 'Лендинг' },
          { key: 'translations', label: 'Переводы' },
          { key: 'recipes', label: `Рецепты (${recipes.length})` },
          { key: 'technical', label: 'Техническое' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className={styles.panel} style={{ padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
            Основное
          </h2>

          {saveStatus && (
            <div style={{
              marginBottom: 'var(--spacing-md)',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              background: saveStatus.startsWith('Ошибка') ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)',
              color: saveStatus.startsWith('Ошибка') ? '#ff3b30' : '#34c759',
            }}>
              {saveStatus}
            </div>
          )}

          {/* Main fields — compact 2-column grid */}
          <div className={styles.settingsGrid}>

            {/* Row 1: Название + Теги */}
            <div className="form-group">
              <label className="form-label">Название *</label>
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Итальянская кухня"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Теги (через запятую)</label>
              <input
                className="input"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="🇮🇹, паста, пицца"
              />
            </div>

            {/* Row 2: Описание — full width */}
            <div className={`form-group ${styles.spanAll}`}>
              <label className="form-label">Подзаголовок</label>
              <input
                className="input"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Краткое описание каталога"
              />
            </div>

            {/* Row 3: Тип + Цена */}
            <div className="form-group">
              <label className="form-label">Тип каталога</label>
              <select
                className="input"
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              >
                <option value="free">Бесплатный</option>
                <option value="premium">Платный (premium)</option>
                <option value="gift">Подарочный (gift)</option>
                <option value="unlockable">Разблокируемый (unlockable)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Цена ($)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="1.99"
                value={editForm.price}
                disabled={editForm.type !== 'premium'}
                style={{ opacity: editForm.type !== 'premium' ? 0.4 : 1 }}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
              />
            </div>

            {/* Row 4: Catalog ID — full width */}
            <div className={`form-group ${styles.spanAll}`}>
              <label className="form-label">
                Catalog ID
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                  — уникальный ключ покупки, только латиницей без пробелов
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={editForm.catalog_id}
                  onChange={(e) => setEditForm({ ...editForm, catalog_id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                  placeholder="italian / highprotein / mycatalog..."
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => {
                    const translit: Record<string, string> = {
                      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
                      'и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
                      'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh',
                      'щ':'sh','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
                    };
                    const slug = editForm.name.toLowerCase()
                      .split('').map(c => translit[c] ?? c).join('')
                      .replace(/[^a-z0-9]/g, '')
                      .slice(0, 20);
                    setEditForm(prev => ({ ...prev, catalog_id: slug }));
                  }}
                >
                  Из названия
                </button>
              </div>
            </div>

            {/* Row 5: Фото мини + Фото лендинга */}
            <div className="form-group">
              <label className="form-label">Фото мини (URL)</label>
              <input
                className="input"
                value={editForm.image_url}
                onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                placeholder="https://..."
              />
              {editForm.image_url && (
                <img src={editForm.image_url} alt="" style={{ marginTop: 6, height: 52, borderRadius: 8, objectFit: 'cover' }} />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Фото лендинга (URL)</label>
              <input
                className="input"
                value={editForm.landing_image_url}
                onChange={(e) => setEditForm({ ...editForm, landing_image_url: e.target.value })}
                placeholder="https://..."
              />
              {editForm.landing_image_url && (
                <img src={editForm.landing_image_url} alt="" style={{ marginTop: 6, height: 52, borderRadius: 8, objectFit: 'cover' }} />
              )}
            </div>

          </div>

          {(editForm.type === "premium" || editForm.type === "gift") && (
            <div className={styles.subtlePanel} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>
                Наклейки для подарка *
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                Эти поля использует анкета регистрации, чтобы выбрать подходящий подарок.
              </div>
              <div className={styles.settingsGrid}>
                <RecommendationCheckboxGroup
                  title="Уровень *"
                  values={editForm.recommendation_levels}
                  options={CATALOG_LEVEL_OPTIONS}
                  onChange={(values) => setEditForm({ ...editForm, recommendation_levels: values })}
                />
                <RecommendationCheckboxGroup
                  title="Время *"
                  values={editForm.recommendation_times}
                  options={CATALOG_TIME_OPTIONS}
                  onChange={(values) => setEditForm({ ...editForm, recommendation_times: values })}
                />
                <RecommendationCheckboxGroup
                  title="Питание"
                  values={editForm.recommendation_dietary}
                  options={CATALOG_DIETARY_OPTIONS}
                  onChange={(values) => setEditForm({ ...editForm, recommendation_dietary: values })}
                />
                <RecommendationCheckboxGroup
                  title="Общие теги *"
                  values={editForm.recommendation_tags}
                  options={CATALOG_GENERAL_TAG_OPTIONS}
                  onChange={(values) => setEditForm({ ...editForm, recommendation_tags: values })}
                />
              </div>
            </div>
          )}

        </div>
      )}

      <div style={{ display: activeTab === "landing" || activeTab === "translations" || activeTab === "technical" ? undefined : "none" }}>
        <LandingEditor
          cuisineId={cuisineId}
          cuisineName={editForm.name}
          cuisineDescription={editForm.description}
          cuisinePrice={editForm.price ? `$${editForm.price}` : undefined}
          cuisineImageUrl={editForm.landing_image_url || editForm.image_url || undefined}
          recommendationLevels={editForm.recommendation_levels}
          recommendationTimes={editForm.recommendation_times}
          recommendationDietary={editForm.recommendation_dietary}
          recommendationTags={editForm.recommendation_tags}
          saveTrigger={triggerLandingSave}
          onCuisineImport={handleCuisineImport}
          view={activeTab === "translations" ? "translations" : activeTab === "technical" ? "technical" : "landing"}
        />
      </div>

      {/* Tab: Recipes */}
      {activeTab === 'recipes' && <>
      <div className={styles.actionBar} style={{ marginTop: 0 }}>
        <button className="btn-large btn-primary" onClick={createRecipe}>
          <Plus size={16} />
          Добавить рецепт
        </button>
        <button
          className="btn-large btn-secondary"
          onClick={() => router.push(`/instagram-import?cuisine_id=${cuisine.id}`)}
        >
          <Camera size={16} />
          Импортировать рецепт из Instagram
        </button>
      </div>
      {/* Recipe Grid - small cards */}
      <div className={styles.recipeGrid}>
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="app-card animate-slide-up"
            onClick={() => openRecipe(recipe.id)}
            style={{
              padding: 'var(--spacing-md)',
              position: 'relative',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); deleteRecipe(recipe.id, recipe.title); }}
              title="Удалить рецепт"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'rgba(255,59,48,0.1)',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--accent-danger)',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <Trash2 size={14} />
            </button>
            {recipe.image_url && (
              <div style={{
                width: '100%',
                height: '120px',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                marginBottom: 'var(--spacing-sm)',
              }}>
                <img
                  src={recipe.image_url}
                  alt={recipe.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}

            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}>
              {recipe.title}
            </h3>

            {recipe.description && (
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--spacing-sm)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {recipe.description}
              </p>
            )}

            <div className={styles.recipeMeta}>
              {recipe.servings && (
                <span>{recipe.servings} порций</span>
              )}
              {(recipe.cook_time || recipe.prep_time) && (
                <span>{(recipe.cook_time || 0) + (recipe.prep_time || 0)} мин</span>
              )}
              {recipe.calories && (
                <span>{recipe.calories} ккал</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {recipes.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--spacing-3xl)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '2px dashed var(--border-medium)',
        }}>
          <div className={styles.emptyIcon}>
            <BookOpen size={22} />
          </div>
          <p style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: 'var(--spacing-sm)' }}>
            Нет рецептов в этом каталоге
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
            Добавьте первый рецепт, чтобы начать заполнять каталог
          </p>
          <button
            className="btn-large btn-primary"
            onClick={createRecipe}
          >
            <Plus size={16} />
            Добавить рецепт
          </button>
        </div>
      )}
      </>}

      {activeTab === 'technical' && (
        <div className={styles.panel} style={{ padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            Техническое
          </h2>
          <div className={styles.settingsGrid}>
            <div className="form-group">
              <label className="form-label">UUID</label>
              <input className="input" value={editForm.id} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Статус</label>
              <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="active">active</option>
                <option value="archived">archived</option>
                <option value="hidden">hidden</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Модерация</label>
              <select className="input" value={editForm.moderation_status} onChange={(e) => setEditForm({ ...editForm, moderation_status: e.target.value })}>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Покупки</label>
              <input className="input" type="number" value={editForm.purchases_count} onChange={(e) => setEditForm({ ...editForm, purchases_count: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Скачивания</label>
              <input className="input" type="number" value={editForm.downloads_count} onChange={(e) => setEditForm({ ...editForm, downloads_count: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Revenue share</label>
              <input className="input" type="number" step="0.01" value={editForm.revenue_share} onChange={(e) => setEditForm({ ...editForm, revenue_share: e.target.value })} />
            </div>
            <div className={`form-group ${styles.spanAll}`}>
              <label className="form-label">translations JSON</label>
              <textarea className="input" rows={6} value={editForm.translations} onChange={(e) => setEditForm({ ...editForm, translations: e.target.value })} style={{ fontFamily: 'var(--font-geist-mono)' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
