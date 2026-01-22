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
  const [loadingDetails, setLoadingDetails] = useState(false);

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
      // Сначала получаем ID избранных рецептов
      const favoritesRes = await fetch(`/api/admin/favorites?user_id=${userId}`);
      if (favoritesRes.ok) {
        const favoritesData = await favoritesRes.json();
        setUserFavorites(favoritesData.data || []);
      } else {
        setUserFavorites([]);
      }
    } catch (error) {
      console.error("Failed to load user details:", error);
    } finally {
      setLoadingDetails(false);
    }
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
            <table className="table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Каталоги</th>
                  <th>Избранное</th>
                  <th>Настройки</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const settings = extractSettings(profile.settings || {});
                  return (
                    <tr key={profile.id}>
                      <td style={{ fontWeight: 600 }}>
                        {profile.name || "Без имени"}
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                          {profile.id}
                        </div>
                      </td>
                      <td>
                        <div style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 10px",
                          background: "var(--bg-hover)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                          fontWeight: 600
                        }}>
                          <span>📁</span>
                          <span>{profile.cuisines_count || 0}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 10px",
                          background: "var(--bg-hover)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                          fontWeight: 600
                        }}>
                          <span>⭐</span>
                          <span>{profile.favorites_count || 0}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <span>🎨 {settings.theme}</span>
                          <span>🌐 {settings.language}</span>
                          <span>📏 {settings.measurement}</span>
                        </div>
                        <div style={{ marginTop: "4px", opacity: 0.7 }}>
                          🥗 {settings.diets} диет · 🚫 {settings.allergies} аллергий
                        </div>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {formatDate(profile.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}
