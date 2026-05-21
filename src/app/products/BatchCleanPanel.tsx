"use client";

import { useState, useEffect, useRef } from "react";

type Stats = {
  total: number;
  needsTranslation: number;
  needsNormalization: number;
  needsProcessing: number;
};

type CleanResult = {
  productId: string;
  originalName: string;
  cleanName: string;
  changed: boolean;
  error?: string;
};

type BatchResponse = {
  success: boolean;
  processed: number;
  changed: number;
  errors: number;
  remaining: number;
  results: CleanResult[];
  stats: Stats;
  badTranslations?: number;
  error?: string;
};

const s = {
  card: (style?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #e0e0e0",
    borderRadius: 14,
    background: "#fff",
    padding: "18px 20px",
    ...style,
  }),
  btn: (primary = false, disabled = false, color?: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: primary ? `1px solid ${color ?? "#000"}` : "1px solid #d4d4d4",
    background: primary ? (color ?? "#000") : "#fff",
    color: primary ? "#fff" : "#0a0a0a",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  }),
  badge: (tone: "green" | "red" | "orange" | "dark" | "default"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "2px 9px",
    fontSize: 12,
    fontWeight: 600,
    background: tone === "dark" ? "#000" : tone === "green" ? "#edfaef" : tone === "red" ? "#fff5f2" : tone === "orange" ? "#fff8ed" : "#f2f2f2",
    color: tone === "dark" ? "#fff" : tone === "green" ? "#0f7a1f" : tone === "red" ? "#c22b10" : tone === "orange" ? "#8a4b00" : "#555",
    border: tone === "dark" ? "1px solid #000" : tone === "green" ? "1px solid #b6e8be" : tone === "red" ? "1px solid #fac5bb" : tone === "orange" ? "1px solid #fad5a0" : "1px solid #e0e0e0",
  }),
};

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
        <span>{value} из {total} обработано</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 8, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: pct === 100 ? "#22c55e" : "#000",
          borderRadius: 99,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

export default function BatchCleanPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [badTranslations, setBadTranslations] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeMode, setActiveMode] = useState<"clean" | "fix-translations">("clean");
  const [stopped, setStopped] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [changed, setChanged] = useState(0);
  const [errors, setErrors] = useState(0);
  const [log, setLog] = useState<CleanResult[]>([]);
  const [status, setStatus] = useState("");
  const stopRef = useRef(false);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/products/batch-clean");
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.badTranslations !== undefined) setBadTranslations(data.badTranslations);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const runLoop = async (mode: "clean" | "fix-translations") => {
    if (running) return;
    stopRef.current = false;
    setStopped(false);
    setRunning(true);
    setActiveMode(mode);
    setProcessed(0);
    setChanged(0);
    setErrors(0);
    setLog([]);
    setStatus("Запускаю...");

    let totalProcessed = 0;
    let totalChanged = 0;
    let totalErrors = 0;
    let remaining = mode === "fix-translations"
      ? (badTranslations ?? 0)
      : (stats?.needsProcessing ?? 0);

    while (remaining > 0 && !stopRef.current) {
      setStatus(
        mode === "fix-translations"
          ? `Исправляю переводы... осталось ~${remaining} продуктов`
          : `Обрабатываю... осталось ~${remaining} продуктов`
      );

      try {
        const res = await fetch("/api/admin/products/batch-clean", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5, dryRun: false, mode }),
        });

        if (!res.ok) {
          const err = await res.json();
          setStatus(`Ошибка: ${err.error ?? "неизвестная ошибка"}`);
          break;
        }

        const data: BatchResponse = await res.json();

        if (data.processed === 0) {
          remaining = data.remaining;
          break;
        }

        totalProcessed += data.processed;
        totalChanged += data.changed;
        totalErrors += data.errors;
        remaining = data.remaining;

        setProcessed(totalProcessed);
        setChanged(totalChanged);
        setErrors(totalErrors);
        setLog((prev) => [...data.results, ...prev].slice(0, 200));

        if (data.stats) setStats(data.stats);
        if (data.badTranslations !== undefined) setBadTranslations(data.badTranslations);
      } catch {
        setStatus("Ошибка сети — остановлено");
        break;
      }
    }

    setRunning(false);
    if (stopRef.current) {
      setStopped(true);
      setStatus("Остановлено вручную.");
    } else if (remaining === 0) {
      setStatus(mode === "fix-translations" ? "✓ Все переводы исправлены!" : "✓ Все продукты обработаны!");
      await loadStats();
    } else if (totalProcessed === 0) {
      setStatus(`⚠ Не удалось обработать ${remaining} продуктов — нажмите ещё раз`);
      await loadStats();
    } else {
      setStatus(`Завершено. Обработано: ${totalProcessed}, осталось: ${remaining} — нажмите для продолжения`);
      await loadStats();
    }
  };

  const stop = () => {
    stopRef.current = true;
    setStatus("Останавливаю после текущей порции...");
  };

  const total = stats?.total ?? 0;
  const done = total - (stats?.needsProcessing ?? total);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header — Clean */}
      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={s.badge("dark")}>GPT-4o-mini</span>
              {stats && (
                <span style={s.badge(stats.needsProcessing === 0 ? "green" : "orange")}>
                  {stats.needsProcessing === 0 ? "База чистая" : `${stats.needsProcessing} нужна обработка`}
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              Очистка базы продуктов
            </h2>
            <p style={{ margin: "6px 0 0", color: "#737373", fontSize: 13, lineHeight: 1.5, maxWidth: 600 }}>
              Нормализует названия, убирает мусор ("для подачи", "необязательно"),
              переводит на 8 языков, заполняет КБЖУ. ~$0.001 за продукт.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!running ? (
              <button
                type="button"
                style={s.btn(true, loadingStats || stats?.needsProcessing === 0)}
                disabled={loadingStats || stats?.needsProcessing === 0}
                onClick={() => runLoop("clean")}
              >
                {stats?.needsProcessing === 0 ? "✓ Готово" : "Запустить очистку"}
              </button>
            ) : activeMode === "clean" ? (
              <button type="button" style={s.btn(false)} onClick={stop}>
                Остановить
              </button>
            ) : null}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px" }}>{stats.total}</div>
              <div style={{ fontSize: 12, color: "#888" }}>всего продуктов</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", color: stats.needsTranslation > 0 ? "#c22b10" : "#22c55e" }}>
                {stats.needsTranslation}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>без переводов</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", color: stats.needsNormalization > 0 ? "#8a4b00" : "#22c55e" }}>
                {stats.needsNormalization}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>мусорных имён</div>
            </div>
            <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center" }}>
              {total > 0 && <ProgressBar value={done} total={total} />}
            </div>
          </div>
        )}

        {running && activeMode === "clean" && processed > 0 && (
          <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={s.badge("default")}>Обработано: {processed}</span>
            <span style={s.badge("green")}>Изменено: {changed}</span>
            {errors > 0 && <span style={s.badge("red")}>Ошибок: {errors}</span>}
          </div>
        )}

        {status && activeMode === "clean" && (
          <div style={{
            marginTop: 12,
            fontSize: 13,
            color: status.startsWith("Ошибка") ? "#c22b10" : status.startsWith("✓") ? "#0f7a1f" : "#444",
            padding: "8px 12px",
            background: status.startsWith("Ошибка") ? "#fff5f2" : status.startsWith("✓") ? "#edfaef" : "#f7f7f7",
            borderRadius: 8,
          }}>
            {status}
          </div>
        )}
      </div>

      {/* Fix Bad Translations */}
      <div style={s.card({ borderColor: badTranslations && badTranslations > 0 ? "#fad5a0" : "#e0e0e0" })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={s.badge(badTranslations === 0 ? "green" : "orange")}>
                {badTranslations === null ? "..." : badTranslations === 0 ? "Все переводы верны" : `${badTranslations} плохих перевода`}
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: 17, letterSpacing: "-0.3px" }}>
              Исправить переводы (кириллица в латинских языках)
            </h3>
            <p style={{ margin: "4px 0 0", color: "#737373", fontSize: 13, lineHeight: 1.5, maxWidth: 600 }}>
              Находит продукты где EN/DE/IT/FR/ES/PT перевод содержит кириллицу (напр. «Лимон» вместо «Lemon»).
              Перезапускает только переводы — canonical_name и КБЖУ не меняет.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!running ? (
              <button
                type="button"
                style={s.btn(true, loadingStats || badTranslations === 0, "#8a4b00")}
                disabled={loadingStats || badTranslations === 0}
                onClick={() => runLoop("fix-translations")}
              >
                {badTranslations === 0 ? "✓ Готово" : "Исправить переводы"}
              </button>
            ) : activeMode === "fix-translations" ? (
              <button type="button" style={s.btn(false)} onClick={stop}>
                Остановить
              </button>
            ) : null}
          </div>
        </div>

        {running && activeMode === "fix-translations" && processed > 0 && (
          <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={s.badge("default")}>Обработано: {processed}</span>
            <span style={s.badge("green")}>Исправлено: {changed}</span>
            {errors > 0 && <span style={s.badge("red")}>Ошибок: {errors}</span>}
          </div>
        )}

        {status && activeMode === "fix-translations" && (
          <div style={{
            marginTop: 12,
            fontSize: 13,
            color: status.startsWith("Ошибка") ? "#c22b10" : status.startsWith("✓") ? "#0f7a1f" : "#444",
            padding: "8px 12px",
            background: status.startsWith("Ошибка") ? "#fff5f2" : status.startsWith("✓") ? "#edfaef" : "#f7f7f7",
            borderRadius: 8,
          }}>
            {status}
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={s.card()}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 12 }}>
            Лог обработки
          </div>
          <div style={{ display: "grid", gap: 6, maxHeight: 500, overflowY: "auto" }}>
            {log.map((item) => (
              <div
                key={item.productId}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: item.error ? "#fff5f2" : item.changed ? "#f0f5ff" : "#fafafa",
                  fontSize: 13,
                }}
              >
                {item.error ? (
                  <>
                    <span style={{ color: "#c22b10", fontWeight: 600, whiteSpace: "nowrap" }}>✗ Ошибка</span>
                    <span style={{ color: "#888" }}>{item.originalName}</span>
                    <span style={{ color: "#c22b10", fontSize: 12 }}>{item.error}</span>
                  </>
                ) : item.changed ? (
                  <>
                    <span style={{ color: "#1a3fd4", fontWeight: 600, whiteSpace: "nowrap" }}>~ Изменено</span>
                    <span style={{ color: "#888", textDecoration: "line-through" }}>{item.originalName}</span>
                    <span>→</span>
                    <span style={{ fontWeight: 600 }}>{item.cleanName}</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: "#22c55e", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Переведено</span>
                    <span>{item.originalName}</span>
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
