"use client";

import { useState } from "react";

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
  steps: Array<{
    text: string;
  }>;
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

export default function TestImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/import-recipe", {
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

  const getConfidenceBadge = (confidence: string) => {
    const styles = {
      high: "background: #10b981; color: white;",
      medium: "background: #f59e0b; color: white;",
      low: "background: #ef4444; color: white;",
    };

    const labels = {
      high: "Высокое качество",
      medium: "Среднее качество",
      low: "Низкое качество",
    };

    return (
      <span
        style={{
          ...Object.fromEntries(
            styles[confidence as keyof typeof styles]
              .split(";")
              .map((s) => s.split(":").map((p) => p.trim()))
          ),
          padding: "4px 12px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "600",
        }}
      >
        {labels[confidence as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "8px" }}>
        Тест импорта рецептов
      </h1>
      <p style={{ color: "#666", marginBottom: "32px" }}>
        Вставьте ссылку на рецепт для проверки работы парсера
      </p>

      {/* Поле ввода URL */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://eda.ru/recepty/..."
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
              background: loading || !url.trim() ? "#9ca3af" : "#667eea",
              border: "none",
              borderRadius: "8px",
              cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Загрузка..." : "Импортировать"}
          </button>
        </div>
      </div>

      {/* Примеры ссылок */}
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#666" }}>
          Примеры для тестирования:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {[
            "https://eda.ru/recepty/pasta/spaghetti-karbonar-31184",
            "https://www.povarenok.ru/recipes/show/167259/",
            "https://gotovim-doma.ru/recipe/6789-borshh-ukrainskij",
          ].map((exampleUrl) => (
            <button
              key={exampleUrl}
              onClick={() => setUrl(exampleUrl)}
              disabled={loading}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                color: "#667eea",
                background: "#eef2ff",
                border: "1px solid #667eea",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {new URL(exampleUrl).hostname}
            </button>
          ))}
        </div>
      </div>

      {/* Ошибка */}
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

      {/* Результат */}
      {result && (
        <div>
          {/* Метаинформация */}
          <div
            style={{
              padding: "16px",
              background: "#f3f4f6",
              borderRadius: "8px",
              marginBottom: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Метод парсинга:</span>
              <span style={{ fontSize: "14px", color: "#667eea" }}>{result.meta.method}</span>
              {getConfidenceBadge(result.recipe.confidence)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Источник:</span>
              <span style={{ fontSize: "14px", color: "#666" }}>{result.recipe.sourceDomain}</span>
            </div>
          </div>

          {/* Основная информация */}
          <div
            style={{
              padding: "24px",
              background: "white",
              border: "2px solid #e5e7eb",
              borderRadius: "12px",
              marginBottom: "24px",
            }}
          >
            <h2 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "16px" }}>
              {result.recipe.title}
            </h2>

            {result.recipe.imageUrl && (
              <img
                src={result.recipe.imageUrl}
                alt={result.recipe.title}
                style={{
                  width: "100%",
                  maxWidth: "600px",
                  height: "auto",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              />
            )}

            {result.recipe.description && (
              <p style={{ color: "#666", marginBottom: "16px", lineHeight: "1.6" }}>
                {result.recipe.description}
              </p>
            )}

            {/* Детали */}
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "16px" }}>
              {result.recipe.prepTime && (
                <div>
                  <span style={{ fontSize: "12px", color: "#999", display: "block" }}>
                    Подготовка
                  </span>
                  <span style={{ fontSize: "16px", fontWeight: "600" }}>
                    {result.recipe.prepTime} мин
                  </span>
                </div>
              )}
              {result.recipe.cookTime && (
                <div>
                  <span style={{ fontSize: "12px", color: "#999", display: "block" }}>
                    Приготовление
                  </span>
                  <span style={{ fontSize: "16px", fontWeight: "600" }}>
                    {result.recipe.cookTime} мин
                  </span>
                </div>
              )}
              {result.recipe.servings && (
                <div>
                  <span style={{ fontSize: "12px", color: "#999", display: "block" }}>Порций</span>
                  <span style={{ fontSize: "16px", fontWeight: "600" }}>
                    {result.recipe.servings}
                  </span>
                </div>
              )}
            </div>

            {/* Теги */}
            {result.recipe.tags.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {result.recipe.tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "4px 12px",
                      background: "#f3f4f6",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ингредиенты */}
          <div
            style={{
              padding: "24px",
              background: "white",
              border: "2px solid #e5e7eb",
              borderRadius: "12px",
              marginBottom: "24px",
            }}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "16px" }}>
              Ингредиенты ({result.recipe.ingredients.length})
            </h3>
            {result.recipe.ingredients.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.recipe.ingredients.map((ing, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "12px 0",
                      borderBottom: i < result.recipe.ingredients.length - 1 ? "1px solid #f3f4f6" : "none",
                    }}
                  >
                    <span style={{ fontWeight: "600", color: "#667eea" }}>
                      {ing.amount} {ing.unit}
                    </span>{" "}
                    <span>{ing.name}</span>
                    {ing.note && <span style={{ color: "#999", fontSize: "14px" }}> ({ing.note})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "#999", fontStyle: "italic" }}>Ингредиенты не найдены</p>
            )}
          </div>

          {/* Шаги приготовления */}
          <div
            style={{
              padding: "24px",
              background: "white",
              border: "2px solid #e5e7eb",
              borderRadius: "12px",
            }}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "16px" }}>
              Приготовление ({result.recipe.steps.length} шагов)
            </h3>
            {result.recipe.steps.length > 0 ? (
              <ol style={{ padding: "0 0 0 24px", margin: 0 }}>
                {result.recipe.steps.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "12px 0",
                      lineHeight: "1.6",
                      color: "#374151",
                    }}
                  >
                    {step.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ color: "#999", fontStyle: "italic" }}>Шаги приготовления не найдены</p>
            )}
          </div>

          {/* JSON для отладки */}
          <details style={{ marginTop: "24px" }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                color: "#666",
                padding: "12px",
                background: "#f9fafb",
                borderRadius: "8px",
              }}
            >
              Показать полный JSON
            </summary>
            <pre
              style={{
                marginTop: "12px",
                padding: "16px",
                background: "#1f2937",
                color: "#10b981",
                borderRadius: "8px",
                overflow: "auto",
                fontSize: "12px",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
