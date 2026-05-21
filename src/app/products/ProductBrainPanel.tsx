"use client";

import { useState, useEffect, useRef } from "react";

type SmartStats = {
  total: number;
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
};

type SmartResponse = {
  success: boolean;
  mode?: string;
  resolvedMode?: string;
  processed: number;
  errors: number;
  remaining: number;
  results: ProcessResult[];
  stats: SmartStats;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  error?: string;
};

type PreviewProduct = { id: string; name: string; category: string | null; icon: string };

// ── Mode metadata ─────────────────────────────────────────────────────────────

const MODE_META: Record<string, { label: string; description: string; color: string; priority: number }> = {
  "fix-translations": {
    label: "Плохие переводы",
    description: "Кириллица в EN/DE/IT/FR/ES/PT полях",
    color: "#c22b10",
    priority: 1,
  },
  "fill-languages": {
    label: "Неполные языки",
    description: "Продукты без всех 8 переводов",
    color: "#8a4b00",
    priority: 2,
  },
  "pending": {
    label: "Новые продукты",
    description: "Пользовательские добавления на модерации",
    color: "#1a3fd4",
    priority: 3,
  },
  "enrich-synonyms": {
    label: "Бедные синонимы",
    description: "Меньше 3 синонимов — поиск работает хуже",
    color: "#555",
    priority: 4,
  },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #e0e0e0",
    borderRadius: 14,
    background: "#fff",
    padding: "20px 24px",
    ...extra,
  }),
  btn: (opts?: { primary?: boolean; color?: string; disabled?: boolean; size?: "sm" | "lg" }): React.CSSProperties => {
    const { primary, color = "#000", disabled, size = "sm" } = opts ?? {};
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: primary ? `1.5px solid ${color}` : "1.5px solid #d4d4d4",
      background: primary ? color : "#fff",
      color: primary ? "#fff" : "#0a0a0a",
      borderRadius: size === "lg" ? 12 : 8,
      padding: size === "lg" ? "14px 28px" : "8px 16px",
      fontSize: size === "lg" ? 15 : 13,
      fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      letterSpacing: size === "lg" ? "-0.3px" : 0,
      transition: "opacity 0.15s",
    };
  },
  badge: (color: string): React.CSSProperties => ({
    display: "inline-block",
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 700,
    background: color + "18",
    color,
    border: `1px solid ${color}40`,
  }),
};

// ── Issue row component ───────────────────────────────────────────────────────

function IssueRow({
  modeKey,
  count,
  onRun,
  running,
  activeMode,
}: {
  modeKey: string;
  count: number;
  onRun: (mode: string) => void;
  running: boolean;
  activeMode: string | null;
}) {
  const meta = MODE_META[modeKey];
  const isActive = activeMode === modeKey;
  const done = count === 0;
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<PreviewProduct[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    setPreview(null);
  }, [count]);

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
    <div style={{ borderBottom: "1px solid #f0f0f0" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 0",
        opacity: done ? 0.5 : 1,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: done ? "#22c55e" : meta.color,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: done ? "#888" : "#111" }}>
            {meta.label}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{meta.description}</div>
        </div>
        <div style={{
          fontSize: 22,
          fontWeight: 800,
          color: done ? "#22c55e" : meta.color,
          minWidth: 40,
          textAlign: "right",
          letterSpacing: "-1px",
        }}>
          {done ? "✓" : count}
        </div>
        {!done && (
          <>
            <button
              type="button"
              style={{ ...s.btn(), color: expanded ? meta.color : "#888", borderColor: expanded ? meta.color + "60" : "#d4d4d4" }}
              onClick={togglePreview}
              title="Посмотреть список"
            >
              {expanded ? "▲ Скрыть" : "▼ Список"}
            </button>
            <button
              type="button"
              style={s.btn({ disabled: running })}
              disabled={running}
              onClick={() => onRun(modeKey)}
            >
              {isActive ? "Работает…" : "Запустить"}
            </button>
          </>
        )}
      </div>

      {/* Inline product preview */}
      {expanded && !done && (
        <div style={{
          margin: "0 0 12px 26px",
          background: "#fafafa",
          borderRadius: 10,
          border: "1px solid #f0f0f0",
          overflow: "hidden",
        }}>
          {loadingPreview ? (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "#aaa" }}>Загружаю список…</div>
          ) : preview && preview.length > 0 ? (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {preview.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 14px",
                  borderBottom: i < preview.length - 1 ? "1px solid #f0f0f0" : "none",
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{p.icon}</span>
                  <span style={{ flex: 1, color: "#111", fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "#bbb" }}>{p.category ?? "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "#aaa" }}>Список пуст</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Provider config ───────────────────────────────────────────────────────────

type ProviderType = "deepl" | "deepl-nvidia" | "openai" | "nvidia";

const PROVIDER_META: Record<ProviderType, {
  label: string; emoji: string; color: string;
  badge?: string; badgeColor?: string;
  desc: string; costPer: number | null;
}> = {
  "deepl": {
    label: "DeepL + GPT-mini", emoji: "🔤", color: "#1746a2",
    badge: "Рекомендовано", badgeColor: "#1746a2",
    desc: "Точные переводы DeepL · синонимы GPT", costPer: 0.00053,
  },
  "deepl-nvidia": {
    label: "DeepL + Gemma", emoji: "🔤", color: "#7c3aed",
    badge: "Бесплатно", badgeColor: "#7c3aed",
    desc: "DeepL названия · синонимы Gemma · медленно", costPer: 0,
  },
  "openai": {
    label: "GPT-4o-mini", emoji: "🤖", color: "#111",
    desc: "Всё через GPT · быстро", costPer: 0.00086,
  },
  "nvidia": {
    label: "NVIDIA Gemma", emoji: "🧪", color: "#1a6b1a",
    badge: "Бесплатно", badgeColor: "#1a6b1a",
    desc: "Всё через Gemma · очень медленно", costPer: 0,
  },
};

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProductBrainPanel() {
  const [provider, setProvider] = useState<ProviderType>("deepl");
  const meta = PROVIDER_META[provider];
  const accentColor = meta.color;
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
    let remaining = stats?.totalIssues ?? 999;

    while (remaining > 0 && !stopRef.current) {
      setStatus(mode === "auto"
        ? `Обрабатываю… осталось задач: ~${remaining}`
        : `${MODE_META[mode]?.label ?? mode}… осталось: ~${remaining}`
      );

      try {
        const res = await fetch("/api/admin/products/smart-process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, limit: 10, provider }),
        });

        if (!res.ok) {
          const e = await res.json();
          setStatus(`Ошибка: ${e.error ?? "неизвестная"}`);
          break;
        }

        const data: SmartResponse = await res.json();

        if (data.processed === 0) {
          remaining = data.remaining;
          break;
        }

        // Detect stuck loop: all products in this batch were already processed
        const batchIds = data.results.map(r => r.productId);
        const allSeen = batchIds.every(id => processedIdsRef.current.has(id));
        if (allSeen) {
          setStatus("⚠ Продукты не поддаются исправлению — пропускаю.");
          break;
        }
        batchIds.forEach(id => processedIdsRef.current.add(id));

        processed += data.processed;
        remaining = data.remaining;
        setTotalProcessed(processed);

        // Update token/cost counters
        if (data.usage) {
          setTotalTokensIn(prev => prev + data.usage!.inputTokens);
          setTotalTokensOut(prev => prev + data.usage!.outputTokens);
          setTotalCost(prev => prev + data.usage!.costUsd);
        }

        // Show last processed item
        const last = data.results[data.results.length - 1];
        if (last) setCurrentItem(last.name);

        setLog(prev => [...data.results, ...prev].slice(0, 300));
        if (data.stats) setStats(data.stats);
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
    } else if (processed === 0) {
      setStatus("⚠ Нет задач или все задачи уже выполнены");
      await loadStats();
    } else {
      setStatus(`Пакет готов. Обработано: ${processed}, осталось: ${remaining}`);
    }
  };

  const stop = () => {
    stopRef.current = true;
    setStatus("Останавливаю…");
  };

  const allDone = stats?.isClean ?? false;
  const total = stats?.total ?? 0;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 800 }}>

      {/* Magic button card */}
      <div style={s.card({
        background: allDone ? "#f0fdf4" : "#fafafa",
        borderColor: allDone ? "#86efac" : "#e0e0e0",
      })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              {allDone ? "🎉 База в идеальном состоянии" : "Обработка продуктов"}
            </div>
            <div style={{ fontSize: 13, color: "#737373", marginTop: 4 }}>
              {allDone
                ? `Все ${total} продуктов имеют полные переводы и синонимы`
                : "Авто-режим: переводы → языки → синонимы. Выберите модель и запустите."
              }
            </div>
          </div>
          {stats && (
            <span style={s.badge(allDone ? "#22c55e" : "#8a4b00")}>
              {allDone ? "База чистая" : `${stats.totalIssues} проблем`}
            </span>
          )}
        </div>

        {/* Provider selector */}
        {!allDone && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Модель обработки
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              {(Object.entries(PROVIDER_META) as [ProviderType, typeof PROVIDER_META[ProviderType]][]).map(([id, m]) => {
                const selected = provider === id;
                const estCost = m.costPer != null && stats
                  ? m.costPer === 0 ? "Бесплатно" : `~$${(m.costPer * stats.totalIssues).toFixed(2)}`
                  : null;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={running}
                    onClick={() => setProvider(id)}
                    style={{
                      padding: "10px 12px", borderRadius: 10, textAlign: "left", cursor: running ? "not-allowed" : "pointer",
                      border: `2px solid ${selected ? m.color : "#e5e5e5"}`,
                      background: selected ? m.color + "12" : "#fff",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 15 }}>{m.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: selected ? m.color : "#111" }}>{m.label}</span>
                      {m.badge && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: m.badgeColor ?? m.color,
                          background: (m.badgeColor ?? m.color) + "18",
                          border: `1px solid ${(m.badgeColor ?? m.color)}40`,
                          borderRadius: 4, padding: "1px 5px", marginLeft: "auto",
                        }}>{m.badge}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>{m.desc}</div>
                    {estCost && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: m.costPer === 0 ? "#22c55e" : "#555", marginTop: 3 }}>
                        {estCost}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          {!running ? (
            <button
              type="button"
              style={s.btn({ primary: true, color: accentColor, disabled: loadingStats || allDone, size: "lg" })}
              disabled={loadingStats || allDone}
              onClick={() => runLoop("auto")}
            >
              {allDone ? "✓ Готово" : `${meta.emoji} Запустить всё`}
            </button>
          ) : (
            <button type="button" style={s.btn({ size: "lg" })} onClick={stop}>
              Остановить
            </button>
          )}
          {running && (
            <span style={{ fontSize: 13, color: accentColor, fontWeight: 600 }}>
              {meta.emoji} {meta.label}
            </span>
          )}
        </div>

        {/* Progress / metrics block */}
        {(running || totalProcessed > 0) && (
          <div style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#f5f5f5",
            display: "grid",
            gap: 8,
          }}>
            {currentItem && running && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}>
                <span style={{
                  display: "inline-block",
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#000",
                  animation: "pulse 1s infinite",
                  flexShrink: 0,
                }} />
                <span style={{ color: "#888" }}>Обрабатываю:</span>
                <span style={{ fontWeight: 600, color: "#111" }}>{currentItem}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Обработано</span>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>{totalProcessed}</div>
              </div>
              {totalTokensIn + totalTokensOut > 0 && (
                <>
                  <div>
                    <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Токены</span>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>
                      {(totalTokensIn + totalTokensOut).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Стоимость</span>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: totalCost > 0.05 ? "#c22b10" : "#111" }}>
                      ${totalCost.toFixed(4)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {status && (
          <div style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            background: status.startsWith("✓") ? "#dcfce7" : status.startsWith("Ошибка") ? "#fff5f2" : "#f5f5f5",
            color: status.startsWith("✓") ? "#166534" : status.startsWith("Ошибка") ? "#c22b10" : "#444",
          }}>
            {status}
          </div>
        )}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>

      {/* Issues breakdown */}
      <div style={s.card()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
          Что нужно исправить
        </div>

        {loadingStats ? (
          <div style={{ padding: "20px 0", color: "#aaa", fontSize: 13 }}>Загружаю статистику…</div>
        ) : stats ? (
          <div>
            <IssueRow modeKey="fix-translations" count={stats.badTranslations} onRun={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="fill-languages" count={stats.missingLanguages} onRun={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="pending" count={stats.pendingModeration} onRun={runLoop} running={running} activeMode={activeMode} />
            <IssueRow modeKey="enrich-synonyms" count={stats.poorSynonyms} onRun={runLoop} running={running} activeMode={activeMode} />

            <div style={{ display: "flex", gap: 24, marginTop: 16, paddingTop: 16, borderTop: "1px solid #f0f0f0", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px" }}>{stats.total}</div>
                <div style={{ fontSize: 11, color: "#888" }}>всего продуктов</div>
              </div>
              {translationRows != null && (
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontSize: 28, fontWeight: 800, letterSpacing: "-1px",
                    color: translationRows > 10000 ? "#c22b10" : translationRows > stats.total * 8 ? "#e0a000" : "#22c55e",
                  }}>
                    {translationRows.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    строк переводов
                    {translationRows > stats.total * 8 && <span style={{ color: "#c22b10" }}> ⚠ дубли</span>}
                  </div>
                </div>
              )}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", color: stats.totalIssues === 0 ? "#22c55e" : "#111" }}>
                  {stats.total - stats.totalIssues}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>без проблем</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", color: stats.totalIssues > 0 ? "#c22b10" : "#22c55e" }}>
                  {stats.totalIssues}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>уник. с проблемой</div>
              </div>
              <button
                type="button"
                style={{ ...s.btn(), marginLeft: "auto", alignSelf: "center" }}
                onClick={loadStats}
                disabled={loadingStats}
              >
                Обновить
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={s.card()}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Обработано продуктов
            </div>
            <div style={{ fontSize: 12, color: "#aaa" }}>{log.length} шт.</div>
            {/* mini summary by action */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(MODE_META).map(key => {
                const cnt = log.filter(l => l.action === key && !l.error).length;
                if (cnt === 0) return null;
                return (
                  <span key={key} style={s.badge(MODE_META[key].color)}>
                    {MODE_META[key].label}: {cnt}
                  </span>
                );
              })}
              {log.filter(l => l.error).length > 0 && (
                <span style={s.badge("#c22b10")}>
                  Ошибок: {log.filter(l => l.error).length}
                </span>
              )}
            </div>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 100px",
            gap: 8,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
            borderBottom: "1px solid #f0f0f0",
          }}>
            <span>Продукт</span>
            <span>Действие</span>
            <span style={{ textAlign: "right" }}>Токены</span>
          </div>

          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {log.map((item, i) => (
              <div key={`${item.productId}-${i}`} style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 100px",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                borderBottom: "1px solid #f7f7f7",
                background: item.error ? "#fff5f2" : "transparent",
                fontSize: 13,
              }}>
                {item.error ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ color: "#c22b10", fontWeight: 700, flexShrink: 0 }}>✗</span>
                      <span style={{ color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    </div>
                    <span style={{ color: "#c22b10", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.error.slice(0, 40)}
                    </span>
                    <span />
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    </div>
                    <span style={s.badge(MODE_META[item.action]?.color ?? "#555")}>
                      {MODE_META[item.action]?.label ?? item.action}
                    </span>
                    <span style={{ fontSize: 12, color: "#aaa", textAlign: "right" }}>
                      {item.inputTokens + item.outputTokens > 0
                        ? `${(item.inputTokens + item.outputTokens).toLocaleString()}`
                        : "—"}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
