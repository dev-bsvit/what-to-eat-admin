"use client";

import { useState, useEffect } from "react";

type ProductSummary = {
  id: string;
  canonical_name: string;
  category?: string;
  icon?: string;
  synonyms?: string[];
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbohydrates?: number | null;
  fiber?: number | null;
  preferred_unit?: string | null;
  description?: string | null;
  storage_tips?: string | null;
  translations?: Record<string, { name?: string; synonyms?: string[] }>;
};

type Candidate = {
  id: string;
  canonical_name: string;
  category?: string;
  icon?: string;
  score: number;
  matchedName: string;
  matchedInputName?: string;
  matchType?: string;
  matchReason: string;
};

type AgentDecision = {
  action: "approve_new" | "merge" | "needs_review" | "reject";
  confidence: number;
  mergeIntoProductId: string | null;
  reason: string;
  cleanProduct: ProductSummary;
};

type AgentResult = {
  productId: string;
  original: ProductSummary;
  candidates: Candidate[];
  decision: AgentDecision;
  applyResult: { applied: boolean; reason: string };
};

type AgentResponse = {
  success: boolean;
  dryRun: boolean;
  processed: number;
  results: AgentResult[];
  error?: string;
};

// ── Per-product override state ────────────────────────────────────────────────

type ProductAction = {
  action: AgentDecision["action"];
  mergeIntoProductId: string | null;
  applying: boolean;
  applied: boolean;
  error: string | null;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  badge: (tone: "default" | "dark" | "green" | "red" | "orange" | "blue"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    background:
      tone === "dark" ? "#000"
      : tone === "green" ? "#edfaef"
      : tone === "red" ? "#fff5f2"
      : tone === "orange" ? "#fff8ed"
      : tone === "blue" ? "#f0f5ff"
      : "#f2f2f2",
    color:
      tone === "dark" ? "#fff"
      : tone === "green" ? "#0f7a1f"
      : tone === "red" ? "#c22b10"
      : tone === "orange" ? "#8a4b00"
      : tone === "blue" ? "#1a3fd4"
      : "#404040",
    border:
      tone === "dark" ? "1px solid #000"
      : tone === "green" ? "1px solid #b6e8be"
      : tone === "red" ? "1px solid #fac5bb"
      : tone === "orange" ? "1px solid #fad5a0"
      : tone === "blue" ? "1px solid #c0d0fa"
      : "1px solid #e0e0e0",
  }),
  btn: (primary = false, disabled = false): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: primary ? "1px solid #000" : "1px solid #d4d4d4",
    background: primary ? "#000" : "#fff",
    color: primary ? "#fff" : "#0a0a0a",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "opacity 0.15s",
  }),
  select: (): React.CSSProperties => ({
    height: 36,
    borderRadius: 8,
    border: "1px solid #d4d4d4",
    padding: "0 10px",
    fontSize: 13,
    background: "#fff",
    cursor: "pointer",
  }),
};

const actionTone = (action: AgentDecision["action"]) => {
  if (action === "approve_new") return "green" as const;
  if (action === "merge") return "blue" as const;
  if (action === "reject") return "red" as const;
  return "orange" as const;
};

const actionLabel: Record<AgentDecision["action"], string> = {
  approve_new: "Одобрить как новый",
  merge: "Объединить (дубль)",
  needs_review: "Ручная проверка",
  reject: "Отклонить",
};

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function translationNames(product: ProductSummary) {
  const t = product.translations ?? {};
  return ["en", "ru", "uk"]
    .map((code) => (t[code]?.name ? `${code}: ${t[code]!.name}` : null))
    .filter(Boolean)
    .join(" · ");
}

// ── Clean JSON viewer ─────────────────────────────────────────────────────────

function JsonViewer({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ ...s.btn(), fontSize: 12, padding: "5px 10px" }}
      >
        {open ? "▲ Скрыть JSON" : "▼ Чистый JSON"}
      </button>
      {open && (
        <pre
          style={{
            marginTop: 8,
            background: "#f7f7f7",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: 14,
            fontSize: 11,
            lineHeight: 1.5,
            overflowX: "auto",
            maxHeight: 400,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Single product card ───────────────────────────────────────────────────────

function ProductCard({
  item,
  productAction,
  onActionChange,
  onMergeTargetChange,
  onApply,
}: {
  item: AgentResult;
  productAction: ProductAction;
  onActionChange: (action: AgentDecision["action"]) => void;
  onMergeTargetChange: (targetId: string) => void;
  onApply: () => void;
}) {
  const { original, candidates, decision, applyResult } = item;
  const aiAction = decision.action;
  const currentAction = productAction.action;
  const isOverridden = currentAction !== aiAction;
  const mergeCandidate = candidates.find((c) => c.id === productAction.mergeIntoProductId);

  return (
    <section
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 14,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          padding: "16px 20px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{original.icon ?? "📦"}</span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px" }}>
              {original.canonical_name}
            </h3>
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>{translationNames(original)}</div>
          {original.synonyms && original.synonyms.length > 0 && (
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>
              {original.synonyms.slice(0, 5).join(", ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={s.badge(actionTone(aiAction))}>{actionLabel[aiAction]}</span>
          <span style={s.badge("dark")}>{pct(decision.confidence)}</span>
          {applyResult.applied && <span style={s.badge("green")}>✓ Применено</span>}
          {productAction.applied && <span style={s.badge("green")}>✓ Сохранено</span>}
          {productAction.error && <span style={s.badge("red")}>Ошибка</span>}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 0 }}>
        {/* Left: AI reason + clean product */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid #f0f0f0" }}>
          {/* AI reason */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 5 }}>
              Решение агента
            </div>
            <div style={{ fontSize: 14, color: "#1a1a1a", lineHeight: 1.5 }}>{decision.reason}</div>
            {aiAction === "merge" && decision.mergeIntoProductId && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#1a3fd4" }}>
                → Объединить с:{" "}
                <strong>
                  {candidates.find((c) => c.id === decision.mergeIntoProductId)?.canonical_name ??
                    decision.mergeIntoProductId}
                </strong>
              </div>
            )}
          </div>

          {/* Clean product summary */}
          {(aiAction === "approve_new" || aiAction === "merge") && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 5 }}>
                Чистый продукт
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{decision.cleanProduct.icon}</span>
                <strong style={{ fontSize: 14 }}>{decision.cleanProduct.canonical_name}</strong>
                <span style={s.badge("default")}>{decision.cleanProduct.category}</span>
              </div>
              {(decision.cleanProduct.calories != null) && (
                <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                  {decision.cleanProduct.calories} ккал · Б {decision.cleanProduct.protein}г ·
                  Ж {decision.cleanProduct.fat}г · У {decision.cleanProduct.carbohydrates}г
                </div>
              )}
              {decision.cleanProduct.synonyms && decision.cleanProduct.synonyms.length > 0 && (
                <div style={{ fontSize: 12, color: "#aaa" }}>
                  Синонимы: {decision.cleanProduct.synonyms.slice(0, 5).join(", ")}
                </div>
              )}
            </div>
          )}

          <JsonViewer data={decision.cleanProduct} />
        </div>

        {/* Right: Candidates */}
        <div style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 10 }}>
            Кандидаты ({candidates.length})
          </div>
          {candidates.length === 0 ? (
            <div style={{ fontSize: 13, color: "#aaa" }}>Дубликаты не найдены</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {candidates.slice(0, 6).map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: c.id === productAction.mergeIntoProductId ? "#f0f5ff" : "#fafafa",
                    border: c.id === productAction.mergeIntoProductId ? "1px solid #c0d0fa" : "1px solid #f0f0f0",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {c.icon ?? "📦"} {c.canonical_name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>
                      {pct(c.score)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>{c.matchReason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions footer */}
      <div
        style={{
          borderTop: "1px solid #f0f0f0",
          padding: "12px 20px",
          background: "#fafafa",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
          <select
            value={currentAction}
            onChange={(e) => onActionChange(e.target.value as AgentDecision["action"])}
            style={s.select()}
            disabled={productAction.applying || productAction.applied}
          >
            <option value="approve_new">Одобрить как новый</option>
            <option value="merge">Объединить (дубль)</option>
            <option value="needs_review">Ручная проверка</option>
            <option value="reject">Отклонить</option>
          </select>

          {currentAction === "merge" && (
            <select
              value={productAction.mergeIntoProductId ?? ""}
              onChange={(e) => onMergeTargetChange(e.target.value)}
              style={{ ...s.select(), minWidth: 180 }}
              disabled={productAction.applying || productAction.applied}
            >
              <option value="">— выбери цель —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ?? "📦"} {c.canonical_name}
                </option>
              ))}
            </select>
          )}

          {isOverridden && (
            <span style={s.badge("orange")}>изменено вручную</span>
          )}
        </div>

        {productAction.error && (
          <span style={{ fontSize: 12, color: "#c22b10", maxWidth: 200 }}>{productAction.error}</span>
        )}

        <button
          type="button"
          style={s.btn(
            true,
            productAction.applying ||
              productAction.applied ||
              (currentAction === "merge" && !productAction.mergeIntoProductId)
          )}
          disabled={
            productAction.applying ||
            productAction.applied ||
            (currentAction === "merge" && !productAction.mergeIntoProductId)
          }
          onClick={onApply}
        >
          {productAction.applying ? "Применяю..." : productAction.applied ? "✓ Применено" : "Применить"}
        </button>
      </div>
    </section>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ModerationAgentPanel() {
  const [limit, setLimit] = useState(5);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [productActions, setProductActions] = useState<Record<string, ProductAction>>({});

  // Initialise per-product action state when dry-run results arrive
  useEffect(() => {
    if (!response) return;
    const init: Record<string, ProductAction> = {};
    for (const item of response.results) {
      init[item.productId] = {
        action: item.decision.action,
        mergeIntoProductId: item.decision.mergeIntoProductId,
        applying: false,
        applied: item.applyResult.applied,
        error: null,
      };
    }
    setProductActions(init);
  }, [response]);

  const runDryRun = async () => {
    setRunning(true);
    setStatus("Агент анализирует продукты без изменений...");
    setResponse(null);

    try {
      const res = await fetch("/api/admin/products/moderation-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, apply: false }),
      });
      const data: AgentResponse = await res.json();
      if (!res.ok) {
        setStatus(`Ошибка: ${data.error ?? "агент не ответил"}`);
        return;
      }
      setResponse(data);
      setStatus(`Готово: ${data.processed} продуктов проверено. База не изменена.`);
    } catch {
      setStatus("Ошибка: не удалось подключиться к агенту");
    } finally {
      setRunning(false);
    }
  };

  const setAction = (productId: string, action: AgentDecision["action"]) => {
    setProductActions((prev) => {
      const curr = prev[productId];
      // When switching away from merge, clear target
      const mergeIntoProductId = action === "merge" ? curr.mergeIntoProductId : null;
      // If switching to merge and AI had a target, pre-fill it
      const item = response?.results.find((r) => r.productId === productId);
      const aiMergeTarget = item?.decision.mergeIntoProductId ?? null;
      return {
        ...prev,
        [productId]: {
          ...curr,
          action,
          mergeIntoProductId: action === "merge" ? (mergeIntoProductId ?? aiMergeTarget) : null,
        },
      };
    });
  };

  const setMergeTarget = (productId: string, targetId: string) => {
    setProductActions((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], mergeIntoProductId: targetId || null },
    }));
  };

  const applyProduct = async (productId: string) => {
    const pa = productActions[productId];
    if (!pa || pa.applying || pa.applied) return;

    setProductActions((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], applying: true, error: null },
    }));

    try {
      const res = await fetch("/api/admin/products/moderation-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applyDecision: {
            productId,
            action: pa.action,
            mergeIntoProductId: pa.mergeIntoProductId ?? null,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.result?.applied) {
        setProductActions((prev) => ({
          ...prev,
          [productId]: {
            ...prev[productId],
            applying: false,
            error: data.error ?? data.result?.reason ?? "Не удалось применить",
          },
        }));
      } else {
        setProductActions((prev) => ({
          ...prev,
          [productId]: { ...prev[productId], applying: false, applied: true, error: null },
        }));
      }
    } catch {
      setProductActions((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], applying: false, error: "Ошибка сети" },
      }));
    }
  };

  const applied = Object.values(productActions).filter((pa) => pa.applied).length;
  const total = Object.keys(productActions).length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Controls */}
      <section
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 14,
          background: "#fff",
          padding: "18px 20px",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={s.badge("dark")}>AI агент v2</span>
              {response && (
                <span style={s.badge(applied === total && total > 0 ? "green" : "default")}>
                  {applied}/{total} применено
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              Модерация продуктов
            </h2>
            <p style={{ margin: "6px 0 0", color: "#737373", fontSize: 13, lineHeight: 1.5, maxWidth: 640 }}>
              Агент анализирует продукты: находит дубли, очищает названия, выдаёт чистый JSON.
              Тест не меняет базу. Каждое решение применяется отдельно.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#555" }}>
              Продуктов:
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                style={{ width: 70, height: 36, borderRadius: 8, border: "1px solid #d4d4d4", padding: "0 10px", fontSize: 13 }}
              />
            </label>
            <button
              type="button"
              style={s.btn(true, running)}
              disabled={running}
              onClick={runDryRun}
            >
              {running ? "Анализирую..." : "Тест без изменений"}
            </button>
          </div>
        </div>

        {status && (
          <div
            style={{
              fontSize: 13,
              color: status.startsWith("Ошибка") ? "#c22b10" : "#444",
              padding: "8px 12px",
              background: status.startsWith("Ошибка") ? "#fff5f2" : "#f7f7f7",
              borderRadius: 8,
            }}
          >
            {status}
          </div>
        )}
      </section>

      {/* Empty state */}
      {!response && !running && (
        <section
          style={{
            border: "1px dashed #d4d4d4",
            borderRadius: 14,
            padding: 32,
            background: "#fafafa",
            color: "#aaa",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          Нажми «Тест без изменений» — агент покажет свои решения. База не изменится.
        </section>
      )}

      {/* Results */}
      {response?.results.map((item) => {
        const pa = productActions[item.productId];
        if (!pa) return null;
        return (
          <ProductCard
            key={item.productId}
            item={item}
            productAction={pa}
            onActionChange={(action) => setAction(item.productId, action)}
            onMergeTargetChange={(targetId) => setMergeTarget(item.productId, targetId)}
            onApply={() => applyProduct(item.productId)}
          />
        );
      })}
    </div>
  );
}
