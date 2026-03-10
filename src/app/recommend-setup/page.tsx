"use client";

import { useState, useEffect } from "react";

interface Stats {
  total: number;
  untagged: number;
  unembedded: number;
}

type ActionState = "idle" | "running" | "done" | "error";

interface StepResult {
  state: ActionState;
  message: string;
}

const MIGRATION_SQL = `-- Run this in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS mood_tags text[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS recipes_embedding_idx
  ON recipes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS recipes_mood_tags_idx
  ON recipes USING gin (mood_tags);

CREATE OR REPLACE FUNCTION match_recipes(
  query_embedding vector(1536),
  match_count     int DEFAULT 40,
  filter_cook_time int DEFAULT NULL,
  filter_mood     text DEFAULT NULL,
  exclude_ids     uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid, title text, description text, image_url text,
  cook_time int, prep_time int, servings int, difficulty text,
  diet_tags text[], mood_tags text[], cuisine_id uuid, similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.title, r.description, r.image_url,
    r.cook_time, r.prep_time, r.servings, r.difficulty,
    r.diet_tags, r.mood_tags, r.cuisine_id,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM recipes r
  WHERE r.is_user_defined = false
    AND r.image_url IS NOT NULL
    AND r.embedding IS NOT NULL
    AND (filter_cook_time IS NULL OR r.cook_time <= filter_cook_time)
    AND (filter_mood IS NULL OR r.mood_tags @> ARRAY[filter_mood])
    AND (array_length(exclude_ids, 1) IS NULL OR r.id != ALL(exclude_ids))
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;`;

export default function RecommendSetupPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [steps, setSteps] = useState<Record<string, StepResult>>({
    migrate: { state: "idle", message: "" },
    tag: { state: "idle", message: "" },
    embed: { state: "idle", message: "" },
  });
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const running = Object.values(steps).some((s) => s.state === "running");

  async function loadStats() {
    try {
      const res = await fetch("/api/admin/recommend-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stats" }),
      });
      const data = await res.json();
      setStats(data);
    } catch {}
  }

  async function runAction(action: string) {
    setSteps((s) => ({ ...s, [action]: { state: "running", message: "Выполняется..." } }));
    try {
      const res = await fetch("/api/admin/recommend-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        const msg =
          action === "migrate"
            ? "Миграция применена успешно"
            : action === "tag"
            ? `Помечено ${data.tagged} из ${data.total} рецептов`
            : `Создано эмбеддингов: ${data.embedded} из ${data.total}`;
        setSteps((s) => ({ ...s, [action]: { state: "done", message: msg } }));
      } else {
        setSteps((s) => ({ ...s, [action]: { state: "error", message: data.error ?? "Неизвестная ошибка" } }));
        if (action === "migrate") setShowSql(true);
      }
      await loadStats();
    } catch (e) {
      setSteps((s) => ({ ...s, [action]: { state: "error", message: String(e) } }));
      if (action === "migrate") setShowSql(true);
    }
  }

  function copySQL() {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => { loadStats(); }, []);

  const tagDone = steps.tag.state === "done" || (stats && stats.untagged === 0);
  const migrateDone = steps.migrate.state === "done";

  return (
    <div style={{ background: "var(--bg-main)", minHeight: "100vh", padding: "var(--spacing-2xl)" }}>
      <div style={{ maxWidth: 720 }}>

        {/* Header */}
        <div style={{ marginBottom: "var(--spacing-2xl)" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            Настройка рекомендаций
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Активация векторного поиска для AI-рекомендаций в приложении
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "var(--spacing-2xl)" }}>
          {[
            { label: "Всего рецептов", value: stats?.total ?? "—", accent: false },
            { label: "Без mood_tags", value: stats?.untagged ?? "—", accent: (stats?.untagged ?? 0) > 0 },
            { label: "Без эмбеддинга", value: stats?.unembedded ?? "—", accent: (stats?.unembedded ?? 0) > 0 },
          ].map((item) => (
            <div key={item.label} style={{
              background: "var(--bg-surface)",
              border: `1px solid ${item.accent ? "#ff9500" : "var(--border-light)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "var(--spacing-lg)",
              boxShadow: "var(--shadow-card)",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: item.accent ? "#ff9500" : "var(--text-primary)" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Step 1 */}
          <StepCard
            num={1}
            title="Применить миграцию"
            description={<>Добавляет колонки <code style={codeStyle}>mood_tags</code> и <code style={codeStyle}>embedding</code>, индексы и функцию <code style={codeStyle}>match_recipes</code> в Supabase.</>}
            step={steps.migrate}
            disabled={running}
            onRun={() => runAction("migrate")}
            btnLabel="Применить"
            btnColor="#1a1a1a"
          >
            {(steps.migrate.state === "error" || showSql) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Если автоматическая миграция не работает — скопируй SQL и запусти в Supabase → SQL Editor:
                </div>
                <div style={{ position: "relative" }}>
                  <pre style={{
                    background: "#f5f5f7",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-md)",
                    padding: 12,
                    fontSize: 12,
                    color: "#333",
                    overflow: "auto",
                    maxHeight: 180,
                    lineHeight: 1.5,
                  }}>{MIGRATION_SQL}</pre>
                  <button onClick={copySQL} style={{
                    position: "absolute", top: 8, right: 8,
                    background: copied ? "#34c759" : "var(--accent-primary)",
                    color: "#fff", border: "none", borderRadius: 6,
                    padding: "4px 10px", fontSize: 12, cursor: "pointer",
                  }}>
                    {copied ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <button
                  onClick={() => { setSteps((s) => ({ ...s, migrate: { state: "done", message: "Отмечено как выполнено" } })); }}
                  style={{ marginTop: 8, fontSize: 13, color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Я запустил SQL вручную — отметить как выполнено
                </button>
              </div>
            )}
          </StepCard>

          {/* Step 2 */}
          <StepCard
            num={2}
            title="Тегировать рецепты"
            description="GPT-4o-mini автоматически присвоит каждому рецепту теги: light, hearty, junk, usual. Занимает 1–5 минут."
            step={steps.tag}
            disabled={running || !migrateDone}
            onRun={() => runAction("tag")}
            btnLabel="Запустить тегирование"
            btnColor="#007aff"
          />

          {/* Step 3 */}
          <StepCard
            num={3}
            title="Сгенерировать эмбеддинги"
            description="Создаёт векторы для каждого рецепта через OpenAI text-embedding-3-small. Нужно выполнять после тегирования."
            step={steps.embed}
            disabled={running || !tagDone}
            onRun={() => runAction("embed")}
            btnLabel="Сгенерировать"
            btnColor="#5856d6"
          />
        </div>

        <button
          onClick={loadStats}
          style={{ marginTop: 20, fontSize: 13, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Обновить статистику
        </button>
      </div>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  background: "#f0f0f5",
  padding: "1px 5px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "monospace",
  color: "#333",
};

function StepCard({
  num, title, description, step, disabled, onRun, btnLabel, btnColor, children,
}: {
  num: number;
  title: string;
  description: React.ReactNode;
  step: StepResult;
  disabled: boolean;
  onRun: () => void;
  btnLabel: string;
  btnColor: string;
  children?: React.ReactNode;
}) {
  const isRunning = step.state === "running";
  const isDone = step.state === "done";
  const isError = step.state === "error";

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-light)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--spacing-xl)",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Number badge */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: isDone ? "#34c759" : isError ? "#ff3b30" : "#1a1a1a",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 600,
        }}>
          {isDone ? "✓" : isError ? "!" : num}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{description}</div>
            </div>
            <button
              onClick={onRun}
              disabled={disabled}
              style={{
                background: disabled ? "#e5e5e7" : btnColor,
                color: disabled ? "#999" : "#fff",
                border: "none", borderRadius: "var(--radius-sm)",
                padding: "8px 16px", fontSize: 13, fontWeight: 500,
                cursor: disabled ? "not-allowed" : "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                transition: "opacity 0.2s",
              }}
            >
              {isRunning ? "⏳ Выполняется..." : btnLabel}
            </button>
          </div>

          {/* Status message */}
          {step.state !== "idle" && (
            <div style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              background: isRunning ? "#fff9e6" : isDone ? "#f0faf4" : "#fff5f5",
              color: isRunning ? "#7d5c00" : isDone ? "#1a7f3c" : "#cc3333",
              border: `1px solid ${isRunning ? "#ffd060" : isDone ? "#a8e6be" : "#ffb3b3"}`,
            }}>
              {step.message}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
