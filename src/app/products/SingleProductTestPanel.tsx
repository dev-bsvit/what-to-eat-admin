"use client";

import { useState, useRef } from "react";

const LANGUAGES = ["en", "ru", "de", "it", "fr", "es", "pt-BR", "uk"] as const;
const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪", it: "🇮🇹",
  fr: "🇫🇷", es: "🇪🇸", "pt-BR": "🇧🇷", uk: "🇺🇦",
};
const LATIN = ["en", "de", "it", "fr", "es", "pt-BR"];
const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);

type SearchProduct = { id: string; canonical_name: string; category: string | null; icon: string | null };
type Translation = { name: string; synonyms: string[]; description: string | null; storage_tips: string | null };
type Translations = Record<string, Translation>;

type TestResult = {
  before: Translations;
  after: Translations;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timeTaken: number;
  applied: boolean;
  issues: string[];
  product: { id: string; name: string; canonicalAfter: string };
};

const s = {
  card: (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #e0e0e0", borderRadius: 14, background: "#fff", padding: "20px 24px", ...extra,
  }),
  input: {
    border: "1px solid #d4d4d4", borderRadius: 10, padding: "10px 14px",
    fontSize: 14, outline: "none", background: "#fff", width: "100%",
  } as React.CSSProperties,
  btn: (opts?: { color?: string; disabled?: boolean; outline?: boolean }): React.CSSProperties => {
    const { color = "#000", disabled, outline } = opts ?? {};
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      border: `1.5px solid ${color}`, background: outline ? "#fff" : color,
      color: outline ? color : "#fff", borderRadius: 10, padding: "9px 18px",
      fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, whiteSpace: "nowrap" as const,
    };
  },
};

function TranslationDiff({ before, after }: { before: Translations; after: Translations }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f7f7f7" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#555", width: 50 }}>Яз</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#888" }}>До</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#1a6b1a" }}>После</th>
            <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#555", width: 60 }}>Синонимов</th>
          </tr>
        </thead>
        <tbody>
          {LANGUAGES.map(lang => {
            const b = before[lang];
            const a = after[lang];
            const changed = b?.name !== a?.name;
            const wasError = b && LATIN.includes(lang) && hasCyrillic(b.name);
            const stillError = a && LATIN.includes(lang) && hasCyrillic(a.name);

            return (
              <tr key={lang} style={{ borderBottom: "1px solid #f0f0f0", background: wasError ? "#fff8f7" : "transparent" }}>
                <td style={{ padding: "9px 12px", fontWeight: 700 }}>
                  {LANG_FLAGS[lang]} <span style={{ fontSize: 11, color: "#aaa" }}>{lang}</span>
                </td>
                <td style={{ padding: "9px 12px" }}>
                  {b ? (
                    <span style={{ color: wasError ? "#c22b10" : "#555" }}>
                      {wasError && "⚠ "}{b.name}
                      {b.synonyms?.length > 0 && (
                        <span style={{ fontSize: 11, color: "#aaa", marginLeft: 6 }}>
                          ({b.synonyms.slice(0, 2).join(", ")}{b.synonyms.length > 2 ? "…" : ""})
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: "#ddd" }}>—</span>}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  {a ? (
                    <span style={{ color: stillError ? "#c22b10" : changed ? "#1a6b1a" : "#111", fontWeight: changed ? 600 : 400 }}>
                      {stillError && "⚠ "}{changed && !stillError && "✓ "}{a.name}
                      {a.synonyms?.length > 0 && (
                        <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>
                          ({a.synonyms.slice(0, 2).join(", ")}{a.synonyms.length > 2 ? "…" : ""})
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: "#ddd" }}>—</span>}
                </td>
                <td style={{ padding: "9px 12px", textAlign: "center" }}>
                  {a ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: (a.synonyms?.length ?? 0) >= 3 ? "#22c55e" : "#c22b10",
                    }}>
                      {a.synonyms?.length ?? 0}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultCard({
  provider,
  result,
  running,
  onTest,
  onApply,
  selectedProductId,
}: {
  provider: "openai" | "nvidia";
  result: TestResult | null;
  running: boolean;
  onTest: () => void;
  onApply: () => void;
  selectedProductId: string | null;
}) {
  const isNvidia = provider === "nvidia";
  const color = isNvidia ? "#1a6b1a" : "#000";
  const label = isNvidia ? "Gemma 3N (NVIDIA)" : "GPT-4o-mini";

  return (
    <div style={s.card({ flex: 1, minWidth: 0 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: color, color: "#fff", borderRadius: 7, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
            {label}
          </span>
          {result && (
            <span style={{ fontSize: 12, color: "#aaa" }}>
              {result.timeTaken}ms · {(result.inputTokens + result.outputTokens).toLocaleString()} токенов · ${result.costUsd.toFixed(5)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={s.btn({ color, disabled: running || !selectedProductId })}
            disabled={running || !selectedProductId}
            onClick={onTest}
          >
            {running ? "Тестирую…" : "Тест"}
          </button>
          {result && !result.applied && (
            <button
              type="button"
              style={s.btn({ color, outline: true, disabled: running })}
              disabled={running}
              onClick={onApply}
            >
              Применить
            </button>
          )}
          {result?.applied && (
            <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>✓ Сохранено</span>
          )}
        </div>
      </div>

      {result ? (
        <>
          {result.issues.length > 0 && (
            <div style={{ marginBottom: 10, fontSize: 12, color: "#c22b10", background: "#fff5f2", padding: "6px 10px", borderRadius: 8 }}>
              Найдено: {result.issues.join(" · ")}
            </div>
          )}
          <TranslationDiff before={result.before} after={result.after} />
        </>
      ) : (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#ccc", fontSize: 13 }}>
          {selectedProductId ? "Нажми «Тест» чтобы увидеть результат" : "Сначала выбери продукт"}
        </div>
      )}
    </div>
  );
}

export default function SingleProductTestPanel() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<SearchProduct | null>(null);
  const [beforeTranslations, setBeforeTranslations] = useState<Translations>({});

  const [gptResult, setGptResult] = useState<TestResult | null>(null);
  const [nvidiaResult, setNvidiaResult] = useState<TestResult | null>(null);
  const [runningGpt, setRunningGpt] = useState(false);
  const [runningNvidia, setRunningNvidia] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchProducts = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`/api/admin/products/test-single?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setSuggestions(d.products ?? []);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const selectProduct = async (p: SearchProduct) => {
    setSelectedProduct(p);
    setQuery(p.canonical_name);
    setSuggestions([]);
    setGptResult(null);
    setNvidiaResult(null);

    const r = await fetch(`/api/admin/products/test-single?productId=${p.id}`);
    const d = await r.json();
    if (d.before) setBeforeTranslations(d.before);
  };

  const runTest = async (provider: "openai" | "nvidia", apply = false) => {
    if (!selectedProduct) return;
    const setRunning = provider === "openai" ? setRunningGpt : setRunningNvidia;
    const setResult = provider === "openai" ? setGptResult : setNvidiaResult;
    const current = provider === "openai" ? gptResult : nvidiaResult;

    setRunning(true);
    try {
      const r = await fetch("/api/admin/products/test-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.id, provider, apply }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setResult({ ...d, before: apply ? (current?.before ?? beforeTranslations) : beforeTranslations });
      if (apply) setBeforeTranslations(d.after);
    } finally {
      setRunning(false);
    }
  };

  const hasIssues = Object.entries(beforeTranslations).some(([lang, t]) =>
    LATIN.includes(lang) && hasCyrillic(t.name)
  ) || LANGUAGES.some(l => !beforeTranslations[l]);

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1200 }}>

      {/* Search */}
      <div style={s.card()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Выбери продукт для теста
        </div>
        <div style={{ position: "relative" }}>
          <input
            value={query}
            onChange={e => searchProducts(e.target.value)}
            placeholder="Начни вводить название продукта…"
            style={s.input}
          />
          {(suggestions.length > 0 || searchLoading) && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
              background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)", marginTop: 4, overflow: "hidden",
            }}>
              {searchLoading ? (
                <div style={{ padding: "12px 14px", color: "#aaa", fontSize: 13 }}>Ищу…</div>
              ) : suggestions.map(p => (
                <div
                  key={p.id}
                  style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, display: "flex", gap: 10, alignItems: "center" }}
                  onMouseDown={() => selectProduct(p)}
                >
                  <span style={{ fontSize: 18 }}>{p.icon ?? "📦"}</span>
                  <span style={{ fontWeight: 500 }}>{p.canonical_name}</span>
                  <span style={{ fontSize: 12, color: "#aaa", marginLeft: "auto" }}>{p.category ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedProduct && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 28 }}>{selectedProduct.icon ?? "📦"}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedProduct.canonical_name}</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>{selectedProduct.category ?? "—"} · {selectedProduct.id.slice(0, 8)}…</div>
            </div>
            {hasIssues && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#c22b10", background: "#fff5f2", border: "1px solid #fac5bb", borderRadius: 7, padding: "3px 10px", fontWeight: 700 }}>
                Есть проблемы
              </span>
            )}
            {!hasIssues && Object.keys(beforeTranslations).length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#22c55e", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 7, padding: "3px 10px", fontWeight: 700 }}>
                Переводы ОК
              </span>
            )}
          </div>
        )}
      </div>

      {/* Side by side results */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <ResultCard
          provider="openai"
          result={gptResult}
          running={runningGpt}
          selectedProductId={selectedProduct?.id ?? null}
          onTest={() => runTest("openai")}
          onApply={() => runTest("openai", true)}
        />
        <ResultCard
          provider="nvidia"
          result={nvidiaResult}
          running={runningNvidia}
          selectedProductId={selectedProduct?.id ?? null}
          onTest={() => runTest("nvidia")}
          onApply={() => runTest("nvidia", true)}
        />
      </div>
    </div>
  );
}
