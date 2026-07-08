"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import styles from "../blog.module.css";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface Tag {
  id: string;
  slug: string;
  name: string;
}

export default function BlogTagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blog/tags");
      const data = await res.json();
      setTags(data.tags ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Укажите название тега");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slugify(name), translations: { ru: name.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать тег");
        return;
      }
      setName("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Link href="/blog" className="breadcrumb-item" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} />
        К списку статей
      </Link>

      <div className="section-header">
        <h1 className="section-title">Теги блога</h1>
        <p className="section-subtitle">Теги — свободная навигация по темам, в отличие от единственной категории статьи.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: веганское"
        />
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ whiteSpace: "nowrap" }}>
          <Plus size={18} />
          {saving ? "Создаём…" : "Добавить"}
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Slug</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className={styles.emptyCell}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!loading && tags.length === 0 && (
              <tr>
                <td colSpan={2} className={styles.emptyCell}>
                  Тегов пока нет.
                </td>
              </tr>
            )}
            {!loading &&
              tags.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{t.slug}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
