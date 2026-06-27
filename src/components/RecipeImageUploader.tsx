"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Loader2, Upload } from "lucide-react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  cuisineId: string;
  recipeTitle: string;
  kind?: "cover" | "step";
  stepNumber?: number;
  label?: string;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const imageFromPaste = (items: DataTransferItemList) => {
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
};

const imageFromClipboard = async (items: ClipboardItem[]) => {
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (imageType) return await item.getType(imageType);
  }
  return null;
};

export default function RecipeImageUploader({
  value,
  onChange,
  cuisineId,
  recipeTitle,
  kind = "cover",
  stepNumber,
  label = "Изображение",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  const upload = async (file: File | Blob | null) => {
    if (!file || uploading) return;
    if (!cuisineId) {
      setStatus("Сначала выберите каталог");
      return;
    }

    setUploading(true);
    setStatus("Сжимаем и загружаем...");

    try {
      const body = new FormData();
      body.set("file", file, file instanceof File ? file.name : "clipboard-image.png");
      body.set("cuisine_id", cuisineId);
      body.set("recipe_title", recipeTitle || "recipe");
      body.set("kind", kind);
      if (stepNumber) body.set("step_number", String(stepNumber));

      const response = await fetch("/api/admin/imagekit/upload", {
        method: "POST",
        body,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Ошибка загрузки");
      }

      onChange(result.url);
      setStatus(`${formatBytes(result.original_bytes)} → ${formatBytes(result.output_bytes)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const handlePasteEvent = (event: React.ClipboardEvent) => {
    const image = imageFromPaste(event.clipboardData.items);
    if (image) {
      event.preventDefault();
      void upload(image);
    }
  };

  const readClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const image = await imageFromClipboard(items);
      if (!image) {
        setStatus("В буфере нет изображения");
        pasteZoneRef.current?.focus();
        return;
      }
      await upload(image);
    } catch {
      setStatus("Нажмите Ctrl+V или Cmd+V");
      pasteZoneRef.current?.focus();
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</label>
      <div
        ref={pasteZoneRef}
        tabIndex={0}
        onPaste={handlePasteEvent}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload(Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/")) || null);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: value ? "88px minmax(0, 1fr)" : "1fr",
          gap: 12,
          alignItems: "center",
          minHeight: 88,
          padding: 10,
          border: "1px dashed var(--border-medium, #b9bec8)",
          borderRadius: 8,
          background: "var(--bg-base, #fff)",
          outline: "none",
        }}
      >
        {value && (
          <img
            src={value}
            alt=""
            style={{ width: 88, height: 68, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border-light)" }}
          />
        )}
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" type="button" onClick={() => void readClipboard()} onPaste={handlePasteEvent} disabled={uploading}>
              {uploading ? <Loader2 size={15} /> : <ClipboardPaste size={15} />}
              Вставить
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <ImagePlus size={15} />
              Выбрать
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: "var(--text-secondary)", fontSize: 12 }}>
            <Upload size={13} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status || "Ctrl+V / Cmd+V"}
            </span>
          </div>
        </div>
      </div>
      <input
        className="input"
        type="url"
        placeholder="https://ik.imagekit.io/..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
