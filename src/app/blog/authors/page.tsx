"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import styles from "../blog.module.css";

interface Author {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  profile_url: string | null;
}

export default function BlogAuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Укажите имя автора");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          title: title || null,
          bio: bio || null,
          profile_url: profileUrl || null,
          avatar_url: avatarUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать автора");
        return;
      }
      setName("");
      setTitle("");
      setBio("");
      setProfileUrl("");
      setAvatarUrl("");
      await load();
    } finally {
      setSaving(false);
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
          Именованный автор со ссылкой на профиль — важный сигнал E-E-A-T для Google и AI-поисковиков.
          Указывается в разметке schema.org каждой статьи.
        </p>
      </div>

      <div className={styles.tableWrap} style={{ marginBottom: 32 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Роль / регалии</th>
              <th>Профиль</th>
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
            {!loading && authors.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.emptyCell}>
                  Авторов пока нет — создайте первого ниже.
                </td>
              </tr>
            )}
            {!loading &&
              authors.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{a.title || "—"}</td>
                  <td>
                    {a.profile_url ? (
                      <a href={a.profile_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>
                        Ссылка
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="app-card" style={{ cursor: "default" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Новый автор</h2>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Имя *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Анна Смирнова" />
        </div>

        <div className="form-group">
          <label className="form-label">Роль / регалии</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Шеф-повар, нутрициолог"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Короткая биография</label>
          <textarea
            className="input"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="10 лет опыта в ресторанной кухне, автор книги о здоровом питании…"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Ссылка на профиль (сайт, LinkedIn и т.п.)</label>
          <input className="input" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="form-group">
          <label className="form-label">URL фото</label>
          <input className="input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Plus size={18} />
          {saving ? "Создаём…" : "Создать автора"}
        </button>
      </form>
    </div>
  );
}
