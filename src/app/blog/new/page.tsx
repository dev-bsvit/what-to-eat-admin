"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface Category {
  id: string;
  name: string;
}

interface Author {
  id: string;
  name: string;
}

export default function NewBlogPostPage() {
  const router = useRouter();
  const [languageCode, setLanguageCode] = useState("ru");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [authorId, setAuthorId] = useState("");
  const [authors, setAuthors] = useState<Author[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/blog/categories?language_code=${languageCode}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [languageCode]);

  useEffect(() => {
    fetch("/api/admin/blog/authors")
      .then((res) => res.json())
      .then((data) => setAuthors(data.authors ?? []))
      .catch(() => setAuthors([]));
  }, []);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !slug.trim()) {
      setError("Заполните заголовок и slug");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: languageCode,
          title,
          slug,
          category_id: categoryId || null,
          author_id: authorId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать статью");
        return;
      }
      router.push(`/blog/${data.id}`);
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
        <h1 className="section-title">Новая статья</h1>
        <p className="section-subtitle">Заполните основное — текст и SEO допишете на следующем экране.</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card" style={{ cursor: "default" }}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Язык публикации</label>
          <select className="input" value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Заголовок</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Как приготовить идеальный борщ"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Slug (URL)</label>
          <input
            className="input"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13 }}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="kak-prigotovit-borsch"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Категория</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Автор</label>
          <select className="input" value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
            <option value="">Без указания автора</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {authors.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Авторов пока нет — создайте на странице «Авторы».
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%" }}>
          {saving ? "Создаём…" : "Создать и продолжить"}
        </button>
      </form>
    </div>
  );
}
