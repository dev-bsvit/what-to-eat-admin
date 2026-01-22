"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Cuisine {
  id: string;
  name: string;
  image_url?: string;
  recipe_count?: number;
  is_user_generated?: boolean;
  owner_id?: string;
}

export default function CatalogsPage() {
  const router = useRouter();
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideUserGenerated, setHideUserGenerated] = useState(false);
  const [newCuisine, setNewCuisine] = useState({
    id: "",
    name: "",
    image_url: "",
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
    if (!newCuisine.id || !newCuisine.name) {
      alert("Заполните все обязательные поля: ID и Название");
      return;
    }

    try {
      const payload = {
        id: newCuisine.id.trim(),
        name: newCuisine.name.trim(),
        image_url: newCuisine.image_url.trim() || null,
      };

      console.log("Отправка данных:", payload);

      const response = await fetch("/api/admin/cuisines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewCuisine({ id: "", name: "", image_url: "" });
        loadCuisines();
      } else {
        const error = await response.json();
        console.error("Ошибка API:", error);
        alert(`Ошибка: ${error.error || "Неизвестная ошибка"}`);
      }
    } catch (error) {
      console.error("Failed to create cuisine:", error);
      alert("Ошибка при создании каталога");
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
      // Фильтр по поисковому запросу
      const matchesSearch = !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase());
      // Фильтр по пользовательским каталогам
      const matchesUserFilter = !hideUserGenerated || !c.is_user_generated;
      return matchesSearch && matchesUserFilter;
    });

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
    <div style={{ maxWidth: '1200px' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="section-header">
          <h1 className="section-title">Каталоги рецептов</h1>
          <p className="section-subtitle">
            Управляйте каталогами кухонь и рецептами
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Создать каталог
        </button>
      </div>

      {/* Search and Filters */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-xl)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div className="search-input-wrapper" style={{ flex: '1', minWidth: '300px', maxWidth: '400px' }}>
          <input
            type="text"
            className="input"
            placeholder="Поиск каталогов..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--text-primary)',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={hideUserGenerated}
            onChange={(e) => setHideUserGenerated(e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              accentColor: '#667eea',
            }}
          />
          <span>Скрыть пользовательские каталоги</span>
        </label>
      </div>

      {/* Catalogs Grid - smaller cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 'var(--spacing-md)',
      }}>
        {filteredCuisines.map((cuisine) => (
          <div
            key={cuisine.id}
            className="app-card animate-slide-up"
            onClick={() => openCuisine(cuisine.id)}
            style={{
              padding: 'var(--spacing-md)',
              position: 'relative',
            }}
          >
            {/* Delete button */}
            <button
              onClick={(e) => handleDeleteCuisine(cuisine.id, cuisine.name, e)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.2s',
                opacity: 0.7,
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.opacity = '0.7';
              }}
              title="Удалить каталог"
            >
              🗑️
            </button>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}>
              {cuisine.image_url ? (
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  marginBottom: 'var(--spacing-sm)',
                }}>
                  <img
                    src={cuisine.image_url}
                    alt={cuisine.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ) : (
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  marginBottom: 'var(--spacing-sm)',
                  color: '#ffffff',
                  fontWeight: 700,
                }}>
                  {(cuisine.name || "C").slice(0, 1).toUpperCase()}
                </div>
              )}
              <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '2px',
              }}>
                {cuisine.name}
              </h3>
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}>
                {cuisine.recipe_count || 0} рецептов
              </p>
            </div>
          </div>
        ))}
      </div>

      {filteredCuisines.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <div className="empty-state-title">
            {searchTerm ? "Каталоги не найдены" : "Нет каталогов"}
          </div>
          <div className="empty-state-description">
            {searchTerm
              ? "Попробуйте изменить поисковый запрос"
              : "Создайте первый каталог для организации рецептов"
            }
          </div>
          {!searchTerm && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Создать каталог
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
            <h2 className="modal-header">Создать новый каталог</h2>

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
              <label className="form-label">URL изображения</label>
              <input
                type="text"
                className="input"
                placeholder="https://..."
                value={newCuisine.image_url}
                onChange={(e) => setNewCuisine({ ...newCuisine, image_url: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={handleCreateCuisine}
                style={{ flex: 1 }}
              >
                Создать
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
