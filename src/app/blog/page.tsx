"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Pencil, Plus, Trash2 } from "lucide-react";
import styles from "./blog.module.css";

interface BlogPostRow {
  id: string;
  status: string;
  source: string;
  title: string;
  slug: string | null;
  category: { id: string; slug: string } | null;
  available_languages: string[];
  updated_at: string;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: styles.pillNeutral },
  in_review: { label: "На проверке", className: "warning" },
  scheduled: { label: "Запланирована", className: styles.pillInfo },
  published: { label: "Опубликована", className: "success" },
  archived: { label: "В архиве", className: styles.pillNeutral },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/blog/posts?${params.toString()}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить статью безвозвратно?")) return;
    const res = await fetch(`/api/admin/blog/posts/${id}`, { method: "DELETE" });
    if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <div className="section-header">
          <h1 className="section-title">Блог</h1>
          <p className="section-subtitle">
            Статьи кулинарного блога — ручное создание. AI-генерация появится на следующем этапе.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/blog/categories" className="btn btn-secondary">
            Категории
          </Link>
          <Link href="/blog/authors" className="btn btn-secondary">
            Авторы
          </Link>
          <Link href="/blog/new" className="btn btn-primary">
            <Plus size={18} />
            Новая статья
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 320 }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по заголовку…"
          />
        </form>
        <select className="input" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(statusLabels).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {!loading && posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Newspaper size={40} style={{ opacity: 0.5 }} />
          </div>
          <div className="empty-state-title">Пока нет статей</div>
          <div className="empty-state-description">Создайте первую статью вручную или из рецепта.</div>
          <Link href="/blog/new" className="btn btn-primary">
            <Plus size={18} />
            Новая статья
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Заголовок</th>
                <th>Статус</th>
                <th>Языки</th>
                <th>Обновлено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    Загрузка…
                  </td>
                </tr>
              )}
              {!loading &&
                posts.map((post) => {
                  const status = statusLabels[post.status] ?? statusLabels.draft;
                  return (
                    <tr key={post.id}>
                      <td>
                        <Link href={`/blog/${post.id}`} className={styles.titleLink}>
                          {post.title}
                        </Link>
                      </td>
                      <td>
                        <span className={`status-pill ${status.className}`}>{status.label}</span>
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase" }}>
                        {post.available_languages.join(", ") || "—"}
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{formatDate(post.updated_at)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link href={`/blog/${post.id}`} className="icon-button" aria-label="Редактировать">
                            <Pencil size={16} />
                          </Link>
                          <button onClick={() => handleDelete(post.id)} className="icon-button" aria-label="Удалить">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
