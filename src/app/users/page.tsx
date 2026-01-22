"use client";

import { useEffect, useState } from "react";

type ProfileRow = {
  id: string;
  name?: string | null;
  settings?: any;
  created_at?: string | null;
  updated_at?: string | null;
  cuisines_count?: number;
  favorites_count?: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
};

const extractSettings = (settings: any) => {
  const theme = settings?.theme || "—";
  const language = settings?.language || "—";
  const measurement = settings?.measurementUnit || "—";
  const diets = Array.isArray(settings?.preferences?.diets) ? settings.preferences.diets.length : 0;
  const allergies = Array.isArray(settings?.preferences?.allergies)
    ? settings.preferences.allergies.length
    : 0;
  return { theme, language, measurement, diets, allergies };
};

const extractOnboarding = (settings: any) => {
  const onboarding = settings?.onboarding || {};
  const priorities = Array.isArray(onboarding?.priorities) ? onboarding.priorities : [];
  const cookingLevel = onboarding?.cookingLevel || onboarding?.cooking_level || "—";
  const mealStyle = onboarding?.mealStyle || onboarding?.meal_style || "—";
  const householdSize = onboarding?.householdSize || onboarding?.household_size || "—";
  const completed =
    onboarding?.completed === true ||
    priorities.length > 0 ||
    cookingLevel !== "—" ||
    mealStyle !== "—" ||
    householdSize !== "—";
  return { completed, priorities, cookingLevel, mealStyle, householdSize };
};

export default function UsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userCuisines, setUserCuisines] = useState<any[]>([]);
  const [userFavorites, setUserFavorites] = useState<any[]>([]);
  const [userRecipes, setUserRecipes] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  useEffect(() => {
    void loadProfiles(1, true);
  }, []);

  async function loadProfiles(targetPage: number, replace = false) {
    setLoading(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", "50");
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const response = await fetch(`/api/admin/profiles?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось загрузить"}`);
        setProfiles([]);
        return;
      }
      const data = result.data || [];
      setProfiles((prev) => (replace ? data : [...prev, ...data]));
      setPage(targetPage);
      if (typeof result.count === "number") {
        setTotalCount(result.count);
      }
    } catch (error) {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
    }
  }

  const canLoadMore =
    totalCount !== null ? profiles.length < totalCount : profiles.length % 50 === 0;

  async function toggleUserDetails(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setUserCuisines([]);
      setUserFavorites([]);
      setUserRecipes([]);
      return;
    }

    setExpandedUserId(userId);
    setLoadingDetails(true);

    try {
      // Загружаем каталоги пользователя
      const cuisinesRes = await fetch(`/api/admin/cuisines`);
      const cuisinesData = await cuisinesRes.json();
      const userCuisinesFiltered = (cuisinesData.data || []).filter(
        (c: any) => c.owner_id === userId
      );
      setUserCuisines(userCuisinesFiltered);

      // Загружаем избранное пользователя
      const favoritesRes = await fetch(`/api/admin/favorites?user_id=${userId}`);
      if (favoritesRes.ok) {
        const favoritesData = await favoritesRes.json();
        setUserFavorites(favoritesData.data || []);
      } else {
        setUserFavorites([]);
      }

      // Загружаем рецепты пользователя
      const recipesRes = await fetch(`/api/admin/user-recipes?user_id=${userId}`);
      if (recipesRes.ok) {
        const recipesData = await recipesRes.json();
        setUserRecipes(recipesData.data || []);
      } else {
        setUserRecipes([]);
      }
    } catch (error) {
      console.error("Failed to load user details:", error);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function openRecipeModal(recipeId: string) {
    setLoadingRecipe(true);
    setSelectedRecipe(null);

    try {
      const res = await fetch(`/api/admin/recipes/${recipeId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRecipe(data);
      }
    } catch (error) {
      console.error("Failed to load recipe:", error);
    } finally {
      setLoadingRecipe(false);
    }
  }

  function closeRecipeModal() {
    setSelectedRecipe(null);
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">👤 Пользователи</h1>
        <p className="section-subtitle">
          {totalCount !== null ? `${profiles.length} из ${totalCount}` : `${profiles.length}`} профилей
        </p>
      </div>

      <div style={{
        display: "flex",
        gap: "var(--spacing-md)",
        flexWrap: "wrap",
        marginBottom: "var(--spacing-xl)",
      }}>
        <input
          type="text"
          className="input-large"
          placeholder="Поиск по имени или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "240px" }}
        />
        <button
          className="btn-large btn-secondary"
          onClick={() => loadProfiles(1, true)}
        >
          Обновить
        </button>
      </div>

      {status && (
        <div style={{ marginBottom: "var(--spacing-lg)", color: "var(--text-secondary)", fontSize: "12px" }}>
          {status}
        </div>
      )}

      {loading && profiles.length === 0 ? (
        <div style={{ padding: "var(--spacing-lg)", color: "var(--text-secondary)" }}>
          Загружаю пользователей...
        </div>
      ) : (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          overflow: "hidden",
        }}>
          {profiles.length === 0 ? (
            <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--text-secondary)" }}>
              Нет данных о пользователях.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
              }}>
                <thead>
                  <tr style={{
                    background: "var(--bg-hover)",
                    borderBottom: "2px solid var(--border-light)",
                  }}>
                    <th style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "30%",
                    }}>
                      Пользователь
                    </th>
                    <th style={{
                      padding: "16px 24px",
                      textAlign: "center",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "12%",
                    }}>
                      Каталоги
                    </th>
                    <th style={{
                      padding: "16px 24px",
                      textAlign: "center",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "12%",
                    }}>
                      Избранное
                    </th>
                    <th style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "28%",
                    }}>
                      Настройки
                    </th>
                    <th style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "18%",
                    }}>
                      Создан
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => {
                    const settings = extractSettings(profile.settings || {});
                    const onboarding = extractOnboarding(profile.settings || {});
                    const isExpanded = expandedUserId === profile.id;
                    const hasData = (profile.cuisines_count || 0) > 0 || (profile.favorites_count || 0) > 0;

                    return (
                      <>
                        <tr
                          key={profile.id}
                          onClick={() => hasData && toggleUserDetails(profile.id)}
                          style={{
                            cursor: hasData ? "pointer" : "default",
                            background: isExpanded ? "rgba(102, 126, 234, 0.03)" : "transparent",
                            borderBottom: "1px solid var(--border-light)",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (hasData) {
                              e.currentTarget.style.background = isExpanded
                                ? "rgba(102, 126, 234, 0.05)"
                                : "var(--bg-hover)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isExpanded
                              ? "rgba(102, 126, 234, 0.03)"
                              : "transparent";
                          }}
                        >
                          <td style={{
                            padding: "20px 24px",
                            verticalAlign: "middle",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              {hasData && (
                                <span style={{
                                  fontSize: "10px",
                                  transition: "transform 0.2s",
                                  display: "flex",
                                  alignItems: "center",
                                  color: "var(--text-secondary)",
                                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)"
                                }}>
                                  ▶
                                </span>
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{
                                  fontWeight: 600,
                                  fontSize: "15px",
                                  color: "var(--text-primary)",
                                  marginBottom: "6px",
                                }}>
                                  {profile.name || "Без имени"}
                                </div>
                                <div style={{
                                  fontSize: "11px",
                                  color: "var(--text-secondary)",
                                  fontFamily: "monospace",
                                  letterSpacing: "0.3px",
                                }}>
                                  {profile.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: "20px 24px",
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}>
                            <div style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                              padding: "8px 16px",
                              minWidth: "70px",
                              background: profile.cuisines_count
                                ? "linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))"
                                : "var(--bg-hover)",
                              borderRadius: "8px",
                              fontSize: "15px",
                              fontWeight: 700,
                              color: profile.cuisines_count ? "#667eea" : "var(--text-secondary)",
                              border: profile.cuisines_count
                                ? "1px solid rgba(102, 126, 234, 0.2)"
                                : "1px solid transparent",
                            }}>
                              <span style={{ fontSize: "16px" }}>📁</span>
                              <span>{profile.cuisines_count || 0}</span>
                            </div>
                          </td>
                          <td style={{
                            padding: "20px 24px",
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}>
                            <div style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                              padding: "8px 16px",
                              minWidth: "70px",
                              background: profile.favorites_count
                                ? "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 191, 36, 0.1))"
                                : "var(--bg-hover)",
                              borderRadius: "8px",
                              fontSize: "15px",
                              fontWeight: 700,
                              color: profile.favorites_count ? "#f59e0b" : "var(--text-secondary)",
                              border: profile.favorites_count
                                ? "1px solid rgba(245, 158, 11, 0.2)"
                                : "1px solid transparent",
                            }}>
                              <span style={{ fontSize: "16px" }}>⭐</span>
                              <span>{profile.favorites_count || 0}</span>
                            </div>
                          </td>
                          <td style={{
                            padding: "20px 24px",
                            verticalAlign: "middle",
                          }}>
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}>
                              <div style={{
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                                fontSize: "13px",
                              }}>
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "4px 10px",
                                  background: "var(--bg-hover)",
                                  borderRadius: "6px",
                                  color: "var(--text-primary)",
                                }}>
                                  <span>🎨</span>
                                  <span>{settings.theme}</span>
                                </span>
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "4px 10px",
                                  background: "var(--bg-hover)",
                                  borderRadius: "6px",
                                  color: "var(--text-primary)",
                                }}>
                                  <span>🌐</span>
                                  <span>{settings.language}</span>
                                </span>
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "4px 10px",
                                  background: "var(--bg-hover)",
                                  borderRadius: "6px",
                                  color: "var(--text-primary)",
                                }}>
                                  <span>📏</span>
                                  <span>{settings.measurement}</span>
                                </span>
                              </div>
                              <div style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                display: "flex",
                                gap: "12px",
                              }}>
                                <span>🥗 {settings.diets} диет</span>
                                <span>•</span>
                                <span>🚫 {settings.allergies} аллергий</span>
                              </div>
                              <div style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}>
                                <span>📝 Анкета: {onboarding.completed ? "заполнена" : "не заполнена"}</span>
                                {onboarding.priorities.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{onboarding.priorities.length} приоритетов</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: "20px 24px",
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            verticalAlign: "middle",
                          }}>
                            {formatDate(profile.created_at)}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${profile.id}-details`}>
                            <td colSpan={5} style={{
                              padding: 0,
                              background: "linear-gradient(to bottom, rgba(102, 126, 234, 0.02), transparent)",
                              borderBottom: "1px solid var(--border-light)",
                            }}>
                              <div style={{ padding: "32px 24px" }}>
                                {loadingDetails ? (
                                  <div style={{
                                    textAlign: "center",
                                    color: "var(--text-secondary)",
                                    padding: "24px",
                                  }}>
                                    Загрузка данных...
                                  </div>
                                ) : (
                                  <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr 1fr",
                                    gap: "24px",
                                  }}>
                                    {/* Каталоги */}
                                    <div>
                                      <h4 style={{
                                        fontSize: "16px",
                                        fontWeight: 700,
                                        marginBottom: "20px",
                                        color: "var(--text-primary)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                      }}>
                                        <span style={{ fontSize: "20px" }}>📁</span>
                                        <span>Каталоги</span>
                                        <span style={{
                                          fontSize: "13px",
                                          fontWeight: 600,
                                          color: "#667eea",
                                          background: "rgba(102, 126, 234, 0.1)",
                                          padding: "4px 12px",
                                          borderRadius: "12px",
                                        }}>
                                          {userCuisines.length}
                                        </span>
                                      </h4>
                                      {userCuisines.length === 0 ? (
                                        <div style={{
                                          padding: "32px",
                                          textAlign: "center",
                                          fontSize: "14px",
                                          color: "var(--text-secondary)",
                                          fontStyle: "italic",
                                          background: "var(--bg-hover)",
                                          borderRadius: "12px",
                                        }}>
                                          Нет каталогов
                                        </div>
                                      ) : (
                                        <div style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "12px",
                                        }}>
                                          {userCuisines.map((cuisine) => (
                                            <div
                                              key={cuisine.id}
                                              style={{
                                                padding: "16px",
                                                background: "var(--bg-surface)",
                                                borderRadius: "10px",
                                                border: "1px solid var(--border-light)",
                                                transition: "all 0.2s ease",
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = "rgba(102, 126, 234, 0.3)";
                                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.1)";
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = "var(--border-light)";
                                                e.currentTarget.style.boxShadow = "none";
                                              }}
                                            >
                                              <div style={{
                                                fontWeight: 600,
                                                fontSize: "14px",
                                                marginBottom: "8px",
                                                color: "var(--text-primary)",
                                              }}>
                                                {cuisine.name}
                                              </div>
                                              <div style={{
                                                fontSize: "11px",
                                                color: "var(--text-secondary)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "10px",
                                                fontFamily: "monospace",
                                              }}>
                                                <span style={{
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "4px",
                                                  padding: "3px 8px",
                                                  background: "var(--bg-hover)",
                                                  borderRadius: "4px",
                                                }}>
                                                  🔒 {cuisine.status}
                                                </span>
                                                <span style={{ opacity: 0.5 }}>•</span>
                                                <span style={{ opacity: 0.7 }}>{cuisine.id.slice(0, 8)}...</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Избранное */}
                                    <div>
                                      <h4 style={{
                                        fontSize: "16px",
                                        fontWeight: 700,
                                        marginBottom: "20px",
                                        color: "var(--text-primary)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                      }}>
                                        <span style={{ fontSize: "20px" }}>⭐</span>
                                        <span>Избранное</span>
                                        <span style={{
                                          fontSize: "13px",
                                          fontWeight: 600,
                                          color: "#f59e0b",
                                          background: "rgba(245, 158, 11, 0.1)",
                                          padding: "4px 12px",
                                          borderRadius: "12px",
                                        }}>
                                          {userFavorites.length}
                                        </span>
                                      </h4>
                                      {userFavorites.length === 0 ? (
                                        <div style={{
                                          padding: "32px",
                                          textAlign: "center",
                                          fontSize: "14px",
                                          color: "var(--text-secondary)",
                                          fontStyle: "italic",
                                          background: "var(--bg-hover)",
                                          borderRadius: "12px",
                                        }}>
                                          Нет избранных рецептов
                                        </div>
                                      ) : (
                                        <div style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "8px",
                                        }}>
                                          {userFavorites.map((fav, index) => (
                                            <div
                                              key={fav.recipe_id}
                                              onClick={() => openRecipeModal(fav.recipe_id)}
                                              style={{
                                                padding: "14px 16px",
                                                background: "var(--bg-surface)",
                                                borderRadius: "10px",
                                                border: "1px solid var(--border-light)",
                                                transition: "all 0.2s ease",
                                                display: "flex",
                                                alignItems: "flex-start",
                                                gap: "12px",
                                                cursor: "pointer",
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = "rgba(245, 158, 11, 0.03)";
                                                e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.4)";
                                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(245, 158, 11, 0.15)";
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = "var(--bg-surface)";
                                                e.currentTarget.style.borderColor = "var(--border-light)";
                                                e.currentTarget.style.boxShadow = "none";
                                              }}
                                            >
                                              <span style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                minWidth: "26px",
                                                height: "26px",
                                                background: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
                                                color: "white",
                                                borderRadius: "8px",
                                                fontSize: "12px",
                                                fontWeight: 700,
                                                flexShrink: 0,
                                              }}>
                                                {index + 1}
                                              </span>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                  fontWeight: 600,
                                                  fontSize: "15px",
                                                  marginBottom: "6px",
                                                  color: "var(--text-primary)",
                                                  lineHeight: "1.4",
                                                }}>
                                                  {fav.recipe?.title || "Рецепт не найден"}
                                                </div>
                                                <div style={{
                                                  fontSize: "12px",
                                                  color: "var(--text-secondary)",
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "10px",
                                                  flexWrap: "wrap",
                                                }}>
                                                  <span style={{
                                                    opacity: 0.6,
                                                    fontSize: "11px",
                                                    fontFamily: "monospace",
                                                    background: "rgba(0,0,0,0.05)",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                  }}>
                                                    ID: {fav.recipe_id.slice(0, 8)}...
                                                  </span>
                                                  {fav.recipe?.cook_time && (
                                                    <>
                                                      <span style={{ opacity: 0.4 }}>•</span>
                                                      <span style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "4px",
                                                      }}>
                                                        ⏱️ {fav.recipe.cook_time} мин
                                                      </span>
                                                    </>
                                                  )}
                                                  {fav.recipe?.difficulty && (
                                                    <>
                                                      <span style={{ opacity: 0.4 }}>•</span>
                                                      <span style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "4px",
                                                      }}>
                                                        📊 {fav.recipe.difficulty}
                                                      </span>
                                                    </>
                                                  )}
                                                  {fav.added_at && (
                                                    <>
                                                      <span style={{ opacity: 0.4 }}>•</span>
                                                      <span style={{ opacity: 0.6, fontSize: "11px" }}>
                                                        {new Date(fav.added_at).toLocaleDateString("ru-RU", {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric"
                                                        })}
                                                      </span>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Рецепты пользователя */}
                                    <div>
                                      <h4 style={{
                                        fontSize: "16px",
                                        fontWeight: 700,
                                        marginBottom: "20px",
                                        color: "var(--text-primary)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                      }}>
                                        <span style={{ fontSize: "20px" }}>🍳</span>
                                        <span>Рецепты</span>
                                        <span style={{
                                          fontSize: "13px",
                                          fontWeight: 600,
                                          color: "#10b981",
                                          background: "rgba(16, 185, 129, 0.1)",
                                          padding: "4px 12px",
                                          borderRadius: "12px",
                                        }}>
                                          {userRecipes.length}
                                        </span>
                                      </h4>
                                      {userRecipes.length === 0 ? (
                                        <div style={{
                                          padding: "32px",
                                          textAlign: "center",
                                          fontSize: "14px",
                                          color: "var(--text-secondary)",
                                          fontStyle: "italic",
                                          background: "var(--bg-hover)",
                                          borderRadius: "12px",
                                        }}>
                                          Нет рецептов
                                        </div>
                                      ) : (
                                        <div style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "12px",
                                        }}>
                                          {userRecipes.map((recipe) => (
                                            <div
                                              key={recipe.id}
                                              onClick={() => openRecipeModal(recipe.id)}
                                              style={{
                                                padding: "16px",
                                                background: "var(--bg-surface)",
                                                borderRadius: "10px",
                                                border: "1px solid var(--border-light)",
                                                transition: "all 0.2s ease",
                                                cursor: "pointer",
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.3)";
                                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(16, 185, 129, 0.1)";
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = "var(--border-light)";
                                                e.currentTarget.style.boxShadow = "none";
                                              }}
                                            >
                                              <div style={{
                                                fontWeight: 600,
                                                fontSize: "14px",
                                                marginBottom: "8px",
                                                color: "var(--text-primary)",
                                              }}>
                                                {recipe.title}
                                              </div>
                                              <div style={{
                                                fontSize: "12px",
                                                color: "var(--text-secondary)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "10px",
                                                flexWrap: "wrap",
                                              }}>
                                                {recipe.cuisine && (
                                                  <>
                                                    <span style={{
                                                      display: "inline-flex",
                                                      alignItems: "center",
                                                      gap: "4px",
                                                    }}>
                                                      📁 {recipe.cuisine.name}
                                                    </span>
                                                    <span style={{ opacity: 0.5 }}>•</span>
                                                  </>
                                                )}
                                                {recipe.cook_time && (
                                                  <span style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "4px",
                                                  }}>
                                                    ⏱️ {recipe.cook_time} мин
                                                  </span>
                                                )}
                                                {recipe.difficulty && (
                                                  <>
                                                    <span style={{ opacity: 0.5 }}>•</span>
                                                    <span style={{
                                                      display: "inline-flex",
                                                      alignItems: "center",
                                                      gap: "4px",
                                                    }}>
                                                      📊 {recipe.difficulty}
                                                    </span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div style={{
                                  marginTop: "24px",
                                  padding: "20px",
                                  background: "var(--bg-surface)",
                                  borderRadius: "12px",
                                  border: "1px solid var(--border-light)",
                                }}>
                                  <h4 style={{
                                    fontSize: "16px",
                                    fontWeight: 700,
                                    marginBottom: "12px",
                                    color: "var(--text-primary)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                  }}>
                                    <span style={{ fontSize: "18px" }}>📝</span>
                                    <span>Анкета</span>
                                    <span style={{
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      color: onboarding.completed ? "#10b981" : "var(--text-secondary)",
                                      background: onboarding.completed ? "rgba(16, 185, 129, 0.1)" : "var(--bg-hover)",
                                      padding: "4px 10px",
                                      borderRadius: "10px",
                                    }}>
                                      {onboarding.completed ? "Заполнена" : "Не заполнена"}
                                    </span>
                                  </h4>
                                  <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "12px 20px",
                                    fontSize: "13px",
                                    color: "var(--text-secondary)",
                                  }}>
                                    <div>
                                      <strong style={{ color: "var(--text-primary)" }}>Приоритеты:</strong>{" "}
                                      {onboarding.priorities.length ? onboarding.priorities.join(", ") : "—"}
                                    </div>
                                    <div>
                                      <strong style={{ color: "var(--text-primary)" }}>Уровень:</strong>{" "}
                                      {onboarding.cookingLevel}
                                    </div>
                                    <div>
                                      <strong style={{ color: "var(--text-primary)" }}>Стиль:</strong>{" "}
                                      {onboarding.mealStyle}
                                    </div>
                                    <div>
                                      <strong style={{ color: "var(--text-primary)" }}>Семья:</strong>{" "}
                                      {onboarding.householdSize}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && profiles.length > 0 && canLoadMore && (
        <div style={{ textAlign: "center", marginTop: "var(--spacing-lg)" }}>
          <button
            className="btn-large btn-secondary"
            onClick={() => loadProfiles(page + 1)}
          >
            Загрузить ещё
          </button>
        </div>
      )}

      {/* Recipe Modal */}
      {(selectedRecipe || loadingRecipe) && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={closeRecipeModal}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {loadingRecipe ? (
              <div style={{ padding: "60px", textAlign: "center", color: "#666" }}>
                Загрузка рецепта...
              </div>
            ) : selectedRecipe ? (
              <>
                {/* Close button */}
                <button
                  onClick={closeRecipeModal}
                  style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    background: "#f0f0f0",
                    border: "none",
                    borderRadius: "50%",
                    width: "40px",
                    height: "40px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    color: "#333",
                    zIndex: 10,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e0e0e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f0f0f0";
                  }}
                >
                  ✕
                </button>

                {/* Recipe Image */}
                {selectedRecipe.image_url && (
                  <div style={{ width: "100%", height: "300px", overflow: "hidden", borderRadius: "16px 16px 0 0" }}>
                    <img
                      src={selectedRecipe.image_url}
                      alt={selectedRecipe.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}

                <div style={{ padding: "32px" }}>
                  {/* Title */}
                  <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "16px", color: "#1a1a1a" }}>
                    {selectedRecipe.title}
                  </h2>

                  {/* Meta info */}
                  <div style={{ display: "flex", gap: "20px", marginBottom: "24px", flexWrap: "wrap" }}>
                    {selectedRecipe.cook_time && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666" }}>
                        <span>⏱️</span>
                        <span>{selectedRecipe.cook_time} мин</span>
                      </div>
                    )}
                    {selectedRecipe.difficulty && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666" }}>
                        <span>📊</span>
                        <span>{selectedRecipe.difficulty}</span>
                      </div>
                    )}
                    {selectedRecipe.servings && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666" }}>
                        <span>👥</span>
                        <span>{selectedRecipe.servings} порций</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {selectedRecipe.description && (
                    <div style={{ marginBottom: "24px" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px", color: "#1a1a1a" }}>
                        Описание
                      </h3>
                      <p style={{ color: "#444", lineHeight: "1.6" }}>
                        {selectedRecipe.description}
                      </p>
                    </div>
                  )}

                  {/* Ingredients */}
                  {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 && (
                    <div style={{ marginBottom: "24px" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px", color: "#1a1a1a" }}>
                        Ингредиенты
                      </h3>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {selectedRecipe.ingredients.map((ingredient: any, idx: number) => (
                          <li
                            key={idx}
                            style={{
                              padding: "10px 16px",
                              marginBottom: "8px",
                              background: "#f8f9fa",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              color: "#1a1a1a",
                            }}
                          >
                            <span>{ingredient.name}</span>
                            <span style={{ color: "#666" }}>
                              {ingredient.amount} {ingredient.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Instructions */}
                  {selectedRecipe.instructions && selectedRecipe.instructions.length > 0 && (
                    <div style={{ marginBottom: "24px" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px", color: "#1a1a1a" }}>
                        Инструкция
                      </h3>
                      <ol style={{ padding: 0, margin: 0, listStyle: "none" }}>
                        {selectedRecipe.instructions.map((step: any, idx: number) => (
                          <li
                            key={idx}
                            style={{
                              padding: "16px",
                              marginBottom: "12px",
                              background: "#f8f9fa",
                              borderRadius: "8px",
                              display: "flex",
                              gap: "12px",
                            }}
                          >
                            <span
                              style={{
                                minWidth: "32px",
                                height: "32px",
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                color: "white",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "14px",
                              }}
                            >
                              {idx + 1}
                            </span>
                            <span style={{ flex: 1, color: "#333", lineHeight: "1.6" }}>
                              {step.text || step}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
