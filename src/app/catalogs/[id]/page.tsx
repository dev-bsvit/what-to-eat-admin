"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import LandingEditor from "./LandingEditor";

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
    translations: "",
    revenue_share: "",
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "recipes">("catalog");
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

  function handleCuisineImport(imported: { name?: string; description?: string; price?: string }) {
    setEditForm(prev => ({
      ...prev,
      name: imported.name ?? prev.name,
      description: imported.description ?? prev.description,
      price: imported.price ?? prev.price,
    }));
  }

  async function saveAll() {
    setIsSavingAll(true);
    await handleSaveCuisine();
    setTriggerLandingSave(v => v + 1);
    setIsSavingAll(false);
  }

  async function handleSaveCuisine() {
    if (!editForm.name.trim()) {
      alert("Название обязательно");
      return;
    }

    const nextCatalogId = editForm.catalog_id.trim();

    if (editForm.type === "premium" && !nextCatalogId) {
      alert("Для premium каталога нужно выбрать Catalog ID (StoreKit)");
      return;
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

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--spacing-xl)', background: 'var(--bg-hover)', borderRadius: '12px', padding: '4px', width: 'fit-content' }}>
        {([
          { key: 'catalog', label: '📋 Каталог' },
          { key: 'recipes', label: `🍳 Рецепты (${recipes.length})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '8px 18px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, background: activeTab === key ? 'var(--bg-surface)' : 'transparent', color: activeTab === key ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Каталог (настройки + лендинг объединены) */}
      {activeTab === 'catalog' && <>
        {/* Basic settings card */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-lg)',
        }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

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
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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

          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={saveAll} disabled={isSavingAll}>
              {isSavingAll ? 'Сохраняю...' : '💾 Сохранить всё'}
            </button>
          </div>

          {/* Technical section — collapsed */}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', userSelect: 'none', padding: '6px 0' }}>
              ⚙️ Системная информация
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, padding: 12, background: 'var(--bg-hover)', borderRadius: 10 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>UUID</label>
                <input className="input" value={editForm.id} readOnly style={{ opacity: 0.5, fontSize: 12 }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>Статус</label>
                <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                  <option value="hidden">hidden</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>Модерация</label>
                <select className="input" value={editForm.moderation_status} onChange={(e) => setEditForm({ ...editForm, moderation_status: e.target.value })}>
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>Покупки / Скачивания</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" type="number" placeholder="покупки" value={editForm.purchases_count} onChange={(e) => setEditForm({ ...editForm, purchases_count: e.target.value })} />
                  <input className="input" type="number" placeholder="скачив." value={editForm.downloads_count} onChange={(e) => setEditForm({ ...editForm, downloads_count: e.target.value })} />
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Landing editor (only for premium) */}
        {editForm.type !== 'premium' && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,159,10,0.1)', borderRadius: '10px', color: '#ff9f0a', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
            ⚠️ Лендинг показывается в приложении только для каталогов с типом «premium». Текущий тип: {editForm.type || 'не задан'}.
          </div>
        )}
        <LandingEditor
          cuisineId={cuisineId}
          cuisineName={editForm.name}
          cuisineDescription={editForm.description}
          cuisinePrice={editForm.price ? `$${editForm.price}` : undefined}
          cuisineImageUrl={editForm.landing_image_url || editForm.image_url || undefined}
          saveTrigger={triggerLandingSave}
          onCuisineImport={handleCuisineImport}
        />
      </>}

      {/* Tab: Recipes */}
      {activeTab === 'recipes' && <>
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
              ✕
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
      </>}
    </div>
  );
}
