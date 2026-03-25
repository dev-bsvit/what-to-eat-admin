"use client";

import { useEffect, useState, useCallback } from "react";

interface Nutrition {
  calories?: number;
}

interface RecipeRow {
  id: string;
  title: string;
  tags: string[] | null;
  difficulty: "easy" | "medium" | "hard" | null;
  prep_time: number | null;
  cook_time: number | null;
  nutrition_json: Nutrition | null;
  is_public: boolean | null;
}

const SUGGESTED_TAGS = [
  "quick", "special occasion", "light", "hearty",
  "breakfast", "lunch", "dinner", "snack",
  "vegetarian", "vegan", "gluten-free", "dairy-free",
  "soup", "salad", "pasta", "grill", "baking", "raw",
];

function autoClassifyTags(recipe: RecipeRow): string[] {
  const tags: string[] = [];
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  const hasTime = totalTime > 0;

  if (hasTime) {
    if (totalTime <= 20) tags.push("quick");
    if (totalTime > 60) tags.push("special occasion");
  } else {
    if (recipe.difficulty === "easy") tags.push("quick");
    if (recipe.difficulty === "hard") tags.push("special occasion");
  }

  const calories = recipe.nutrition_json?.calories;
  if (calories) {
    if (calories < 300) tags.push("light");
    if (calories > 650) tags.push("hearty");
  }

  return tags;
}

function TagEditor({
  recipe,
  onSaved,
}: {
  recipe: RecipeRow;
  onSaved: (id: string, tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(recipe.tags ?? []);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const autoTags = autoClassifyTags(recipe);

  function addTag(tag: string) {
    const cleaned = tag.trim().toLowerCase();
    if (cleaned && !tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function applyAutoTags() {
    setTags((prev) => {
      const merged = [...prev];
      for (const t of autoTags) {
        if (!merged.includes(t)) merged.push(t);
      }
      return merged;
    });
  }

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`/api/admin/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("saved");
      onSaved(recipe.id, tags);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--spacing-lg)",
        marginBottom: "var(--spacing-md)",
      }}
    >
      {/* Recipe header */}
      <div style={{ marginBottom: "var(--spacing-md)" }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "16px",
            color: "var(--text-primary)",
            marginBottom: "4px",
          }}
        >
          {recipe.title}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--spacing-sm)",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          {totalTime > 0 && <span>⏱ {totalTime} мин</span>}
          {recipe.difficulty && (
            <span
              style={{
                color:
                  recipe.difficulty === "easy"
                    ? "var(--accent-success)"
                    : recipe.difficulty === "hard"
                    ? "var(--accent-danger)"
                    : "#f59e0b",
              }}
            >
              {recipe.difficulty}
            </span>
          )}
          {recipe.nutrition_json?.calories && (
            <span>🔥 {recipe.nutrition_json.calories} ккал</span>
          )}
          <span
            style={{
              color: recipe.is_public ? "var(--accent-success)" : "var(--text-muted)",
            }}
          >
            {recipe.is_public ? "публичный" : "приватный"}
          </span>
        </div>
      </div>

      {/* Auto-classify suggestion */}
      {autoTags.length > 0 && (
        <div
          style={{
            background: "var(--accent-light)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--spacing-sm)",
            marginBottom: "var(--spacing-md)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--accent-primary)",
              marginBottom: "8px",
            }}
          >
            Авто-классификация из свойств рецепта:
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}
          >
            {autoTags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 500,
                  border: "1px solid var(--accent-primary)",
                  background: tags.includes(tag) ? "var(--accent-primary)" : "white",
                  color: tags.includes(tag) ? "white" : "var(--accent-primary)",
                }}
              >
                {tags.includes(tag) ? "✓ " : ""}
                {tag}
              </span>
            ))}
          </div>
          <button
            onClick={applyAutoTags}
            style={{
              fontSize: "12px",
              color: "var(--accent-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Добавить все авто-теги
          </button>
        </div>
      )}

      {/* Current tags */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "var(--spacing-md)",
          minHeight: "36px",
        }}
      >
        {tags.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: "14px", fontStyle: "italic" }}>
            Нет тегов
          </span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--bg-main)",
              color: "var(--text-primary)",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "13px",
              border: "1px solid var(--border-light)",
            }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "16px",
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Add custom tag */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "var(--spacing-md)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            }
          }}
          placeholder="Добавить тег…"
          style={{
            flex: 1,
            border: "1px solid var(--border-input)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <button
          onClick={() => addTag(input)}
          disabled={!input.trim()}
          style={{
            background: "var(--text-primary)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "8px 14px",
            fontSize: "14px",
            cursor: "pointer",
            opacity: input.trim() ? 1 : 0.4,
          }}
        >
          Добавить
        </button>
      </div>

      {/* Suggested tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "var(--spacing-lg)" }}>
        {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
          <button
            key={tag}
            onClick={() => addTag(tag)}
            style={{
              padding: "3px 10px",
              border: "1px dashed var(--border-medium)",
              borderRadius: "20px",
              fontSize: "12px",
              color: "var(--text-muted)",
              background: "none",
              cursor: "pointer",
            }}
          >
            + {tag}
          </button>
        ))}
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: "var(--accent-primary)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "9px 20px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Сохранение…" : "Сохранить теги"}
        </button>
        {status === "saved" && (
          <span style={{ color: "var(--accent-success)", fontSize: "14px" }}>✓ Сохранено</span>
        )}
        {status === "error" && (
          <span style={{ color: "var(--accent-danger)", fontSize: "14px" }}>Ошибка сохранения</span>
        )}
      </div>
    </div>
  );
}

export default function RecipeTagsPage() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [showNoTags, setShowNoTags] = useState(false);
  const [page, setPage] = useState(0);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (search.trim()) params.set("title", search.trim());
      const res = await fetch(`/api/admin/recipes/list?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  function handleSaved(id: string, tags: string[]) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, tags } : r))
    );
  }

  async function runBatchAutotag() {
    setBatchRunning(true);
    setBatchStatus(null);
    try {
      const res = await fetch("/api/admin/recipes/batch-autotag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ only_empty: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setBatchStatus(`✓ Помечено ${data.tagged} из ${data.total} рецептов`);
      fetchRecipes();
    } catch (e) {
      setBatchStatus(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }

  const filtered = recipes.filter((r) => {
    if (showNoTags && (r.tags ?? []).length > 0) return false;
    if (filterTag && !(r.tags ?? []).includes(filterTag.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "var(--spacing-2xl)",
          flexWrap: "wrap",
          gap: "var(--spacing-md)",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            Теги рецептов
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>
            Управление тегами и авто-классификация
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <button
            onClick={runBatchAutotag}
            disabled={batchRunning}
            style={{
              background: batchRunning ? "var(--text-muted)" : "#6b21a8",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: batchRunning ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {batchRunning ? "⏳ Классификация…" : "🤖 AI авто-теггинг (без тегов)"}
          </button>
          {batchStatus && (
            <span
              style={{
                fontSize: "13px",
                color: batchStatus.startsWith("✓") ? "var(--accent-success)" : "var(--accent-danger)",
              }}
            >
              {batchStatus}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "var(--spacing-sm)",
          marginBottom: "var(--spacing-xl)",
          flexWrap: "wrap",
        }}
      >
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Поиск по названию…"
          style={{
            flex: "1 1 220px",
            border: "1px solid var(--border-input)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 14px",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <input
          value={filterTag}
          onChange={(e) => { setFilterTag(e.target.value); setPage(0); }}
          placeholder="Фильтр по тегу…"
          style={{
            flex: "1 1 180px",
            border: "1px solid var(--border-input)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 14px",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={showNoTags}
            onChange={(e) => { setShowNoTags(e.target.checked); setPage(0); }}
          />
          Только без тегов
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", padding: "var(--spacing-2xl)" }}>
          Загрузка…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "var(--text-muted)", padding: "var(--spacing-2xl)" }}>
          Рецепты не найдены
        </div>
      ) : (
        <>
          <div style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "var(--spacing-md)" }}>
            Показано {filtered.length} из {recipes.length} загруженных
          </div>
          {filtered.map((recipe) => (
            <TagEditor key={recipe.id} recipe={recipe} onSaved={handleSaved} />
          ))}
          {/* Pagination */}
          <div style={{ display: "flex", gap: "var(--spacing-sm)", marginTop: "var(--spacing-xl)" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 16px",
                cursor: "pointer",
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              ← Назад
            </button>
            <span style={{ lineHeight: "36px", color: "var(--text-muted)", fontSize: "14px" }}>
              Страница {page + 1}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={recipes.length < PAGE_SIZE}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 16px",
                cursor: "pointer",
                opacity: recipes.length < PAGE_SIZE ? 0.4 : 1,
              }}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
