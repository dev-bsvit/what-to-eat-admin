"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./users.module.css";

type JsonRecord = Record<string, any>;

type ProfileRow = {
  id: string;
  name?: string | null;
  settings?: JsonRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  cuisines_count?: number;
  favorites_count?: number;
};

const PAGE_SIZE = 50;

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const shortId = (value?: string | null) => (value ? `${value.slice(0, 8)}...` : "-");

const extractSettings = (settings?: JsonRecord | null) => {
  const theme = settings?.theme || "-";
  const language = settings?.language || settings?.locale || "-";
  const measurement = settings?.measurementUnit || settings?.measurement_unit || "-";
  const diets = Array.isArray(settings?.preferences?.diets) ? settings.preferences.diets.length : 0;
  const allergies = Array.isArray(settings?.preferences?.allergies)
    ? settings.preferences.allergies.length
    : 0;
  return { theme, language, measurement, diets, allergies };
};

const extractOnboarding = (settings?: JsonRecord | null) => {
  const onboarding = settings?.onboarding || {};
  const priorities = Array.isArray(onboarding?.priorities) ? onboarding.priorities : [];
  const cookingLevel = onboarding?.cookingLevel || onboarding?.cooking_level || "-";
  const cookingTime = onboarding?.cookingTime || onboarding?.cooking_time || "-";
  const dietaryRestriction = onboarding?.dietaryRestriction || onboarding?.dietary_restriction || "-";
  const cookingPriority = onboarding?.cookingPriority || onboarding?.cooking_priority || "-";
  const cuisinePreference = onboarding?.cuisinePreference || onboarding?.cuisine_preference || "-";
  const giftedCatalogId = onboarding?.giftedCatalogId || onboarding?.gifted_catalog_id || null;
  const mealStyle = onboarding?.mealStyle || onboarding?.meal_style || "-";
  const householdSize = onboarding?.householdSize || onboarding?.household_size || "-";
  const completed =
    onboarding?.completed === true ||
    priorities.length > 0 ||
    cookingLevel !== "-" ||
    cookingPriority !== "-" ||
    cuisinePreference !== "-";

  return {
    completed,
    priorities,
    cookingLevel,
    cookingTime,
    dietaryRestriction,
    cookingPriority,
    cuisinePreference,
    giftedCatalogId,
    mealStyle,
    householdSize,
  };
};

const getSubscriptionLabel = (profile: ProfileRow) => {
  const status = profile.subscription_status || "free";
  if (status === "lifetime") return "Lifetime";
  if (status === "monthly") return "Monthly";
  if (status === "yearly") return "Yearly";
  return "Free";
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
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const loadProfiles = useCallback(async (targetPage: number, replace = false, searchTerm = "") => {
    setLoading(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", String(PAGE_SIZE));
      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
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
    } catch {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles(1, true);
  }, [loadProfiles]);

  const summary = useMemo(() => {
    const withOnboarding = profiles.filter((profile) => extractOnboarding(profile.settings).completed).length;
    const freeUsers = profiles.filter((profile) => getSubscriptionLabel(profile) === "Free").length;
    const withActivity = profiles.filter(
      (profile) => (profile.cuisines_count || 0) > 0 || (profile.favorites_count || 0) > 0
    ).length;

    return { withOnboarding, freeUsers, withActivity };
  }, [profiles]);

  const canLoadMore =
    totalCount !== null ? profiles.length < totalCount : profiles.length % PAGE_SIZE === 0;

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
      const cuisinesRes = await fetch(`/api/admin/cuisines`);
      const cuisinesData = await cuisinesRes.json();
      const userCuisinesFiltered = (cuisinesData.data || []).filter(
        (cuisine: any) => cuisine.owner_id === userId
      );
      setUserCuisines(userCuisinesFiltered);

      const favoritesRes = await fetch(`/api/admin/favorites?user_id=${userId}`);
      if (favoritesRes.ok) {
        const favoritesData = await favoritesRes.json();
        setUserFavorites(favoritesData.data || []);
      } else {
        setUserFavorites([]);
      }

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

  async function deleteUser(userId: string, userName: string | null) {
    const confirmed = window.confirm(
      `Удалить аккаунт "${userName || userId}"?\n\nЭто действие нельзя отменить — все данные пользователя будут удалены.`
    );
    if (!confirmed) return;

    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/admin/profiles/${userId}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) {
        alert(`Ошибка: ${result.error || "не удалось удалить"}`);
        return;
      }
      setProfiles((prev) => prev.filter((profile) => profile.id !== userId));
      setTotalCount((prev) => (prev !== null ? prev - 1 : null));
      if (expandedUserId === userId) setExpandedUserId(null);
    } catch {
      alert("Ошибка: не удалось подключиться");
    } finally {
      setDeletingUserId(null);
    }
  }

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadProfiles(1, true, search);
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>Admin / Users</div>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>Пользователи</h1>
            <p className={styles.subtitle}>
              Профили, настройки, анкета, пользовательские каталоги, избранное и рецепты в одном
              рабочем представлении.
            </p>
          </div>
          <div className={styles.heroBadges}>
            <span className={styles.inverseBadge}>Profiles</span>
            <span className={styles.outlineBadge}>Supabase Auth</span>
          </div>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Сводка по пользователям">
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{profiles.length}</span>
          <span className={styles.metricLabel}>
            {totalCount !== null ? `из ${totalCount} загружено` : "загружено"}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{summary.withActivity}</span>
          <span className={styles.metricLabel}>с активностью</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{summary.withOnboarding}</span>
          <span className={styles.metricLabel}>с анкетой</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{summary.freeUsers}</span>
          <span className={styles.metricLabel}>free в выборке</span>
        </div>
      </section>

      <form className={styles.toolbar} onSubmit={handleSearch}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Поиск по имени или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className={styles.secondaryButton} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </form>

      {status && <div className={styles.statusBox}>{status}</div>}

      {loading && profiles.length === 0 ? (
        <div className={styles.emptyState}>Загружаю пользователей...</div>
      ) : (
        <section className={styles.card}>
          {profiles.length === 0 ? (
            <div className={styles.emptyState}>Нет данных о пользователях.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Подписка</th>
                    <th>Активность</th>
                    <th>Настройки</th>
                    <th>Обновлен</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => {
                    const settings = extractSettings(profile.settings);
                    const onboarding = extractOnboarding(profile.settings);
                    const isExpanded = expandedUserId === profile.id;

                    return (
                      <Fragment key={profile.id}>
                        <tr className={isExpanded ? styles.rowActive : ""}>
                          <td>
                            <button
                              type="button"
                              className={styles.userButton}
                              onClick={() => toggleUserDetails(profile.id)}
                              aria-expanded={isExpanded}
                            >
                              <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}>
                                ›
                              </span>
                              <span>
                                <strong>{profile.name || "Без имени"}</strong>
                                <code>{profile.id}</code>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span
                              className={
                                getSubscriptionLabel(profile) === "Free"
                                  ? styles.neutralBadge
                                  : styles.inverseBadge
                              }
                            >
                              {getSubscriptionLabel(profile)}
                            </span>
                            {profile.subscription_expires_at && (
                              <div className={styles.microText}>
                                до {formatShortDate(profile.subscription_expires_at)}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className={styles.activityGroup}>
                              <span className={styles.outlineBadge}>C {profile.cuisines_count || 0}</span>
                              <span className={styles.outlineBadge}>F {profile.favorites_count || 0}</span>
                            </div>
                            <div className={styles.microText}>
                              анкета: {onboarding.completed ? "да" : "нет"}
                            </div>
                          </td>
                          <td>
                            <div className={styles.settingsLine}>
                              <span>{settings.language}</span>
                              <span>{settings.theme}</span>
                              <span>{settings.measurement}</span>
                            </div>
                            <div className={styles.microText}>
                              diets {settings.diets} / allergies {settings.allergies}
                            </div>
                          </td>
                          <td className={styles.mutedCell}>{formatDate(profile.updated_at || profile.created_at)}</td>
                          <td className={styles.actionCell}>
                            <button
                              type="button"
                              className={styles.deleteButton}
                              onClick={() => deleteUser(profile.id, profile.name ?? null)}
                              disabled={deletingUserId === profile.id}
                              title="Удалить аккаунт"
                            >
                              {deletingUserId === profile.id ? "..." : "Delete"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className={styles.detailCell}>
                              {loadingDetails ? (
                                <div className={styles.emptyState}>Загрузка данных пользователя...</div>
                              ) : (
                                <div className={styles.detailsGrid}>
                                  <section className={styles.detailPanel}>
                                    <PanelHeader title="Профиль" count={getSubscriptionLabel(profile)} />
                                    <dl className={styles.definitionList}>
                                      <div>
                                        <dt>ID</dt>
                                        <dd>{profile.id}</dd>
                                      </div>
                                      <div>
                                        <dt>Создан</dt>
                                        <dd>{formatDate(profile.created_at)}</dd>
                                      </div>
                                      <div>
                                        <dt>Обновлен</dt>
                                        <dd>{formatDate(profile.updated_at)}</dd>
                                      </div>
                                      <div>
                                        <dt>Язык</dt>
                                        <dd>{settings.language}</dd>
                                      </div>
                                      <div>
                                        <dt>Тема</dt>
                                        <dd>{settings.theme}</dd>
                                      </div>
                                      <div>
                                        <dt>Единицы</dt>
                                        <dd>{settings.measurement}</dd>
                                      </div>
                                    </dl>
                                  </section>

                                  <section className={styles.detailPanel}>
                                    <PanelHeader title="Каталоги" count={String(userCuisines.length)} />
                                    <EntityList empty="Нет каталогов">
                                      {userCuisines.map((cuisine) => (
                                        <EntityItem
                                          key={cuisine.id}
                                          title={cuisine.name || "Без названия"}
                                          meta={`${cuisine.status || "status"} / ${shortId(cuisine.id)}`}
                                        />
                                      ))}
                                    </EntityList>
                                  </section>

                                  <section className={styles.detailPanel}>
                                    <PanelHeader title="Избранное" count={String(userFavorites.length)} />
                                    <EntityList empty="Нет избранных рецептов">
                                      {userFavorites.map((favorite) => (
                                        <button
                                          key={favorite.recipe_id}
                                          type="button"
                                          className={styles.entityButton}
                                          onClick={() => openRecipeModal(favorite.recipe_id)}
                                        >
                                          <span>{favorite.recipe?.title || "Рецепт не найден"}</span>
                                          <small>
                                            {shortId(favorite.recipe_id)}
                                            {favorite.added_at ? ` / ${formatShortDate(favorite.added_at)}` : ""}
                                          </small>
                                        </button>
                                      ))}
                                    </EntityList>
                                  </section>

                                  <section className={styles.detailPanel}>
                                    <PanelHeader title="Рецепты" count={String(userRecipes.length)} />
                                    <EntityList empty="Нет рецептов">
                                      {userRecipes.map((recipe) => (
                                        <button
                                          key={recipe.id}
                                          type="button"
                                          className={styles.entityButton}
                                          onClick={() => openRecipeModal(recipe.id)}
                                        >
                                          <span>{recipe.title || "Без названия"}</span>
                                          <small>
                                            {recipe.cuisine?.name || "без каталога"}
                                            {recipe.cook_time ? ` / ${recipe.cook_time} мин` : ""}
                                          </small>
                                        </button>
                                      ))}
                                    </EntityList>
                                  </section>

                                  <section className={`${styles.detailPanel} ${styles.onboardingPanel}`}>
                                    <PanelHeader
                                      title="Анкета"
                                      count={onboarding.completed ? "Заполнена" : "Не заполнена"}
                                    />
                                    <dl className={styles.definitionGrid}>
                                      <div>
                                        <dt>Уровень</dt>
                                        <dd>{onboarding.cookingLevel}</dd>
                                      </div>
                                      <div>
                                        <dt>Время</dt>
                                        <dd>{onboarding.cookingTime}</dd>
                                      </div>
                                      <div>
                                        <dt>Ограничения</dt>
                                        <dd>{onboarding.dietaryRestriction}</dd>
                                      </div>
                                      <div>
                                        <dt>Приоритет</dt>
                                        <dd>{onboarding.cookingPriority}</dd>
                                      </div>
                                      <div>
                                        <dt>Кухня</dt>
                                        <dd>{onboarding.cuisinePreference}</dd>
                                      </div>
                                      <div>
                                        <dt>Стиль питания</dt>
                                        <dd>{onboarding.mealStyle}</dd>
                                      </div>
                                      <div>
                                        <dt>Домохозяйство</dt>
                                        <dd>{onboarding.householdSize}</dd>
                                      </div>
                                      {onboarding.giftedCatalogId && (
                                        <div>
                                          <dt>Каталог в подарок</dt>
                                          <dd>{shortId(onboarding.giftedCatalogId)}</dd>
                                        </div>
                                      )}
                                    </dl>
                                    {onboarding.priorities.length > 0 && (
                                      <div className={styles.badgeList}>
                                        {onboarding.priorities.map((priority: string) => (
                                          <span key={priority} className={styles.neutralBadge}>
                                            {priority}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </section>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!loading && profiles.length > 0 && canLoadMore && (
        <div className={styles.loadMoreWrap}>
          <button type="button" className={styles.secondaryButton} onClick={() => loadProfiles(page + 1, false, search)}>
            Загрузить ещё
          </button>
        </div>
      )}

      {(selectedRecipe || loadingRecipe) && (
        <RecipeModal
          recipe={selectedRecipe}
          loading={loadingRecipe}
          onClose={closeRecipeModal}
        />
      )}
    </div>
  );
}

function PanelHeader({ title, count }: { title: string; count: string }) {
  return (
    <div className={styles.panelHeader}>
      <h3>{title}</h3>
      <span className={styles.neutralBadge}>{count}</span>
    </div>
  );
}

function EntityList({ children, empty }: { children: React.ReactNode; empty: string }) {
  return <div className={styles.entityList}>{children || <div className={styles.panelEmpty}>{empty}</div>}</div>;
}

function EntityItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className={styles.entityItem}>
      <span>{title}</span>
      <small>{meta}</small>
    </div>
  );
}

function RecipeModal({
  recipe,
  loading,
  onClose,
}: {
  recipe: any;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        {loading ? (
          <div className={styles.emptyState}>Загрузка рецепта...</div>
        ) : recipe ? (
          <>
            {recipe.image_url && (
              <img className={styles.recipeImage} src={recipe.image_url} alt={recipe.title} />
            )}

            <div className={styles.recipeBody}>
              <div className={styles.recipeHeader}>
                <div>
                  <p className={styles.kicker}>Recipe</p>
                  <h2>{recipe.title}</h2>
                </div>
                <div className={styles.recipeMeta}>
                  {recipe.cook_time && <span className={styles.neutralBadge}>{recipe.cook_time} мин</span>}
                  {recipe.difficulty && <span className={styles.outlineBadge}>{recipe.difficulty}</span>}
                  {recipe.servings && <span className={styles.outlineBadge}>{recipe.servings} порций</span>}
                </div>
              </div>

              {recipe.description && (
                <section className={styles.recipeSection}>
                  <h3>Описание</h3>
                  <p>{recipe.description}</p>
                </section>
              )}

              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <section className={styles.recipeSection}>
                  <h3>Ингредиенты</h3>
                  <div className={styles.ingredientList}>
                    {recipe.ingredients.map((ingredient: any, index: number) => (
                      <div key={`${ingredient.name}-${index}`} className={styles.ingredientRow}>
                        <span>{ingredient.name}</span>
                        <strong>
                          {ingredient.amount} {ingredient.unit}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {recipe.instructions && recipe.instructions.length > 0 && (
                <section className={styles.recipeSection}>
                  <h3>Инструкция</h3>
                  <ol className={styles.instructionList}>
                    {recipe.instructions.map((step: any, index: number) => (
                      <li key={index}>
                        <span>{index + 1}</span>
                        <p>{step.text || step}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
