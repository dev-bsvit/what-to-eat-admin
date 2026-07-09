"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, X } from "lucide-react";
import styles from "../blog.module.css";

const languages = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "uk", label: "Українська" },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface Category {
  id: string;
  slug: string;
  name: string;
  translations: Record<string, { name: string; description: string | null }>;
}

export default function BlogCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({ ru: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editNames, setEditNames] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blog/categories");
      const data = await res.json();
      setCategories(data.categories ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(names.ru || ""));
  }, [names.ru, slugTouched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const translations = Object.fromEntries(
      Object.entries(names)
        .filter(([, name]) => name.trim())
        .map(([code, name]) => [code, { name: name.trim() }])
    );
    if (!slug.trim() || Object.keys(translations).length === 0) {
      setError("Укажите slug и хотя бы одно название (например, на русском)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, translations }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать категорию");
        return;
      }
      setNames({ ru: "" });
      setSlug("");
      setSlugTouched(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditSlug(category.slug);
    setEditError(null);
    setEditNames(Object.fromEntries(languages.map((l) => [l.code, category.translations[l.code]?.name ?? ""])));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = async (id: string) => {
    setEditError(null);
    const translations = Object.fromEntries(
      Object.entries(editNames)
        .filter(([, name]) => name.trim())
        .map(([code, name]) => [code, { name: name.trim() }])
    );
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/blog/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: editSlug, translations }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Не удалось сохранить категорию");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/blog" className="breadcrumb-item" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} />
        К списку статей
      </Link>

      <div className="section-header">
        <h1 className="section-title">Категории блога</h1>
        <p className="section-subtitle">
          Категории используются для навигации по темам на публичном блоге. Один slug на все языки — при переименовании старый адрес
          автоматически редиректится на новый.
        </p>
      </div>

      <div className={styles.tableWrap} style={{ marginBottom: 32 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Slug</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className={styles.emptyCell}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!loading && categories.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.emptyCell}>
                  Категорий пока нет — создайте первую ниже.
                </td>
              </tr>
            )}
            {!loading &&
              editingId === null &&
              categories.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{c.slug}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => startEdit(c)}>
                      Редактировать
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="app-card" style={{ cursor: "default", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Редактирование категории</h2>
            <button type="button" className="icon-button" onClick={cancelEdit} aria-label="Отмена">
              <X size={18} />
            </button>
          </div>

          {editError && <div className="form-error">{editError}</div>}

          <div className="form-group">
            <label className="form-label">Slug (URL, общий для всех языков)</label>
            <input
              className="input"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {languages.map((l) => (
              <div className="form-group" key={l.code} style={{ marginBottom: 0 }}>
                <label className="form-label">{l.label}</label>
                <input
                  className="input"
                  value={editNames[l.code] ?? ""}
                  onChange={(e) => setEditNames({ ...editNames, [l.code]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={editSaving}
            style={{ marginTop: 20 }}
            onClick={() => saveEdit(editingId)}
          >
            <Save size={18} />
            {editSaving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="app-card" style={{ cursor: "default" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Новая категория</h2>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Slug (URL)</label>
          <input
            className="input"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="vegetarian-recipes"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {languages.map((l) => (
            <div className="form-group" key={l.code} style={{ marginBottom: 0 }}>
              <label className="form-label">{l.label}</label>
              <input
                className="input"
                value={names[l.code] ?? ""}
                onChange={(e) => setNames({ ...names, [l.code]: e.target.value })}
                placeholder={l.code === "ru" ? "Вегетарианские рецепты" : ""}
              />
            </div>
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 20 }}>
          <Plus size={18} />
          {saving ? "Создаём…" : "Создать категорию"}
        </button>
      </form>
    </div>
  );
}
