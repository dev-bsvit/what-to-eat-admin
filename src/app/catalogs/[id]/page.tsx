"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

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
  revenue_share?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
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
    translations: "",
    revenue_share: "",
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");

  const resolveCatalogId = (name: string) => {
    const normalized = name.trim().toLowerCase();
    const candidates = [
      { id: "italian", keywords: ["итальян", "italian"] },
      { id: "asian", keywords: ["азиат", "asian"] },
      { id: "japanese", keywords: ["япон", "japan"] },
      { id: "mexican", keywords: ["мексик", "mexic"] },
      { id: "indian", keywords: ["индий", "indian"] },
      { id: "chinese", keywords: ["китай", "chinese"] },
      { id: "french", keywords: ["франц", "french"] },
      { id: "thai", keywords: ["тай", "thai"] },
      { id: "korean", keywords: ["корей", "korean"] },
      { id: "christmas", keywords: ["новогод", "рожде", "christmas"] },
      { id: "healthy", keywords: ["здоров", "healthy"] },
      { id: "kids", keywords: ["детск", "kids"] },
      { id: "party", keywords: ["вечерин", "party"] },
      { id: "quick", keywords: ["быстр", "quick"] },
      { id: "vegetarian", keywords: ["вегетар", "vegetarian"] },
    ];

    for (const candidate of candidates) {
      if (candidate.keywords.some((keyword) => normalized.includes(keyword))) {
        return candidate.id;
      }
    }

    return "";
  };

  useEffect(() => {
    loadData();
  }, [cuisineId]);

  async function loadData() {
    try {
      const [cuisineRes, recipesRes] = await Promise.all([
        fetch(`/api/admin/cuisines?id=${cuisineId}`),
        fetch("/api/admin/recipes"),
      ]);

      const cuisineData = await cuisineRes.json();
      const recipesData = await recipesRes.json();

      const loadedCuisine = cuisineData.data?.[0] || null;
      setCuisine(loadedCuisine);
      setRecipes((recipesData.data || []).filter((r: Recipe) => r.cuisine_id === cuisineId));
      if (loadedCuisine) {
        setEditForm({
          id: loadedCuisine.id || "",
          name: loadedCuisine.name || "",
          description: loadedCuisine.description || "",
          image_url: loadedCuisine.image_url || "",
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

  function createRecipe() {
    router.push(`/recipes?new=true&cuisine=${cuisineId}`);
  }

  async function handleSaveCuisine() {
    if (!editForm.name.trim()) {
      alert("Название обязательно");
      return;
    }

    let nextCatalogId = editForm.catalog_id.trim();
    if (editForm.type === "premium" && !nextCatalogId) {
      nextCatalogId = resolveCatalogId(editForm.name);
      if (nextCatalogId) {
        setEditForm((prev) => ({ ...prev, catalog_id: nextCatalogId }));
      }
    }

    if (editForm.type === "premium" && !nextCatalogId) {
      alert("Для premium каталога нужно указать Catalog ID (StoreKit)");
      return;
    }

    setSaveStatus("Сохраняю...");
    try {
      const payload = {
        id: editForm.id,
        name: editForm.name,
        description: editForm.description || null,
        image_url: editForm.image_url || null,
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
        return;
      }
      setCuisine(result.data || cuisine);
      setSaveStatus("Готово ✅");
    } catch (error) {
      setSaveStatus("Ошибка: не удалось подключиться");
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
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <span onClick={goBack} style={{ cursor: 'pointer' }}>📁 Каталоги</span>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {cuisine.name}
        </span>
      </div>

      {/* Header */}
      <div className="section-header" style={{ marginTop: 'var(--spacing-lg)' }}>
        <h1 className="section-title">
          {cuisine.name}
        </h1>
        <p className="section-subtitle">{recipes.length} рецептов в каталоге</p>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-xl)',
      }}>
        <button
          className="btn-large btn-primary"
          onClick={createRecipe}
        >
          <span style={{ fontSize: '20px' }}>+</span>
          Добавить рецепт в этот каталог
        </button>
        <button
          className="btn-large btn-secondary"
          onClick={() => router.push(`/instagram-import?cuisine_id=${cuisine.id}`)}
        >
          📷 Импорт из Instagram
        </button>
        <button
          className="btn-large btn-secondary"
          onClick={goBack}
        >
          ← Назад
        </button>
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-light)',
        padding: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-xl)',
      }}>
        <div className="section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h2 className="section-title" style={{ fontSize: '20px' }}>Настройки каталога</h2>
          <p className="section-subtitle">Редактирование названия, изображения и параметров монетизации</p>
        </div>

        {saveStatus && (
          <div style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: '12px' }}>
            {saveStatus}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}>
          <div className="form-group">
            <label className="form-label">ID</label>
            <input className="input" value={editForm.id} readOnly />
          </div>

          <div className="form-group">
            <label className="form-label">Название *</label>
            <input
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              onBlur={() => {
                if (editForm.type === "premium" && !editForm.catalog_id.trim()) {
                  const suggested = resolveCatalogId(editForm.name);
                  if (suggested) {
                    setEditForm((prev) => ({ ...prev, catalog_id: suggested }));
                  }
                }
              }}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Описание</label>
            <textarea
              className="input"
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">URL изображения</label>
            <input
              className="input"
              value={editForm.image_url}
              onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Тип каталога</label>
            <select
              className="input"
              value={editForm.type}
              onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
            >
              <option value="free">free</option>
              <option value="premium">premium</option>
              <option value="gift">gift</option>
              <option value="unlockable">unlockable</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Catalog ID (StoreKit)</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                className="input"
                placeholder="italian / asian / japanese..."
                value={editForm.catalog_id}
                onChange={(e) => setEditForm({ ...editForm, catalog_id: e.target.value })}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const suggested = resolveCatalogId(editForm.name);
                  if (suggested) {
                    setEditForm((prev) => ({ ...prev, catalog_id: suggested }));
                  } else {
                    alert("Не удалось определить Catalog ID по названию");
                  }
                }}
              >
                Подставить
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Цена</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={editForm.price}
              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Статус</label>
            <select
              className="input"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
              <option value="hidden">hidden</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Модерация</label>
            <select
              className="input"
              value={editForm.moderation_status}
              onChange={(e) => setEditForm({ ...editForm, moderation_status: e.target.value })}
            >
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">По умолчанию</label>
            <select
              className="input"
              value={editForm.is_default}
              onChange={(e) => setEditForm({ ...editForm, is_default: e.target.value })}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Пользовательский</label>
            <select
              className="input"
              value={editForm.is_user_generated}
              onChange={(e) => setEditForm({ ...editForm, is_user_generated: e.target.value })}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Owner ID</label>
            <input
              className="input"
              value={editForm.owner_id}
              onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Популярность</label>
            <input
              className="input"
              type="number"
              value={editForm.popularity_score}
              onChange={(e) => setEditForm({ ...editForm, popularity_score: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Скачивания</label>
            <input
              className="input"
              type="number"
              value={editForm.downloads_count}
              onChange={(e) => setEditForm({ ...editForm, downloads_count: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Покупки</label>
            <input
              className="input"
              type="number"
              value={editForm.purchases_count}
              onChange={(e) => setEditForm({ ...editForm, purchases_count: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Доля выручки (%)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={editForm.revenue_share}
              onChange={(e) => setEditForm({ ...editForm, revenue_share: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Теги (через запятую)</label>
            <input
              className="input"
              value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Переводы (JSON)</label>
            <textarea
              className="input"
              rows={4}
              placeholder='{"en":{"name":"Italian","description":"..."}}'
              value={editForm.translations}
              onChange={(e) => setEditForm({ ...editForm, translations: e.target.value })}
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Условия разблокировки (JSON)</label>
            <textarea
              className="input"
              rows={4}
              value={editForm.unlock_conditions}
              onChange={(e) => setEditForm({ ...editForm, unlock_conditions: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: 'var(--spacing-lg)' }}>
          <button className="btn btn-primary" onClick={handleSaveCuisine}>
            Сохранить каталог
          </button>
        </div>
      </div>

      {/* Recipe Grid - small cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 'var(--spacing-md)',
      }}>
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="app-card animate-slide-up"
            onClick={() => openRecipe(recipe.id)}
            style={{
              padding: 'var(--spacing-md)',
            }}
          >
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

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              {recipe.servings && (
                <span>👥 {recipe.servings} порций</span>
              )}
              {(recipe.cook_time || recipe.prep_time) && (
                <span>⏱️ {(recipe.cook_time || 0) + (recipe.prep_time || 0)} мин</span>
              )}
              {recipe.calories && (
                <span>🔥 {recipe.calories} ккал</span>
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
          <div style={{ fontSize: '64px', marginBottom: 'var(--spacing-lg)' }}>📝</div>
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
            <span style={{ fontSize: '20px' }}>+</span>
            Добавить рецепт
          </button>
        </div>
      )}
    </div>
  );
}
