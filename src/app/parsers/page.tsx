"use client";

import Link from "next/link";

export default function ParsersPage() {
  const parsers = [
    {
      name: "food.ru",
      status: "active",
      confidence: "high",
      description: "Парсит рецепты с Food.ru через Next.js __NEXT_DATA__",
      features: ["Название", "Описание", "Картинка", "Время", "Порции", "Шаги", "Ингредиенты (meta)"],
    },
    {
      name: "eda.ru",
      status: "active",
      confidence: "medium",
      description: "Яндекс.Еда - HTML парсинг",
      features: ["Название", "Ингредиенты", "Шаги"],
    },
    {
      name: "povarenok.ru",
      status: "active",
      confidence: "medium",
      description: "Поваренок - HTML парсинг",
      features: ["Название", "Ингредиенты", "Шаги"],
    },
    {
      name: "gotovim-doma.ru",
      status: "active",
      confidence: "medium",
      description: "Готовим дома - microdata парсинг",
      features: ["Название", "Ингредиенты", "Шаги", "Время"],
    },
    {
      name: "allrecipes.com/ru",
      status: "active",
      confidence: "medium",
      description: "AllRecipes - HTML парсинг",
      features: ["Название", "Ингредиенты", "Шаги"],
    },
    {
      name: "JSON-LD Schema.org",
      status: "active",
      confidence: "high",
      description: "Универсальный парсер для сайтов с Schema.org разметкой",
      features: ["Все поля", "Работает на большинстве международных сайтов"],
    },
    {
      name: "OpenGraph + HTML",
      status: "fallback",
      confidence: "low",
      description: "Запасной вариант для сайтов без структурированных данных",
      features: ["Название", "Картинка", "Попытка найти ингредиенты/шаги"],
    },
    {
      name: "instagram.com (Reels/Posts)",
      status: "beta",
      confidence: "medium",
      description: "Публичные Reels: скачивание видео + распознавание речи + AI разбор в JSON",
      features: ["Подпись", "Транскрипт", "Ингредиенты", "Шаги"],
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#10b981";
      case "fallback":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "#10b981";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "8px" }}>
          Парсеры рецептов
        </h1>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          Управление парсерами для импорта рецептов с различных сайтов
        </p>

        <div style={{ display: "flex", gap: "12px" }}>
          <Link
            href="/test-import"
            style={{
              padding: "10px 20px",
              background: "#667eea",
              color: "white",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            🧪 Тестировать импорт
          </Link>
          <Link
            href="/instagram-import"
            style={{
              padding: "10px 20px",
              background: "#111827",
              color: "white",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            📷 Instagram импорт
          </Link>
          <a
            href="/api/import-recipe"
            target="_blank"
            style={{
              padding: "10px 20px",
              background: "#f3f4f6",
              color: "#374151",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "14px",
              border: "1px solid #e5e7eb",
            }}
          >
            📄 API Документация
          </a>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            padding: "20px",
            background: "white",
            borderRadius: "12px",
            border: "2px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>
            Всего парсеров
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#667eea" }}>
            {parsers.length}
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            background: "white",
            borderRadius: "12px",
            border: "2px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>
            Активных
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#10b981" }}>
            {parsers.filter((p) => p.status === "active").length}
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            background: "white",
            borderRadius: "12px",
            border: "2px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>
            Высокая точность
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#10b981" }}>
            {parsers.filter((p) => p.confidence === "high").length}
          </div>
        </div>
      </div>

      {/* Parsers List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {parsers.map((parser, index) => (
          <div
            key={index}
            style={{
              padding: "24px",
              background: "white",
              borderRadius: "12px",
              border: "2px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
              <div>
                <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "4px" }}>
                  {parser.name}
                </h3>
                <p style={{ color: "#666", fontSize: "14px" }}>{parser.description}</p>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "white",
                    background: getStatusColor(parser.status),
                  }}
                >
                  {parser.status === "active" ? "Активен" : "Запасной"}
                </span>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "white",
                    background: getConfidenceColor(parser.confidence),
                  }}
                >
                  {parser.confidence === "high"
                    ? "Высокая"
                    : parser.confidence === "medium"
                    ? "Средняя"
                    : "Низкая"}{" "}
                  точность
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {parser.features.map((feature, i) => (
                <span
                  key={i}
                  style={{
                    padding: "6px 12px",
                    background: "#f3f4f6",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#374151",
                  }}
                >
                  ✓ {feature}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* How to add new parser */}
      <div
        style={{
          marginTop: "32px",
          padding: "24px",
          background: "#f9fafb",
          borderRadius: "12px",
          border: "2px solid #e5e7eb",
        }}
      >
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px" }}>
          📚 Как добавить новый парсер
        </h3>
        <ol style={{ paddingLeft: "20px", color: "#374151", lineHeight: "1.8" }}>
          <li>
            Откройте файл:{" "}
            <code style={{ background: "#e5e7eb", padding: "2px 8px", borderRadius: "4px", fontSize: "13px" }}>
              admin-panel/src/app/api/import-recipe/route.ts
            </code>
          </li>
          <li>
            Добавьте условие в функцию <code style={{ background: "#e5e7eb", padding: "2px 8px", borderRadius: "4px" }}>extractFromKnownSites</code>
          </li>
          <li>
            Создайте новую функцию парсера:{" "}
            <code style={{ background: "#e5e7eb", padding: "2px 8px", borderRadius: "4px" }}>parseSiteName</code>
          </li>
          <li>Используйте cheerio для парсинга HTML или JSON.parse для структурированных данных</li>
          <li>
            Протестируйте на странице{" "}
            <Link href="/test-import" style={{ color: "#667eea", textDecoration: "underline" }}>
              /test-import
            </Link>
          </li>
        </ol>

        <div style={{ marginTop: "16px", padding: "16px", background: "white", borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
            Пример кода:
          </div>
          <pre
            style={{
              background: "#1f2937",
              color: "#10b981",
              padding: "16px",
              borderRadius: "8px",
              overflow: "auto",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
          >
{`function parseNewSite(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);

  const title = $('h1.recipe-title').text().trim();
  if (!title) return null;

  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('.ingredient-item').each((_, el) => {
    const text = $(el).text().trim();
    const parsed = parseIngredientText(text);
    ingredients.push(parsed);
  });

  const steps: Array<{ text: string }> = [];
  $('.cooking-step').each((_, el) => {
    steps.push({ text: $(el).text().trim() });
  });

  return {
    title,
    ingredients,
    steps,
    sourceUrl,
    sourceDomain: "newsite.com",
    confidence: "medium",
  };
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
