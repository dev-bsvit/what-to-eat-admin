"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import styles from "@/app/blog/blog.module.css";

interface BlogEditorProps {
  content: JSONContent | null;
  onChange: (json: JSONContent, html: string) => void;
  slugHint?: string;
}

function ToolbarButton({
  onClick,
  active,
  label,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${styles.editorToolbarButton} ${active ? styles.isActive : ""}`}
    >
      {label}
    </button>
  );
}

export default function BlogEditor({ content, onChange, slugHint }: BlogEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Начните писать статью…" }),
      Image,
      Link.configure({ openOnClick: false }),
    ],
    content: content && Object.keys(content).length > 0 ? content : "",
    editorProps: {
      attributes: {
        class: styles.editorContent,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON(), editor.getHTML());
    },
    onCreate: ({ editor }) => {
      // Ensures content_html is populated even if the user saves without
      // making any further edits (onUpdate only fires on actual changes).
      onChange(editor.getJSON(), editor.getHTML());
    },
  });

  const handleImageFile = async (file: File) => {
    if (!editor) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "content");
      formData.append("slug_hint", slugHint || "post");
      const res = await fetch("/api/admin/blog/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
      }
    } finally {
      setUploadingImage(false);
    }
  };

  if (!editor) return null;

  return (
    <div className={styles.editorShell}>
      <div className={styles.editorToolbar}>
        <ToolbarButton label="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton label="H3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolbarButton label="Жирный" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="Курсив" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="Список" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="Нумерация" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="Цитата" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton
          label="Ссылка"
          active={editor.isActive("link")}
          onClick={() => {
            const url = window.prompt("URL ссылки");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        />
        <ToolbarButton
          label={uploadingImage ? "Загружаем…" : "Изображение"}
          disabled={uploadingImage}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
