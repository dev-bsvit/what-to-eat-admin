"use client";

import { useState, useEffect, useCallback } from "react";

const LANGUAGES = ["en", "ru", "de", "it", "fr", "es", "pt-BR", "uk"] as const;
const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪", it: "🇮🇹",
  fr: "🇫🇷", es: "🇪🇸", "pt-BR": "🇧🇷", uk: "🇺🇦",
};
const LATIN = ["en", "de", "it", "fr", "es", "pt-BR"];
const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);

const ISSUE_META: Record<string, { label: string; color: string }> = {
  "fix-translations": { label: "Кириллица в переводах", color: "#c22b10" },
  "fill-languages":   { label: "Неполные языки",        color: "#8a4b00" },
  "enrich-synonyms":  { label: "Бедные синонимы",       color: "#555" },
};

type QueueItem = { id: string; canonical_name: string; category: string | null; icon: string | null; issue: string };
type Translation = { name: string; synonyms: string[]; description: string | null; storage_tips: string | null };
type Translations = Record<string, Translation>;
type TestResult = {
  after: Translations;
  inputTokens: number; outputTokens: number; costUsd: number; timeTaken: number;
  applied: boolean;
};

const s = {
  card: (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #e0e0e0", borderRadius: 14, background: "#fff", padding: "20px 24px", ...extra,
  }),
  btn: (opts?: { color?: string; disabled?: boolean; outline?: boolean; size?: "sm" | "lg" }): React.CSSProperties => {
    const { color = "#000", disabled, outline, size = "sm" } = opts ?? {};
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      border: `1.5px solid ${color}`, background: outline ? "#fff" : color,
      color: outline ? color : "#fff", borderRadius: size === "lg" ? 12 : 8,
      padding: size === "lg" ? "11px 22px" : "7px 14px",
      fontSize: size === "lg" ? 14 : 13, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
    };
  },
};

// ── Translation diff table ────────────────────────────────────────────────────

function DiffTable({ before, after, compact }: { before: Translations; after: Translations; compact?: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 12 : 13 }}>
        <thead>
          <tr style={{ background: "#f7f7f7" }}>
            <th style={{ padding: "7px 10px", textAlign: "left", color: "#555", width: 48, fontWeight: 700 }}>Яз</th>
            <th style={{ padding: "7px 10px", textAlign: "left", color: "#888", fontWeight: 700 }}>До</th>
            <th style={{ padding: "7px 10px", textAlign: "left", color: "#1a6b1a", fontWeight: 700 }}>После</th>
            <th style={{ padding: "7px 10px", textAlign: "center", color: "#555", width: 52, fontWeight: 700 }}>Syn</th>
          </tr>
        </thead>
        <tbody>
          {LANGUAGES.map(lang => {
            const b = before[lang];
            const a = after[lang];
            const changed = b?.name !== a?.name;
            const wasErr = b && LATIN.includes(lang) && hasCyrillic(b.name);
            const stillErr = a && LATIN.includes(lang) && hasCyrillic(a.name);
            const synOk = (a?.synonyms?.length ?? 0) >= 3;

            return (
              <tr key={lang} style={{ borderBottom: "1px solid #f0f0f0", background: wasErr ? "#fff9f8" : "transparent" }}>
                <td style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {LANG_FLAGS[lang]} <span style={{ fontSize: 10, color: "#bbb" }}>{lang}</span>
                </td>
                <td style={{ padding: "8px 10px", color: wasErr ? "#c22b10" : "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b ? <>{wasErr && "⚠ "}{b.name}</> : <span style={{ color: "#ddd" }}>—</span>}
                </td>
                <td style={{ padding: "8px 10px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a ? (
                    <span style={{ color: stillErr ? "#c22b10" : changed ? "#1a6b1a" : "#111", fontWeight: changed ? 600 : 400 }}>
                      {stillErr ? "⚠ " : changed ? "✓ " : ""}{a.name}
                    </span>
                  ) : <span style={{ color: "#ddd" }}>—</span>}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 12, color: a ? (synOk ? "#22c55e" : "#c22b10") : "#ddd" }}>
                  {a ? (a.synonyms?.length ?? 0) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Result column ─────────────────────────────────────────────────────────────

function ResultCol({
  provider, result, running, canTest, onTest, onApply,
}: {
  provider: "openai" | "nvidia";
  result: TestResult | null;
  running: boolean;
  canTest: boolean;
  onTest: () => void;
  onApply: () => void;
}) {
  const isNvidia = provider === "nvidia";
  const color = isNvidia ? "#1a6b1a" : "#000";
  const label = isNvidia ? "Gemma 3N" : "GPT-4o-mini";

  return (
    <div style={s.card({ flex: 1, minWidth: 0 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <span style={{ background: color, color: "#fff", borderRadius: 7, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {result && (
            <span style={{ fontSize: 11, color: "#aaa" }}>
              {result.timeTaken}ms · {(result.inputTokens + result.outputTokens).toLocaleString()} tok · ${result.costUsd.toFixed(5)}
            </span>
          )}
          <button type="button" style={s.btn({ color, disabled: running || !canTest })} disabled={running || !canTest} onClick={onTest}>
            {running ? "…" : "Тест"}
          </button>
          {result && !result.applied && (
            <button type="button" style={s.btn({ color, outline: true, disabled: running })} disabled={running} onClick={onApply}>
              Применить ✓
            </button>
          )}
          {result?.applied && <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>✓ Сохранено</span>}
        </div>
      </div>
      {result
        ? <div />
        : <div style={{ padding: "20px 0", textAlign: "center", color: "#ccc", fontSize: 13 }}>
            {canTest ? "Нажми «Тест»" : "Выбери продукт"}
          </div>
      }
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SingleProductTestPanel() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [index, setIndex] = useState(0);

  const [before, setBefore] = useState<Translations>({});
  const [gptResult, setGptResult] = useState<TestResult | null>(null);
  const [nvidiaResult, setNvidiaResult] = useState<TestResult | null>(null);
  const [deeplResult, setDeeplResult] = useState<TestResult | null>(null);
  const [runningGpt, setRunningGpt] = useState(false);
  const [runningNvidia, setRunningNvidia] = useState(false);
  const [runningDeepl, setRunningDeepl] = useState(false);
  const [sharedDiff, setSharedDiff] = useState<{ before: Translations; after: Translations; provider: string } | null>(null);

  // Load the issue queue on mount
  useEffect(() => {
    (async () => {
      setQueueLoading(true);
      const modes = ["fix-translations", "fill-languages", "enrich-synonyms"];
      const seen = new Set<string>();
      const result: QueueItem[] = [];
      await Promise.all(modes.map(async (mode) => {
        const r = await fetch(`/api/admin/products/smart-process?preview=${mode}`);
        const d = await r.json();
        for (const p of d.products ?? []) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            result.push({ ...p, issue: mode });
          }
        }
      }));
      // Sort by priority
      const order = ["fix-translations", "fill-languages", "enrich-synonyms"];
      result.sort((a, b) => order.indexOf(a.issue) - order.indexOf(b.issue));
      setQueue(result);
      setQueueLoading(false);
    })();
  }, []);

  const current = queue[index] ?? null;

  // Load translations when current product changes
  useEffect(() => {
    if (!current) return;
    setGptResult(null);
    setNvidiaResult(null);
    setDeeplResult(null);
    setSharedDiff(null);
    setBefore({});
    (async () => {
      const r = await fetch(`/api/admin/products/test-single?productId=${current.id}`);
      const d = await r.json();
      if (d.before) setBefore(d.before);
    })();
  }, [current?.id]);

  const runTest = useCallback(async (provider: "openai" | "nvidia" | "deepl", apply = false) => {
    if (!current) return;
    const setRunning = provider === "openai" ? setRunningGpt : provider === "nvidia" ? setRunningNvidia : setRunningDeepl;
    const setResult = provider === "openai" ? setGptResult : provider === "nvidia" ? setNvidiaResult : setDeeplResult;
    const prevResult = provider === "openai" ? gptResult : provider === "nvidia" ? nvidiaResult : deeplResult;

    setRunning(true);
    try {
      const r = await fetch("/api/admin/products/test-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: current.id, provider, apply }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      const result: TestResult = {
        after: d.after,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        costUsd: d.costUsd,
        timeTaken: d.timeTaken,
        applied: apply,
      };
      setResult(result);
      setSharedDiff({ before: apply ? (prevResult?.after ?? before) : before, after: d.after, provider });
      if (apply) {
        setBefore(d.after);
        // Remove from queue after applying
        setQueue(q => q.filter(item => item.id !== current.id));
        setIndex(i => Math.min(i, queue.length - 2));
      }
    } finally {
      setRunning(false);
    }
  }, [current, before, gptResult, nvidiaResult, deeplResult, queue.length]);

  const skip = () => {
    setIndex(i => Math.min(i + 1, queue.length - 1));
  };

  const prev = () => setIndex(i => Math.max(i - 1, 0));

  const isRunning = runningGpt || runningNvidia || runningDeepl;

  if (queueLoading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
        Загружаю список проблемных продуктов…
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div style={s.card({ textAlign: "center", padding: "48px 24px" })}>
        <div style={{ fontSize: 32 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>Нет продуктов с проблемами!</div>
        <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>База в идеальном состоянии</div>
      </div>
    );
  }

  const issueMeta = ISSUE_META[current?.issue ?? ""] ?? { label: current?.issue, color: "#555" };

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1200 }}>

      {/* Navigation bar */}
      <div style={s.card({ padding: "16px 20px" })}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>

          {/* Prev / Next */}
          <button type="button" style={s.btn({ disabled: index === 0 || isRunning })} disabled={index === 0 || isRunning} onClick={prev}>
            ← Назад
          </button>
          <button type="button" style={s.btn({ disabled: index >= queue.length - 1 || isRunning })} disabled={index >= queue.length - 1 || isRunning} onClick={skip}>
            Пропустить →
          </button>

          {/* Counter */}
          <span style={{ fontSize: 13, color: "#888" }}>
            <b style={{ color: "#111" }}>{index + 1}</b> из <b style={{ color: "#111" }}>{queue.length}</b> проблемных продуктов
          </span>

          {/* Issue badge */}
          {current && (
            <span style={{
              background: issueMeta.color + "15", color: issueMeta.color,
              border: `1px solid ${issueMeta.color}40`, borderRadius: 7,
              padding: "3px 10px", fontSize: 12, fontWeight: 700,
            }}>
              {issueMeta.label}
            </span>
          )}

          {/* Product name */}
          {current && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <span style={{ fontSize: 22 }}>{current.icon ?? "📦"}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{current.canonical_name}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{current.category ?? "—"}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test buttons row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={s.btn({ size: "lg", disabled: isRunning || !current })} disabled={isRunning || !current} onClick={() => runTest("openai")}>
          {runningGpt ? "GPT тестирует…" : "🤖 Тест GPT-4o-mini"}
        </button>
        <button type="button" style={s.btn({ size: "lg", color: "#1a6b1a", disabled: isRunning || !current })} disabled={isRunning || !current} onClick={() => runTest("nvidia")}>
          {runningNvidia ? "Gemma тестирует…" : "🧪 Тест Gemma (NVIDIA)"}
        </button>
        <button type="button" style={s.btn({ size: "lg", color: "#1746a2", disabled: isRunning || !current })} disabled={isRunning || !current} onClick={() => runTest("deepl")}>
          {runningDeepl ? "DeepL тестирует…" : "🔤 Тест DeepL+GPT"}
        </button>
        {(gptResult || nvidiaResult || deeplResult) && !gptResult?.applied && !nvidiaResult?.applied && !deeplResult?.applied && (
          <>
            {gptResult && (
              <button type="button" style={s.btn({ size: "lg", outline: true, disabled: isRunning })} disabled={isRunning} onClick={() => runTest("openai", true)}>
                Применить GPT ✓
              </button>
            )}
            {nvidiaResult && (
              <button type="button" style={s.btn({ size: "lg", color: "#1a6b1a", outline: true, disabled: isRunning })} disabled={isRunning} onClick={() => runTest("nvidia", true)}>
                Применить Gemma ✓
              </button>
            )}
            {deeplResult && (
              <button type="button" style={s.btn({ size: "lg", color: "#1746a2", outline: true, disabled: isRunning })} disabled={isRunning} onClick={() => runTest("deepl", true)}>
                Применить DeepL ✓
              </button>
            )}
          </>
        )}
      </div>

      {/* Diff table — shared, shows whichever model ran last */}
      {sharedDiff ? (
        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Сравнение до / после
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {gptResult && (
                <span style={{ fontSize: 12, color: "#555" }}>
                  GPT: {(gptResult.inputTokens + gptResult.outputTokens).toLocaleString()} tok · ${gptResult.costUsd.toFixed(5)} · {gptResult.timeTaken}ms
                  {gptResult.applied && <span style={{ color: "#22c55e", fontWeight: 700 }}> ✓ применено</span>}
                </span>
              )}
              {nvidiaResult && (
                <span style={{ fontSize: 12, color: "#1a6b1a" }}>
                  Gemma: {(nvidiaResult.inputTokens + nvidiaResult.outputTokens).toLocaleString()} tok · ${nvidiaResult.costUsd.toFixed(5)} · {nvidiaResult.timeTaken}ms
                  {nvidiaResult.applied && <span style={{ fontWeight: 700 }}> ✓ применено</span>}
                </span>
              )}
              {deeplResult && (
                <span style={{ fontSize: 12, color: "#1746a2" }}>
                  DeepL: {(deeplResult.inputTokens + deeplResult.outputTokens).toLocaleString()} tok · ${deeplResult.costUsd.toFixed(5)} · {deeplResult.timeTaken}ms
                  {deeplResult.applied && <span style={{ fontWeight: 700 }}> ✓ применено</span>}
                </span>
              )}
            </div>
          </div>
          <DiffTable before={sharedDiff.before} after={sharedDiff.after} />

          {/* Multi-model name comparison */}
          {[gptResult, nvidiaResult, deeplResult].filter(Boolean).length >= 2 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Сравнение названий по моделям
              </div>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: `80px ${[gptResult, nvidiaResult, deeplResult].filter(Boolean).map(() => "1fr").join(" ")}`, gap: 6, fontSize: 12, marginBottom: 6 }}>
                <span />
                {gptResult && <span style={{ fontWeight: 700, color: "#555" }}>🤖 GPT</span>}
                {nvidiaResult && <span style={{ fontWeight: 700, color: "#1a6b1a" }}>🧪 Gemma</span>}
                {deeplResult && <span style={{ fontWeight: 700, color: "#1746a2" }}>🔤 DeepL</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `80px ${[gptResult, nvidiaResult, deeplResult].filter(Boolean).map(() => "1fr").join(" ")}`, gap: 6, fontSize: 13 }}>
                {LANGUAGES.map(lang => {
                  const g = gptResult?.after[lang]?.name;
                  const n = nvidiaResult?.after[lang]?.name;
                  const d = deeplResult?.after[lang]?.name;
                  const isLatin = LATIN.includes(lang);
                  const errColor = (v: string | undefined) => v && isLatin && hasCyrillic(v) ? "#c22b10" : "#111";
                  return (
                    <div key={lang} style={{ display: "contents" }}>
                      <span style={{ fontWeight: 700, color: "#888" }}>{LANG_FLAGS[lang]} {lang}</span>
                      {gptResult && <span style={{ color: errColor(g) }}>{g ?? "—"}</span>}
                      {nvidiaResult && <span style={{ color: errColor(n) }}>{n ?? "—"}</span>}
                      {deeplResult && <span style={{ color: errColor(d) }}>{d ?? "—"}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : current && Object.keys(before).length > 0 ? (
        <div style={s.card()}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
            Текущие переводы
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            {LANGUAGES.map(lang => {
              const t = before[lang];
              const hasErr = t && LATIN.includes(lang) && hasCyrillic(t.name);
              const missing = !t;
              return (
                <div key={lang} style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f7f7f7" }}>
                  <span style={{ fontWeight: 700, minWidth: 60 }}>{LANG_FLAGS[lang]} {lang}</span>
                  {missing
                    ? <span style={{ color: "#e0a000", fontSize: 12 }}>— нет перевода</span>
                    : <span style={{ color: hasErr ? "#c22b10" : "#555" }}>{hasErr && "⚠ "}{t.name}</span>
                  }
                  {t && <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto" }}>{t.synonyms?.length ?? 0} syn</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "#aaa" }}>
            Нажми «Тест GPT», «Тест Gemma» или «Тест DeepL» чтобы увидеть предлагаемые исправления
          </div>
        </div>
      ) : null}
    </div>
  );
}
