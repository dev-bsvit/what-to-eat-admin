"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ai-tokens.module.css";

const ENDPOINT_LABELS: Record<string, string> = {
  "recognize-text": "Голос",
  "recognize-image": "Фото",
  "recognize-recipe": "Рецепт (скан)",
  "extract-recipe-text": "Рецепт (чат)",
  "process-recipe": "Рецепт (AI)",
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
      .then((response) => response.json())
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  const totals = useMemo(() => {
    const users = data?.users || [];
    const prompt = users.reduce((sum, user) => sum + user.prompt_tokens, 0);
    const completion = users.reduce((sum, user) => sum + user.completion_tokens, 0);
    const requests = users.reduce((sum, user) => sum + user.requests, 0);
    return {
      prompt,
      completion,
      requests,
      cost: calcCost(prompt, completion),
    };
  }, [data]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>Admin / AI Usage</div>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>AI Токены</h1>
            <p className={styles.subtitle}>
              Расход токенов OpenAI по пользователям и endpoints. Стоимость считается по тарифу
              gpt-4o-mini для быстрой операционной оценки.
            </p>
          </div>
          <div className={styles.heroBadges}>
            <span className={styles.inverseBadge}>gpt-4o-mini</span>
            <span className={styles.outlineBadge}>{days} days</span>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="tablist" aria-label="Период отчета">
          {[7, 30, 90].map((period) => (
            <button
              key={period}
              type="button"
              role="tab"
              className={`${styles.segmentButton} ${days === period ? styles.segmentButtonActive : ""}`}
              onClick={() => setDays(period)}
              aria-selected={days === period}
            >
              {period} дней
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Загрузка...</div>
      ) : !data ? (
        <div className={styles.emptyState}>Ошибка загрузки</div>
      ) : (
        <>
          <section className={styles.metricsGrid} aria-label="Сводка AI usage">
            <MetricCard label="Всего токенов" value={data.grandTotal.toLocaleString()} />
            <MetricCard label="Пользователей" value={data.users.length.toString()} />
            <MetricCard label="Запросов" value={totals.requests.toLocaleString()} />
            <MetricCard label="Стоимость" value={totals.cost} />
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Usage Table</p>
                <h2>Пользователи за {data.days} дней</h2>
              </div>
              <span className={styles.neutralBadge}>
                input {totals.prompt.toLocaleString()} / output {totals.completion.toLocaleString()}
              </span>
            </div>

            {data.users.length === 0 ? (
              <div className={styles.emptyState}>Нет данных за выбранный период</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Запросы</th>
                      <th>Токены</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Стоимость</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => {
                      const isExpanded = expanded === user.userId;
                      const endpointLabels = Object.keys(user.by_endpoint)
                        .map((endpoint) => ENDPOINT_LABELS[endpoint] ?? endpoint)
                        .join(" / ");

                      return (
                        <>
                          <tr key={user.userId} className={isExpanded ? styles.rowActive : ""}>
                            <td>
                              <button
                                type="button"
                                className={styles.userButton}
                                onClick={() => setExpanded(isExpanded ? null : user.userId)}
                                aria-expanded={isExpanded}
                              >
                                <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}>
                                  ›
                                </span>
                                <span>
                                  <strong>{user.email || "Без email"}</strong>
                                  <small>{endpointLabels || "endpoints not recorded"}</small>
                                </span>
                              </button>
                            </td>
                            <td>{user.requests.toLocaleString()}</td>
                            <td><strong>{user.total_tokens.toLocaleString()}</strong></td>
                            <td className={styles.mutedCell}>{user.prompt_tokens.toLocaleString()}</td>
                            <td className={styles.mutedCell}>{user.completion_tokens.toLocaleString()}</td>
                            <td>{calcCost(user.prompt_tokens, user.completion_tokens)}</td>
                            <td className={styles.actionCell}>{isExpanded ? "Open" : "View"}</td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className={styles.detailCell}>
                                <div className={styles.endpointGrid}>
                                  {Object.entries(user.by_endpoint).map(([endpoint, stat]) => (
                                    <article key={endpoint} className={styles.endpointCard}>
                                      <div>
                                        <p className={styles.eyebrow}>Endpoint</p>
                                        <h3>{ENDPOINT_LABELS[endpoint] ?? endpoint}</h3>
                                        <code>{endpoint}</code>
                                      </div>
                                      <div className={styles.endpointMetrics}>
                                        <span>{stat.requests} запросов</span>
                                        <strong>{stat.total_tokens.toLocaleString()} токенов</strong>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}
