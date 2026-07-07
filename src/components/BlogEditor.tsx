"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";

interface BlogEditorProps {
  content: JSONContent | null;
  onChange: (json: JSONContent, html: string) => void;
}

function ToolbarButton({
  onClick,
  active,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-pink-500 text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

export default function BlogEditor({ content, onChange }: BlogEditorProps) {
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
        class:
          "prose prose-neutral max-w-none min-h-[400px] focus:outline-none px-4 py-3",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON(), editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 px-2 py-2 bg-gray-50">
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
