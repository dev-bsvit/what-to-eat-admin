"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ImportedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  cuisine?: string;
  tags: string[];
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    note?: string;
  }>;
  steps: Array<{ text: string }>;
  sourceUrl: string;
  sourceDomain?: string;
  confidence: "high" | "medium" | "low";
}

interface ImportResult {
  recipe: ImportedRecipe;
  meta: {
    method: string;
    timestamp: string;
  };
}

function InstagramImportContent() {
  const searchParams = useSearchParams();
  const cuisineId = searchParams.get("cuisine_id") || "";
  const importBase = process.env.NEXT_PUBLIC_IMPORT_API_BASE || "";
  const instagramApi = importBase ? `${importBase}/api/import-instagram` : "/api/import-instagram";
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSaveMessage(null);

    try {
      const response = await fetch(instagramApi, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || "Ошибка импорта");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecipe = async () => {
    if (!result?.recipe) return;

    setSaving(true);
    setSaveMessage(null);

    const payload = {
      title: result.recipe.title,
      description: result.recipe.description || null,
      image_url: result.recipe.imageUrl || null,
      cuisine_id: cuisineId || null,
      servings: result.recipe.servings ?? null,
      prep_time: result.recipe.prepTime ?? null,
      cook_time: result.recipe.cookTime ?? null,
      cuisine_tags: result.recipe.tags,
      ingredients: result.recipe.ingredients.map((item) => ({
        name: item.name,
        quantity: item.amount,
        unit: item.unit,
        note: item.note || null,
      })),
      instructions: result.recipe.steps.map((step) => ({
        text: step.text,
      })),
    };

    try {
      const response = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveMessage(data.error || "Ошибка при сохранении рецепта");
        return;
      }

      setSaveMessage("Рецепт создан ✅");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "8px" }}>
        Импорт из Instagram
      </h1>
      <p style={{ color: "#666", marginBottom: "32px" }}>
        Вставьте ссылку на публичный Reels или пост с рецептом
      </p>

      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: "16px",
              border: "2px solid #e5e7eb",
              borderRadius: "8px",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImport();
            }}
          />
          <button
            onClick={handleImport}
            disabled={loading || !url.trim()}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: "600",
              color: "white",
              background: loading || !url.trim() ? "#9ca3af" : "#111827",
              border: "none",
              borderRadius: "8px",
              cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Загрузка..." : "Импортировать"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "16px",
            background: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            marginBottom: "24px",
          }}
        >
          <p style={{ color: "#991b1b", fontWeight: "600", marginBottom: "4px" }}>
            ❌ Ошибка
          </p>
          <p style={{ color: "#991b1b", fontSize: "14px" }}>{error}</p>
        </div>
      )}

      {result && (
        <div style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "12px" }}>
            Результат
          </h2>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
            <button
              onClick={handleCreateRecipe}
              disabled={saving}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "600",
                color: "white",
                background: saving ? "#9ca3af" : "#16a34a",
                border: "none",
                borderRadius: "8px",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Сохранение..." : "Создать рецепт"}
            </button>
            {cuisineId && (
              <span style={{ fontSize: "12px", color: "#6b7280" }}>
                Каталог: {cuisineId}
              </span>
            )}
            {saveMessage && (
              <span style={{ fontSize: "14px", color: saveMessage.includes("✅") ? "#16a34a" : "#dc2626" }}>
                {saveMessage}
              </span>
            )}
          </div>
          <pre
            style={{
              background: "#111827",
              color: "#e5e7eb",
              padding: "16px",
              borderRadius: "8px",
              whiteSpace: "pre-wrap",
              fontSize: "13px",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function InstagramImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px" }}>Загрузка...</div>}>
      <InstagramImportContent />
    </Suspense>
  );
}
