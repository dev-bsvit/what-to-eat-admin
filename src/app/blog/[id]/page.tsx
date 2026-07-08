"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/react";
import { ArrowLeft, ImageUp, X } from "lucide-react";
import styles from "../blog.module.css";

const BlogEditor = dynamic(() => import("@/components/BlogEditor"), { ssr: false });

interface Translation {
  language_code: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_json: JSONContent;
  content_html: string | null;
  meta_title: string | null;
  meta_description: string | null;
  is_machine_translated: boolean;
}

interface PostDetail {
  id: string;
  status: string;
  source: string;
  category_id: string | null;
  author_id: string | null;
  recipe_id: string | null;
  cover_image_url: string | null;
  translations: Translation[];
}

interface Category {
  id: string;
  name: string;
}

interface Author {
  id: string;
  name: string;
}

interface RecipeOption {
  id: string;
  title: string;
}

const statusOptions = [
  { value: "draft", label: "Черновик" },
  { value: "in_review", label: "На проверке" },
  { value: "published", label: "Опубликована" },
  { value: "archived", label: "В архиве" },
];

function emptyTranslation(languageCode: string): Translation {
  return {
    language_code: languageCode,
    slug: "",
    title: "",
    excerpt: null,
    content_json: {},
    content_html: null,
    meta_title: null,
    meta_description: null,
    is_machine_translated: false,
  };
}

export default function BlogPostEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [activeLanguage, setActiveLanguage] = useState("ru");
  const [draft, setDraft] = useState<Translation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [linkedRecipe, setLinkedRecipe] = useState<RecipeOption | null>(null);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeResults, setRecipeResults] = useState<RecipeOption[]>([]);
  const [recipeSearching, setRecipeSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blog/posts/${params.id}`);
      const data = await res.json();
      if (res.ok) {
        setPost(data.post);
        const first = data.post.translations?.[0]?.language_code ?? "ru";
        setActiveLanguage(first);
        setDraft(data.post.translations?.find((t: Translation) => t.language_code === first) ?? emptyTranslation(first));

        if (data.post.recipe_id) {
          const recipeRes = await fetch(`/api/admin/recipes?id=${data.post.recipe_id}`);
          const recipeData = await recipeRes.json();
          const recipe = Array.isArray(recipeData?.data) ? recipeData.data[0] : null;
          if (recipe?.id) setLinkedRecipe({ id: recipe.id, title: recipe.title });
        } else {
          setLinkedRecipe(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/blog/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
    fetch("/api/admin/blog/authors")
      .then((res) => res.json())
      .then((data) => setAuthors(data.authors ?? []))
      .catch(() => setAuthors([]));
  }, []);

  useEffect(() => {
    if (!recipeQuery.trim()) {
      setRecipeResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setRecipeSearching(true);
      try {
        const res = await fetch(`/api/admin/recipes/list?title=${encodeURIComponent(recipeQuery)}&limit=8`);
        const data = await res.json();
        setRecipeResults(Array.isArray(data) ? data : []);
      } finally {
        setRecipeSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [recipeQuery]);

  const switchLanguage = (languageCode: string) => {
    setActiveLanguage(languageCode);
    const existing = post?.translations.find((t) => t.language_code === languageCode);
    setDraft(existing ?? emptyTranslation(languageCode));
  };

  const save = async (
    overrides?: Partial<{
      status: string;
      cover_image_url: string | null;
      category_id: string | null;
      author_id: string | null;
      recipe_id: string | null;
    }>
  ) => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/blog/posts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: activeLanguage,
          title: draft.title,
          slug: draft.slug,
          excerpt: draft.excerpt,
          content_json: draft.content_json,
          content_html: draft.content_html,
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          ...overrides,
        }),
      });
      if (res.ok) {
        setSavedAt(new Date());
        if (overrides) await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "cover");
      formData.append("slug_hint", draft?.slug || "post");
      const res = await fetch("/api/admin/blog/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        await save({ cover_image_url: data.url });
      }
    } finally {
      setUploadingCover(false);
    }
  };

  if (loading || !post || !draft) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--text-secondary)" }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <Link href="/blog" className="breadcrumb-item" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} />
        К списку статей
      </Link>

      <div className={styles.editorBar}>
        <div className={styles.langTabs}>
          {post.translations.map((t) => (
            <button
              key={t.language_code}
              type="button"
              className={`${styles.langTab} ${activeLanguage === t.language_code ? styles.isActive : ""}`}
              onClick={() => switchLanguage(t.language_code)}
            >
              {t.language_code}
            </button>
          ))}
        </div>

        <div className={styles.editorBarActions}>
          {savedAt && <span className={styles.savedHint}>Сохранено в {savedAt.toLocaleTimeString("ru-RU")}</span>}
          <select className="input" style={{ width: "auto", height: 38 }} value={post.status} onChange={(e) => save({ status: e.target.value })}>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="form-group">
        {post.cover_image_url ? (
          <div className={styles.coverPreview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover_image_url} alt="Обложка статьи" className={styles.coverPreviewImg} />
            <button
              type="button"
              className="icon-button"
              onClick={() => save({ cover_image_url: null })}
              aria-label="Удалить обложку"
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className={styles.coverUpload}>
            <ImageUp size={20} />
            {uploadingCover ? "Загружаем…" : "Загрузить обложку"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploadingCover}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoverUpload(file);
              }}
            />
          </label>
        )}
      </div>

      <div className={styles.metaGrid} style={{ marginBottom: 0 }}>
        <div className="form-group">
          <label className="form-label">Категория</label>
          <select
            className="input"
            value={post.category_id ?? ""}
            onChange={(e) => save({ category_id: e.target.value || null })}
          >
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
          <select
            className="input"
            value={post.author_id ?? ""}
            onChange={(e) => save({ author_id: e.target.value || null })}
          >
            <option value="">Без указания автора</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Связанный рецепт (для Recipe-разметки в schema.org)</label>
        {linkedRecipe ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="input" style={{ display: "flex", alignItems: "center", flex: 1 }}>
              {linkedRecipe.title}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setLinkedRecipe(null);
                save({ recipe_id: null });
              }}
              aria-label="Отвязать рецепт"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className={styles.recipeSearch}>
            <input
              className="input"
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
              placeholder="Поиск рецепта по названию…"
            />
            {recipeQuery.trim() && (
              <div className={styles.recipeSearchResults}>
                {recipeSearching && <div className={styles.recipeSearchEmpty}>Ищем…</div>}
                {!recipeSearching && recipeResults.length === 0 && (
                  <div className={styles.recipeSearchEmpty}>Ничего не найдено</div>
                )}
                {!recipeSearching &&
                  recipeResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={styles.recipeSearchResultItem}
                      onClick={() => {
                        setLinkedRecipe(r);
                        setRecipeQuery("");
                        setRecipeResults([]);
                        save({ recipe_id: r.id });
                      }}
                    >
                      {r.title}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="form-group">
        <input
          className={`input ${styles.editorTitleInput}`}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Заголовок"
        />
      </div>

      <div className="form-group">
        <input
          className={`input ${styles.editorSlugInput}`}
          value={draft.slug}
          onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          placeholder="slug"
        />
      </div>

      <div className="form-group">
        <textarea
          className="input"
          value={draft.excerpt ?? ""}
          onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
          placeholder="Краткое описание (excerpt) — используется в ленте и превью"
          rows={2}
        />
      </div>

      <BlogEditor
        content={draft.content_json}
        onChange={(json, html) => setDraft((prev) => (prev ? { ...prev, content_json: json, content_html: html } : prev))}
        slugHint={draft.slug}
      />

      <div className={styles.metaGrid}>
        <div className="form-group">
          <label className="form-label">Meta title (SEO)</label>
          <input
            className="input"
            value={draft.meta_title ?? ""}
            onChange={(e) => setDraft({ ...draft, meta_title: e.target.value })}
            maxLength={60}
          />
          <span className={styles.charCount}>{(draft.meta_title ?? "").length}/60</span>
        </div>
        <div className="form-group">
          <label className="form-label">Meta description (SEO)</label>
          <input
            className="input"
            value={draft.meta_description ?? ""}
            onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })}
            maxLength={160}
          />
          <span className={styles.charCount}>{(draft.meta_description ?? "").length}/160</span>
        </div>
      </div>
    </div>
  );
}
