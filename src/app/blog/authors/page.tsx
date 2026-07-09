"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, X } from "lucide-react";
import styles from "../blog.module.css";

interface Author {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  bio: string | null;
  profile_url: string | null;
  avatar_url: string | null;
}

interface AuthorForm {
  slug: string;
  name: string;
  title: string;
  bio: string;
  profile_url: string;
  avatar_url: string;
}

const emptyForm: AuthorForm = { slug: "", name: "", title: "", bio: "", profile_url: "", avatar_url: "" };

export default function BlogAuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AuthorForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AuthorForm>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blog/authors");
      const data = await res.json();
      setAuthors(data.authors ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!slugTouched) setForm((f) => ({ ...f, slug: f.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-") }));
  }, [form.name, slugTouched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Укажите имя автора");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || undefined,
          title: form.title || null,
          bio: form.bio || null,
          profile_url: form.profile_url || null,
          avatar_url: form.avatar_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать автора");
        return;
      }
      setForm(emptyForm);
      setSlugTouched(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (author: Author) => {
    setEditingId(author.id);
    setEditError(null);
    setEditForm({
      slug: author.slug,
      name: author.name,
      title: author.title ?? "",
      bio: author.bio ?? "",
      profile_url: author.profile_url ?? "",
      avatar_url: author.avatar_url ?? "",
    });
  };

  const saveEdit = async (id: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/blog/authors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          slug: editForm.slug,
          title: editForm.title || null,
          bio: editForm.bio || null,
          profile_url: editForm.profile_url || null,
          avatar_url: editForm.avatar_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Не удалось сохранить автора");
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
        <h1 className="section-title">Авторы блога</h1>
        <p className="section-subtitle">
          Именованный автор со ссылкой на профиль — важный сигнал E-E-A-T для Google и AI-поисковиков. У каждого автора есть собственная
          страница на сайте (/автор/slug), на неё ссылается имя автора под статьёй.
        </p>
      </div>

      <div className={styles.tableWrap} style={{ marginBottom: 32 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Slug</th>
              <th>Роль / регалии</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!loading && authors.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  Авторов пока нет — создайте первого ниже.
                </td>
              </tr>
            )}
            {!loading &&
              editingId === null &&
              authors.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{a.slug}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{a.title || "—"}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => startEdit(a)}>
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
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Редактирование автора</h2>
            <button type="button" className="icon-button" onClick={() => setEditingId(null)} aria-label="Отмена">
              <X size={18} />
            </button>
          </div>

          {editError && <div className="form-error">{editError}</div>}

          <div className="form-group">
            <label className="form-label">Имя *</label>
            <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Slug (URL страницы автора)</label>
            <input
              className="input"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
              value={editForm.slug}
              onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Роль / регалии</label>
            <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Короткая биография</label>
            <textarea className="input" rows={3} value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Ссылка на профиль (сайт, LinkedIn и т.п.)</label>
            <input
              className="input"
              value={editForm.profile_url}
              onChange={(e) => setEditForm({ ...editForm, profile_url: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">URL фото</label>
            <input className="input" value={editForm.avatar_url} onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })} />
          </div>

          <button type="button" className="btn btn-primary" disabled={editSaving} onClick={() => saveEdit(editingId)}>
            <Save size={18} />
            {editSaving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="app-card" style={{ cursor: "default" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Новый автор</h2>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Имя *</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Анна Смирнова" />
        </div>

        <div className="form-group">
          <label className="form-label">Slug (URL страницы автора)</label>
          <input
            className="input"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: e.target.value });
            }}
            placeholder="anna-smirnova"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Роль / регалии</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Шеф-повар, нутрициолог"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Короткая биография</label>
          <textarea
            className="input"
            rows={3}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="10 лет опыта в ресторанной кухне, автор книги о здоровом питании…"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Ссылка на профиль (сайт, LinkedIn и т.п.)</label>
          <input className="input" value={form.profile_url} onChange={(e) => setForm({ ...form, profile_url: e.target.value })} placeholder="https://..." />
        </div>

        <div className="form-group">
          <label className="form-label">URL фото</label>
          <input className="input" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." />
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Plus size={18} />
          {saving ? "Создаём…" : "Создать автора"}
        </button>
      </form>
    </div>
  );
}
