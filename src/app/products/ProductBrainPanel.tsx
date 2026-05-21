"use client";

import { useState, useEffect, useRef } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  white: "#ffffff",
  ghost: "#f2f2f2",
  ash: "#e5e5e5",
  muted: "#737373",
  rich: "#0a0a0a",
  black: "#000000",
  red: "#c22b10",
  green: "#10c22b",
};
const CARD_SHADOW = "oklab(0.145 -0.00000143796 0.00000340492 / 0.1) 0px 0px 0px 1px";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProviderType = "deepl" | "deepl-nvidia" | "openai" | "nvidia";

type SmartStats = {
  total: number;
  badNames: number;
  badTranslations: number;
  missingLanguages: number;
  poorSynonyms: number;
  pendingModeration: number;
  totalIssues: number;
  isClean: boolean;
};

type ProcessResult = {
  productId: string;
  name: string;
  action: string;
  changed: boolean;
  inputTokens: number;
  outputTokens: number;
  error?: string;
  savedRows?: number;
  translations?: Record<string, string>;
};

type SmartResponse = {
  success: boolean;
  mode?: string;
  resolvedMode?: string;
  processed: number;
  errors: number;
  remaining: number;
  modeRemaining: number;
  results: ProcessResult[];
  stats: SmartStats;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  error?: string;
};

type PreviewProduct = { id: string; name: string; category: string | null; icon: string };

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDERS: { id: ProviderType; label: string; sub: string; badge?: string; costPer: number | null }[] = [
  { id: "deepl",        label: "DeepL + GPT",   sub: "Точные переводы",    badge: "Рекомендовано", costPer: 0.00053 },
  { id: "deepl-nvidia", label: "DeepL + Gemma", sub: "Бесплатно · медленно", badge: "Free",         costPer: 0 },
  { id: "openai",       label: "GPT-4o-mini",   sub: "Быстро",                                      costPer: 0.00086 },
  { id: "nvidia",       label: "NVIDIA Gemma",  sub: "Бесплатно · очень медленно", badge: "Free",   costPer: 0 },
];

const BATCH_SIZES = [5, 10, 20] as const;

// ── Mode metadata ─────────────────────────────────────────────────────────────

const MODE_META: Record<string, { label: string; description: string; priority: number }> = {
  "fix-names":        { label: "Кривые имена",     description: "Emoji, вес или мусор в названии",           priority: 0 },
  "fix-translations": { label: "Плохие переводы",  description: "Кириллица в EN / DE / IT / FR / ES / PT",   priority: 1 },
  "fill-languages":   { label: "Неполные языки",   description: "Продукты без всех 8 переводов",             priority: 2 },
  "pending":          { label: "Новые продукты",   description: "Пользовательские добавления на модерации",  priority: 3 },
  "enrich-synonyms":  { label: "Бедные синонимы",  description: "Меньше 3 синонимов — поиск работает хуже", priority: 4 },
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: "neutral" | "inverse" | "outline" | "red" | "green" }) {
  const styles: React.CSSProperties = {
    display: "inline-flex", alignItems: "center",
    borderRadius: 26, padding: "2px 8px",
    fontSize: 12, fontWeight: 500, lineHeight: 1.5, whiteSpace: "nowrap",
    ...(variant === "inverse"  && { background: C.black,  color: C.white }),
    ...(variant === "neutral"  && { background: C.ghost,  color: C.rich }),
    ...(variant === "outline"  && { background: "transparent", color: C.rich, border: `1px solid #a1a1a1` }),
    ...(variant === "red"      && { background: C.red + "14",  color: C.red,  border: `1px solid ${C.red}30` }),
    ...(variant === "green"    && { background: C.green + "14", color: "#0a7a1c", border: `1px solid ${C.green}40` }),
  };
  return <span style={styles}>{children}</span>;
}

function GhostBtn({ children, onClick, disabled, size = "sm" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "transparent", border: `1px solid ${C.ash}`,
        borderRadius: 9999, cursor: disabled ? "not-allowed" : "pointer",
        padding: size === "md" ? "6px 16px" : "4px 12px",
        fontSize: 13, fontWeight: 500, color: C.rich,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({ modeKey, count, onRunBatch, onRunAll, running, activeMode }: {
  modeKey: string; count: number;
  onRunBatch: (mode: string) => void;
  onRunAll: (mode: string) => void;
  running: boolean; activeMode: string | null;
}) {
  const meta = MODE_META[modeKey];
  const done = count === 0;
  const isActive = activeMode === modeKey;
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<PreviewProduct[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => { setPreview(null); }, [count]);

  const togglePreview = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (preview) return;
    setLoadingPreview(true);
    try {
      const r = await fetch(`/api/admin/products/smart-process?preview=${modeKey}`);
      const d = await r.json();
      setPreview(d.products ?? []);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div style={{ borderBottom: `1px solid ${C.ash}` }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
        opacity: done ? 0.45 : 1,
      }}>
        {/* Status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: done ? C.green : isActive ? C.black : C.ash,
          border: done ? "none" : `1.5px solid ${isActive ? C.black : "#bbb"}`,
        }} />

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.rich, lineHeight: 1.43 }}>
            {meta.label}
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            {meta.description}
          </div>
        </div>

        {/* Count + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {done
            ? <Badge variant="green">✓ Готово</Badge>
            : <Badge variant="neutral">{count}</Badge>
          }
          {!done && (
            <>
              <GhostBtn onClick={togglePreview} disabled={running || loadingPreview}>
                {loadingPreview ? "…" : expanded ? "Скрыть ▲" : "Список ▼"}
              </GhostBtn>
              <GhostBtn onClick={() => onRunBatch(modeKey)} disabled={running}>
                {isActive ? "Обработка…" : "Пакет"}
              </GhostBtn>
              <GhostBtn onClick={() => onRunAll(modeKey)} disabled={running}>
                Всё
              </GhostBtn>
            </>
          )}
        </div>
      </div>

      {/* Preview list */}
      {expanded && preview && (
        <div style={{
          margin: "0 0 12px 20px",
          background: C.ghost, borderRadius: 10, padding: "10px 12px",
          maxHeight: 220, overflowY: "auto",
        }}>
          {preview.length === 0
            ? <span style={{ fontSize: 13, color: C.muted }}>Список пуст</span>
            : preview.map(p => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 0", borderBottom: `1px solid ${C.ash}`,
                  fontSize: 13, color: C.rich,
                }}>
                  <span style={{ fontSize: 16 }}>{p.icon}</span>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {p.category && <span style={{ fontSize: 11, color: C.muted }}>{p.category}</span>}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Log table ─────────────────────────────────────────────────────────────────

const LATIN_LANGS = ["en", "de", "it", "fr", "es", "pt-BR"];
const ALL_LANGS   = ["en", "ru", "de", "it", "fr", "es", "pt-BR", "uk"];

function hasCyrillicStr(s: string) { return /[Ѐ-ӿ]/.test(s); }

function LogRow({ r }: { r: ProcessResult }) {
  const [open, setOpen] = useState(false);
  const hasError = !!r.error;
  const hasCyrillicIssue = !hasError && r.translations
    ? LATIN_LANGS.some(l => r.translations![l] && hasCyrillicStr(r.translations![l]))
    : false;

  const statusColor = hasError ? C.red : hasCyrillicIssue ? "#d97706" : "#0a7a1c";
  const statusIcon  = hasError ? "✗" : hasCyrillicIssue ? "⚠" : "✓";

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        style={{
          borderBottom: `1px solid ${C.ghost}`,
          cursor: "pointer",
          background: open ? C.ghost : "transparent",
        }}
      >
        <td style={{ padding: "7px 8px", width: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{statusIcon}</span>
        </td>
        <td style={{ padding: "7px 8px", color: hasError ? C.red : C.rich, fontWeight: 500 }}>
          {r.name}
          {hasError && <span style={{ fontSize: 11, color: C.red, display: "block", fontWeight: 400 }}>{r.error!.slice(0, 80)}</span>}
          {hasCyrillicIssue && <span style={{ fontSize: 11, color: "#d97706", display: "block", fontWeight: 400 }}>Кириллица в латинских языках после сохранения</span>}
        </td>
        <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
          <Badge variant={hasError ? "red" : "neutral"}>{MODE_META[r.action]?.label ?? r.action}</Badge>
        </td>
        <td style={{ padding: "7px 8px", color: C.muted, fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>
          {r.savedRows != null ? `${r.savedRows} строк` : "—"}
        </td>
        <td style={{ padding: "7px 8px", color: C.muted, fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>
          {!hasError && (r.inputTokens + r.outputTokens) > 0 ? (r.inputTokens + r.outputTokens).toLocaleString() : "—"}
        </td>
      </tr>
      {open && (
        <tr style={{ background: C.ghost }}>
          <td colSpan={5} style={{ padding: "8px 12px 12px 36px" }}>
            {r.error ? (
              <div style={{ fontSize: 12, color: C.red, fontFamily: "monospace" }}>{r.error}</div>
            ) : r.translations ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                {ALL_LANGS.map(l => {
                  const val = r.translations![l] ?? "—";
                  const bad = LATIN_LANGS.includes(l) && hasCyrillicStr(val);
                  return (
                    <div key={l} style={{ fontSize: 12, minWidth: 120 }}>
                      <span style={{ color: C.muted, fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>{l} </span>
                      <span style={{ color: bad ? C.red : C.rich, fontWeight: bad ? 600 : 400 }}>{val}</span>
                      {bad && <span style={{ color: C.red }}> ⚠</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: C.muted }}>Нет данных</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function LogTable({ log }: { log: ProcessResult[] }) {
  const shown = log.slice(0, 100);
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.ash}` }}>
            {["", "Продукт", "Действие", "Сохранено", "Токены"].map((h, i) => (
              <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => <LogRow key={i} r={r} />)}
        </tbody>
      </table>
      {log.length > 100 && (
        <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 10 }}>
          Показано 100 из {log.length}
        </div>
      )}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProductBrainPanel() {
  const [provider, setProvider] = useState<ProviderType>("deepl");
  const [batchSize, setBatchSize] = useState<5 | 10 | 20>(10);

  const [stats, setStats] = useState<SmartStats | null>(null);
  const [translationRows, setTranslationRows] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [running, setRunning] = useState(false);
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [log, setLog] = useState<ProcessResult[]>([]);
  const [status, setStatus] = useState("");
  const [currentItem, setCurrentItem] = useState<string | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalTokensIn, setTotalTokensIn] = useState(0);
  const [totalTokensOut, setTotalTokensOut] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const stopRef = useRef(false);
  const processedIdsRef = useRef(new Set<string>());

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const r = await fetch("/api/admin/products/smart-process");
      const d = await r.json();
      if (d.stats) setStats(d.stats);
      if (d.debug?.translationRows != null) setTranslationRows(d.debug.translationRows);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const applyBatchResult = (data: SmartResponse, accProcessed: number) => {
    const next = accProcessed + data.processed;
    setTotalProcessed(next);
    if (data.usage) {
      setTotalTokensIn(prev => prev + data.usage!.inputTokens);
      setTotalTokensOut(prev => prev + data.usage!.outputTokens);
      setTotalCost(prev => prev + data.usage!.costUsd);
    }
    const last = data.results[data.results.length - 1];
    if (last) setCurrentItem(last.name);
    setLog(prev => [...data.results, ...prev].slice(0, 300));
    if (data.stats) setStats(data.stats);
    return next;
  };

  // Single batch — run exactly batchSize items, then stop
  const runBatch = async (mode: string) => {
    if (running) return;
    setRunning(true);
    setActiveMode(mode);
    setCurrentItem(null);
    setStatus("Запускаю…");
    try {
      const res = await fetch("/api/admin/products/smart-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, limit: batchSize, provider }),
      });
      if (!res.ok) { const e = await res.json(); setStatus(`Ошибка: ${e.error ?? "неизвестная"}`); return; }
      const data: SmartResponse = await res.json();
      applyBatchResult(data, totalProcessed);
      setStatus(data.processed === 0
        ? "Нечего обрабатывать в этой категории"
        : `Готово: ${data.processed} продуктов. Осталось в категории: ${data.modeRemaining}`);
    } catch {
      setStatus("Ошибка сети");
    } finally {
      setRunning(false);
      setActiveMode(null);
      setCurrentItem(null);
    }
  };

  // Full loop — run until this mode's queue is empty
  const runLoop = async (mode: string) => {
    if (running) return;
    stopRef.current = false;
    processedIdsRef.current = new Set();
    setRunning(true);
    setActiveMode(mode);
    setLog([]);
    setTotalProcessed(0);
    setTotalTokensIn(0);
    setTotalTokensOut(0);
    setTotalCost(0);
    setCurrentItem(null);
    setStatus("Запускаю…");

    let processed = 0;
    const isAutoLoop = mode === "auto";
    // For auto: track totalIssues; for specific mode: track modeRemaining
    let remaining = stats?.totalIssues ?? 999;

    while (remaining > 0 && !stopRef.current) {
      setStatus(`${isAutoLoop ? "Авто" : (MODE_META[mode]?.label ?? mode)}… осталось ~${remaining}`);
      try {
        const res = await fetch("/api/admin/products/smart-process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, limit: batchSize, provider }),
        });
        if (!res.ok) { const e = await res.json(); setStatus(`Ошибка: ${e.error ?? "неизвестная"}`); break; }

        const data: SmartResponse = await res.json();

        // Nothing to process in this mode/cycle
        if (data.processed === 0) {
          if (isAutoLoop) {
            remaining = data.remaining; // totalIssues — auto tries all modes
            if (remaining === 0) break;
            // backend may have switched to a mode with no items; try once more
            // but break if we've already made progress and got 0
            break;
          } else {
            break;
          }
        }

        const batchIds = data.results.map(r => r.productId);
        const allSeen = batchIds.every(id => processedIdsRef.current.has(id));
        if (allSeen) { setStatus("⚠ Продукты не поддаются исправлению — остановлено."); break; }
        batchIds.forEach(id => processedIdsRef.current.add(id));

        processed = applyBatchResult(data, processed);
        remaining = isAutoLoop ? data.remaining : (data.modeRemaining ?? 0);
      } catch {
        setStatus("Ошибка сети — остановлено");
        break;
      }
    }

    setRunning(false);
    setActiveMode(null);
    setCurrentItem(null);
    if (stopRef.current) {
      setStatus("Остановлено.");
    } else if (remaining === 0) {
      setStatus("✓ База в идеальном состоянии!");
      await loadStats();
    } else {
      setStatus(`Готово. Обработано: ${processed}, осталось: ${remaining}`);
      await loadStats();
    }
  };

  const stop = () => { stopRef.current = true; setStatus("Останавливаю…"); };

  const allDone = stats?.isClean ?? false;
  const selectedProvider = PROVIDERS.find(p => p.id === provider)!;
  const estCost = selectedProvider.costPer != null && stats
    ? selectedProvider.costPer === 0
      ? "Бесплатно"
      : `~$${(selectedProvider.costPer * stats.totalIssues).toFixed(2)}`
    : null;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 780 }}>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>

      {/* ── Control card ──────────────────────────────────────────────────── */}
      <div style={{
        background: C.white, borderRadius: 14,
        boxShadow: CARD_SHADOW, padding: 20,
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.45px", color: C.black, lineHeight: 1.33 }}>
              {allDone ? "🎉 База в порядке" : "Обработка продуктов"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              {allDone
                ? `Все ${stats?.total} продуктов имеют полные переводы и синонимы`
                : "Авто-режим: переводы → языки → синонимы"
              }
            </p>
          </div>
          {stats && !allDone && (
            <Badge variant="neutral">{stats.totalIssues} задач</Badge>
          )}
        </div>

        {!allDone && (
          <>
            {/* Model selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 8 }}>
                Модель
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {PROVIDERS.map(p => {
                  const sel = provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={running}
                      onClick={() => setProvider(p.id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        gap: 2, padding: "10px 12px",
                        borderRadius: 10, border: `1px solid ${sel ? C.black : C.ash}`,
                        background: sel ? C.black : C.white,
                        cursor: running ? "not-allowed" : "pointer",
                        transition: "border-color 0.12s, background 0.12s",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: sel ? C.white : C.rich }}>
                          {p.label}
                        </span>
                        {p.badge && (
                          <span style={{
                            marginLeft: "auto", fontSize: 10, fontWeight: 600, borderRadius: 26,
                            padding: "1px 6px",
                            background: sel ? "rgba(255,255,255,0.2)" : C.ghost,
                            color: sel ? C.white : C.muted,
                          }}>
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: sel ? "rgba(255,255,255,0.6)" : C.muted }}>
                        {p.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Batch size + cost */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 6 }}>
                  Продуктов за раз
                </div>
                <div style={{ display: "flex" }}>
                  {BATCH_SIZES.map((n, i) => (
                    <button
                      key={n}
                      type="button"
                      disabled={running}
                      onClick={() => setBatchSize(n)}
                      style={{
                        padding: "5px 16px", fontSize: 13, fontWeight: 500, cursor: running ? "not-allowed" : "pointer",
                        background: batchSize === n ? C.black : C.white,
                        color: batchSize === n ? C.white : C.rich,
                        border: `1px solid ${C.ash}`,
                        borderLeft: i === 0 ? `1px solid ${C.ash}` : "none",
                        borderRadius: i === 0 ? "10px 0 0 10px" : i === BATCH_SIZES.length - 1 ? "0 10px 10px 0" : "0",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {estCost && (
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>
                    Оценка стоимости
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 600, letterSpacing: "-0.45px",
                    color: estCost === "Бесплатно" ? "#0a7a1c" : C.black,
                  }}>
                    {estCost}
                  </div>
                  {estCost !== "Бесплатно" && stats && (
                    <div style={{ fontSize: 11, color: C.muted }}>за {stats.totalIssues} продуктов</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!running ? (
            <>
              <GhostBtn size="md" disabled={loadingStats || allDone} onClick={() => runBatch("auto")}>
                Пакет · {batchSize}
              </GhostBtn>
              <button
                type="button"
                disabled={loadingStats || allDone}
                onClick={() => runLoop("auto")}
                style={{
                  padding: "9px 24px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none",
                  background: allDone ? C.ghost : C.black, color: allDone ? C.muted : C.white,
                  cursor: loadingStats || allDone ? "not-allowed" : "pointer",
                }}
              >
                {allDone ? "✓ Всё готово" : "🪄 Запустить всё"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={stop}
              style={{
                padding: "9px 24px", fontSize: 14, fontWeight: 600, borderRadius: 10,
                border: `1px solid ${C.ash}`, background: C.white, color: C.rich, cursor: "pointer",
              }}
            >
              Остановить
            </button>
          )}

          {running && currentItem && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: C.black, flexShrink: 0,
                animation: "blink 1s infinite",
              }} />
              <span style={{ fontSize: 13, color: C.muted }}>{currentItem}</span>
            </div>
          )}
        </div>

        {/* Progress metrics */}
        {(running || totalProcessed > 0) && (
          <div style={{
            marginTop: 14, padding: "12px 14px",
            background: C.ghost, borderRadius: 10,
            display: "flex", gap: 24, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>Обработано</div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.45px", color: C.black }}>{totalProcessed}</div>
            </div>
            {totalTokensIn + totalTokensOut > 0 && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>Токены</div>
                  <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.45px", color: C.black }}>
                    {(totalTokensIn + totalTokensOut).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>Стоимость</div>
                  <div style={{
                    fontSize: 22, fontWeight: 600, letterSpacing: "-0.45px",
                    color: totalCost > 0.05 ? C.red : C.black,
                  }}>
                    ${totalCost.toFixed(4)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Status */}
        {status && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 10, fontSize: 13,
            background: status.startsWith("✓") ? "#f0fdf4"
              : status.startsWith("Ошибка") || status.startsWith("⚠") ? "#fff5f2"
              : C.ghost,
            color: status.startsWith("✓") ? "#166534"
              : status.startsWith("Ошибка") || status.startsWith("⚠") ? C.red
              : C.muted,
          }}>
            {status}
          </div>
        )}
      </div>

      {/* ── Issues card ───────────────────────────────────────────────────── */}
      <div style={{ background: C.white, borderRadius: 14, boxShadow: CARD_SHADOW, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 4 }}>
          Что нужно исправить
        </div>

        {loadingStats ? (
          <div style={{ padding: "20px 0", color: C.muted, fontSize: 13 }}>Загружаю статистику…</div>
        ) : stats ? (
          <>
            <IssueRow modeKey="fix-names"        count={stats.badNames}          onRunBatch={runBatch} onRunAll={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="fix-translations" count={stats.badTranslations}   onRunBatch={runBatch} onRunAll={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="fill-languages"   count={stats.missingLanguages}  onRunBatch={runBatch} onRunAll={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="pending"          count={stats.pendingModeration} onRunBatch={runBatch} onRunAll={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="enrich-synonyms"  count={stats.poorSynonyms}      onRunBatch={runBatch} onRunAll={runLoop} running={running} activeMode={activeMode} />

            {/* Bottom stats row */}
            <div style={{
              display: "flex", gap: 20, marginTop: 16, paddingTop: 14,
              borderTop: `1px solid ${C.ash}`, flexWrap: "wrap", alignItems: "center",
            }}>
              {[
                { value: stats.total,                    label: "продуктов" },
                { value: translationRows?.toLocaleString() ?? "—", label: "строк переводов", warn: translationRows != null && stats.total > 0 && translationRows > stats.total * 8 },
                { value: stats.total - stats.totalIssues, label: "без проблем",  green: true },
                { value: stats.totalIssues,               label: "с проблемами", red: stats.totalIssues > 0 },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    fontSize: 22, fontWeight: 600, letterSpacing: "-0.45px",
                    color: s.red ? C.red : s.green && stats.totalIssues === 0 ? "#0a7a1c" : C.black,
                  }}>
                    {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                    {(s as { warn?: boolean }).warn && <span style={{ fontSize: 12, color: C.red, marginLeft: 4 }}>⚠ дубли</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
                </div>
              ))}
              <button
                type="button"
                onClick={loadStats}
                disabled={loadingStats}
                style={{
                  marginLeft: "auto", padding: "5px 14px", fontSize: 13, fontWeight: 500, borderRadius: 9999,
                  border: `1px solid ${C.ash}`, background: C.white, color: C.rich, cursor: loadingStats ? "not-allowed" : "pointer",
                }}
              >
                Обновить
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Log card ──────────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div style={{ background: C.white, borderRadius: 14, boxShadow: CARD_SHADOW, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Лог обработки
            </span>
            <Badge variant="neutral">{log.length} шт</Badge>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(MODE_META).map(key => {
                const cnt = log.filter(l => l.action === key && !l.error).length;
                if (!cnt) return null;
                return <Badge key={key} variant="neutral">{MODE_META[key].label}: {cnt}</Badge>;
              })}
              {log.filter(l => l.error).length > 0 && (
                <Badge variant="red">Ошибки: {log.filter(l => l.error).length}</Badge>
              )}
            </div>
          </div>

          <LogTable log={log} />
        </div>
      )}
    </div>
  );
}
