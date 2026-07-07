"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/react";
import { ArrowLeft } from "lucide-react";

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
    return <div className="p-6 text-gray-400">Загрузка…</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-500 mb-4">
        <ArrowLeft className="w-4 h-4" />К списку статей
      </Link>

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {post.translations.map((t) => (
            <button
              key={t.language_code}
              onClick={() => switchLanguage(t.language_code)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium uppercase ${
                activeLanguage === t.language_code
                  ? "bg-pink-500 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {t.language_code}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-gray-400">Сохранено в {savedAt.toLocaleTimeString("ru-RU")}</span>}
          <select
            value={post.status}
            onChange={(e) => save({ status: e.target.value })}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
          >
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => save()}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium shadow-lg shadow-pink-500/25 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Заголовок"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-xl font-semibold"
        />

        <input
          value={draft.slug}
          onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          placeholder="slug"
          className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-mono text-gray-500"
        />

        <textarea
          value={draft.excerpt ?? ""}
          onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
          placeholder="Краткое описание (excerpt) — используется в ленте и превью"
          rows={2}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm"
        />

        <BlogEditor
          content={draft.content_json}
          onChange={(json) => setDraft((prev) => (prev ? { ...prev, content_json: json } : prev))}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Meta title (SEO)</label>
            <input
              value={draft.meta_title ?? ""}
              onChange={(e) => setDraft({ ...draft, meta_title: e.target.value })}
              maxLength={60}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            />
            <span className="text-xs text-gray-400">{(draft.meta_title ?? "").length}/60</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Meta description (SEO)</label>
            <input
              value={draft.meta_description ?? ""}
              onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })}
              maxLength={160}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            />
            <span className="text-xs text-gray-400">{(draft.meta_description ?? "").length}/160</span>
          </div>
        </div>
      </div>
    </div>
  );
}
