"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/react";
import { ArrowLeft } from "lucide-react";
import styles from "../blog.module.css";

const BlogEditor = dynamic(() => import("@/components/BlogEditor"), { ssr: false });

interface Translation {
  language_code: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_json: JSONContent;
  meta_title: string | null;
  meta_description: string | null;
  is_machine_translated: boolean;
}

interface PostDetail {
  id: string;
  status: string;
  source: string;
  category_id: string | null;
  translations: Translation[];
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
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const switchLanguage = (languageCode: string) => {
    setActiveLanguage(languageCode);
    const existing = post?.translations.find((t) => t.language_code === languageCode);
    setDraft(existing ?? emptyTranslation(languageCode));
  };

  const save = async (overrides?: Partial<{ status: string }>) => {
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
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          ...overrides,
        }),
      });
      if (res.ok) {
        setSavedAt(new Date());
        if (overrides?.status) await load();
      }
    } finally {
      setSaving(false);
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
        onChange={(json) => setDraft((prev) => (prev ? { ...prev, content_json: json } : prev))}
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
