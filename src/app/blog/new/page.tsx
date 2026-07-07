"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function NewBlogPostPage() {
  const router = useRouter();
  const [languageCode, setLanguageCode] = useState("ru");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/blog/categories?language_code=${languageCode}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [languageCode]);

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
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Новая статья</h1>
      <p className="text-sm text-gray-500 mb-6">
        Заполните основное — текст и SEO допишете на следующем экране.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Язык публикации</label>
          <select
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Заголовок</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Как приготовить идеальный борщ"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="kak-prigotovit-borsch"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
          >
            <option value="">Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium shadow-lg shadow-pink-500/25 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Создаём…" : "Создать и продолжить"}
        </button>
      </form>
    </div>
  );
}
