"use client";

import { useEffect, useState } from "react";

const ENDPOINT_LABELS: Record<string, string> = {
  "recognize-text": "🎤 Голос",
  "recognize-image": "📷 Фото",
  "recognize-recipe": "📖 Рецепт (скан)",
  "process-recipe": "✨ Рецепт (AI)",
};

const GPT4O_MINI_COST_PER_1K_INPUT = 0.00015;
const GPT4O_MINI_COST_PER_1K_OUTPUT = 0.0006;

function calcCost(prompt: number, completion: number): string {
  const cost =
    (prompt / 1000) * GPT4O_MINI_COST_PER_1K_INPUT +
    (completion / 1000) * GPT4O_MINI_COST_PER_1K_OUTPUT;
  return cost < 0.001 ? "<$0.001" : `$${cost.toFixed(3)}`;
}

interface UserStat {
  userId: string;
  email: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  requests: number;
  by_endpoint: Record<string, { requests: number; total_tokens: number }>;
}

export default function AiTokensPage() {
  const [data, setData] = useState<{ users: UserStat[]; grandTotal: number; days: number } | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/ai-tokens?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  return (
    <div style={{ padding: "var(--spacing-xl)" }}>
      <div style={{ marginBottom: "var(--spacing-xl)" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>AI Токены</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Витрати токенів OpenAI по користувачам (gpt-4o-mini)
        </p>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "var(--spacing-lg)" }}>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: days === d ? "var(--accent)" : "var(--surface)",
              color: days === d ? "#fff" : "var(--text-primary)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: days === d ? 600 : 400,
            }}
          >
            {d} днів
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary)" }}>Завантаження...</div>
      ) : !data ? (
        <div style={{ color: "var(--text-secondary)" }}>Помилка завантаження</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--spacing-md)", marginBottom: "var(--spacing-xl)" }}>
            <SummaryCard label="Всього токенів" value={data.grandTotal.toLocaleString()} />
            <SummaryCard label="Користувачів" value={data.users.length.toString()} />
            <SummaryCard
              label="Приблизна вартість"
              value={calcCost(
                data.users.reduce((s, u) => s + u.prompt_tokens, 0),
                data.users.reduce((s, u) => s + u.completion_tokens, 0)
              )}
            />
          </div>

          {/* Table */}
          {data.users.length === 0 ? (
            <div style={{
              padding: "var(--spacing-2xl)",
              textAlign: "center",
              color: "var(--text-secondary)",
              background: "var(--surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}>
              Немає даних за вибраний період
            </div>
          ) : (
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 80px 80px 80px 100px 24px",
                gap: "var(--spacing-md)",
                padding: "10px var(--spacing-lg)",
                borderBottom: "1px solid var(--border)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
              }}>
                <span>Користувач</span>
                <span style={{ textAlign: "right" }}>Запити</span>
                <span style={{ textAlign: "right" }}>Токени</span>
                <span style={{ textAlign: "right" }}>Input</span>
                <span style={{ textAlign: "right" }}>Вартість</span>
                <span />
              </div>

              {data.users.map((u) => (
                <div key={u.userId}>
                  <div
                    onClick={() => setExpanded(expanded === u.userId ? null : u.userId)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 80px 80px 80px 100px 24px",
                      gap: "var(--spacing-md)",
                      padding: "12px var(--spacing-lg)",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{u.email}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {Object.keys(u.by_endpoint).map((ep) => ENDPOINT_LABELS[ep] ?? ep).join(" · ")}
                      </div>
                    </div>
                    <span style={{ textAlign: "right", fontSize: "14px" }}>{u.requests}</span>
                    <span style={{ textAlign: "right", fontSize: "14px", fontWeight: 600 }}>{u.total_tokens.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontSize: "12px", color: "var(--text-secondary)" }}>{u.prompt_tokens.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontSize: "14px" }}>{calcCost(u.prompt_tokens, u.completion_tokens)}</span>
                    <span style={{ textAlign: "center", color: "var(--text-secondary)" }}>{expanded === u.userId ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded: breakdown by endpoint */}
                  {expanded === u.userId && (
                    <div style={{ background: "rgba(0,0,0,0.03)", padding: "var(--spacing-md) var(--spacing-lg)" }}>
                      {Object.entries(u.by_endpoint).map(([ep, stat]) => (
                        <div key={ep} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          fontSize: "13px",
                          borderBottom: "1px solid var(--border)",
                        }}>
                          <span>{ENDPOINT_LABELS[ep] ?? ep}</span>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {stat.requests} запитів · {stat.total_tokens.toLocaleString()} токенів
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "var(--spacing-lg)",
    }}>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
