"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MissingItem = {
  name: string;
  count: number;
  recipeTitles: string[];
};

type ProductCandidate = {
  id: string;
  canonical_name: string;
  icon?: string;
  image_url?: string;
  category?: string;
};

export default function IngredientsScanPage() {
  const router = useRouter();
  const [items, setItems] = useState<MissingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);

  useEffect(() => {
    void loadMissing();
  }, []);

  async function loadMissing() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/ingredients/missing");
      const result = await response.json();
      if (!response.ok) {
        setStatus(`Ошибка: ${result.error || "не удалось загрузить список"}`);
        setItems([]);
        return;
      }
      setItems(result.items || []);
    } catch (error) {
      setStatus("Ошибка: не удалось подключиться");
    } finally {
      setLoading(false);
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
      setStatus(`Готово ✅ Обновлено рецептов: ${result.updated || 0}`);
      await loadMissing();
    } catch (error) {
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
    } catch (error) {
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

  const filtered = search.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🔍 Несвязанные ингредиенты</h1>
        <p className="section-subtitle">Ингредиенты в рецептах, которых нет в справочнике продуктов</p>
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
          placeholder="Поиск ингредиента..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "240px" }}
        />
        <button className="btn-large btn-secondary" onClick={loadMissing}>
          Обновить список
        </button>
      </div>

      {status && (
        <div style={{ marginBottom: "var(--spacing-lg)", color: "var(--text-secondary)", fontSize: "12px" }}>
          {status}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "var(--spacing-lg)", color: "var(--text-secondary)" }}>
          Сканирую рецепты...
        </div>
      ) : (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          overflow: "hidden",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--text-secondary)" }}>
              Все ингредиенты уже есть в справочнике.
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
                {filtered.map((item) => (
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
                          onClick={() => router.push(`/products?prefill=${encodeURIComponent(item.name)}&return=scan&link=${encodeURIComponent(item.name)}`)}
                        >
                          Добавить продукт
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
      )}
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
                                setLinkTarget(null);
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
              <button className="btn btn-secondary" onClick={() => setLinkTarget(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
