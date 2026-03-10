"use client";

import { useEffect, useState, useCallback } from "react";

interface Product {
  id: string;
  canonical_name: string;
  category: string;
  icon: string;
  synonyms?: string[];
  calories?: number;
  auto_created?: boolean;
  needs_moderation?: boolean;
  created_at?: string;
  created_by_user_id?: string;
}

const categoryLabel: Record<string, string> = {
  vegetables: "Овощи", fruits: "Фрукты", meat: "Мясо", dairy: "Молочка",
  grains: "Крупы", fish: "Рыба", bakery: "Хлеб", spices: "Специи",
  drinks: "Напитки", frozen: "Заморозка", canned: "Консервы",
  snacks: "Снеки", other: "Прочее",
};

type MergeState = { productId: string; search: string; results: Product[]; loading: boolean };

export default function ModerationProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [merge, setMerge] = useState<MergeState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products?needs_moderation=1&limit=100");
      const data = await res.json();
      setProducts(data.data ?? []);
      setTotal(data.count ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setProcessing((p) => ({ ...p, [id]: true }));
    await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    setProducts((ps) => ps.filter((p) => p.id !== id));
    setTotal((t) => t - 1);
    setProcessing((p) => ({ ...p, [id]: false }));
  }

  async function deleteProduct(id: string) {
    if (!confirm("Удалить продукт? Это действие нельзя отменить.")) return;
    setProcessing((p) => ({ ...p, [id]: true }));
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    setProducts((ps) => ps.filter((p) => p.id !== id));
    setTotal((t) => t - 1);
    setProcessing((p) => ({ ...p, [id]: false }));
  }

  async function searchMerge(search: string) {
    if (!merge) return;
    setMerge((m) => m ? { ...m, search, loading: true, results: [] } : null);
    const res = await fetch(`/api/admin/products?search=${encodeURIComponent(search)}&include_synonyms=1&limit=10`);
    const data = await res.json();
    setMerge((m) => m ? { ...m, results: data.data ?? [], loading: false } : null);
  }

  async function doMerge(primaryId: string) {
    if (!merge) return;
    setProcessing((p) => ({ ...p, [merge.productId]: true }));
    await fetch("/api/admin/products/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId, mergeIds: [merge.productId] }),
    });
    setProducts((ps) => ps.filter((p) => p.id !== merge.productId));
    setTotal((t) => t - 1);
    setMerge(null);
    setProcessing((p) => ({ ...p, [merge.productId]: false }));
  }

  async function approveAll() {
    if (!confirm(`Одобрить все ${products.length} продуктов?`)) return;
    for (const p of products) {
      await fetch(`/api/admin/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
    }
    setProducts([]);
    setTotal(0);
  }

  return (
    <div style={{ background: "var(--bg-main)", minHeight: "100vh", padding: "var(--spacing-2xl)" }}>
      <div style={{ maxWidth: 860 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--spacing-2xl)", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
              Модерация продуктов
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Продукты, созданные пользователями автоматически
              {!loading && <> — <strong style={{ color: total > 0 ? "#ff9500" : "#34c759" }}>{total} ожидают</strong></>}
            </p>
          </div>
          {products.length > 0 && (
            <button
              onClick={approveAll}
              style={{
                background: "#34c759", color: "#fff", border: "none",
                borderRadius: "var(--radius-sm)", padding: "8px 16px",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Одобрить все ({products.length})
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Загрузка...</div>
        ) : products.length === 0 ? (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-lg)", padding: 40, textAlign: "center",
            boxShadow: "var(--shadow-card)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
              Всё проверено
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Нет продуктов, требующих модерации
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                busy={processing[product.id] ?? false}
                onApprove={() => approve(product.id)}
                onDelete={() => deleteProduct(product.id)}
                onMerge={() => setMerge({ productId: product.id, search: product.canonical_name, results: [], loading: false })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Merge modal */}
      {merge && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setMerge(null)}>
          <div style={{
            background: "var(--bg-surface)", borderRadius: "var(--radius-lg)",
            padding: 24, width: 480, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>
              Объединить с продуктом
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              «{products.find((p) => p.id === merge.productId)?.canonical_name}» станет синонимом выбранного продукта
            </p>

            <input
              type="text"
              placeholder="Поиск продукта..."
              defaultValue={merge.search}
              autoFocus
              onChange={(e) => searchMerge(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px", fontSize: 14,
                border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)",
                background: "var(--bg-main)", color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />

            <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto" }}>
              {merge.loading && <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" }}>Поиск...</div>}
              {merge.results.filter((r) => r.id !== merge.productId).map((result) => (
                <button
                  key={result.id}
                  onClick={() => doMerge(result.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "10px 12px", marginBottom: 4, textAlign: "left",
                    background: "var(--bg-main)", border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)", cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{result.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                      {result.canonical_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {categoryLabel[result.category] ?? result.category}
                      {result.synonyms?.length ? ` · ${result.synonyms.length} синонимов` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMerge(null)}
              style={{
                marginTop: 12, width: "100%", padding: "8px 0", fontSize: 13,
                background: "none", border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-secondary)",
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product, busy, onApprove, onDelete, onMerge,
}: {
  product: Product;
  busy: boolean;
  onApprove: () => void;
  onDelete: () => void;
  onMerge: () => void;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-light)",
      borderRadius: "var(--radius-lg)",
      padding: "14px 16px",
      boxShadow: "var(--shadow-card)",
      display: "flex",
      alignItems: "center",
      gap: 14,
      opacity: busy ? 0.5 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* Icon */}
      <div style={{ fontSize: 28, flexShrink: 0, width: 36, textAlign: "center" }}>
        {product.icon}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
          {product.canonical_name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          {categoryLabel[product.category] ?? product.category}
          {product.synonyms?.length ? ` · синонимы: ${product.synonyms.slice(0, 3).join(", ")}${product.synonyms.length > 3 ? `…+${product.synonyms.length - 3}` : ""}` : ""}
          {product.calories ? ` · ${Math.round(product.calories)} ккал` : ""}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <ActionBtn onClick={onApprove} disabled={busy} color="#34c759" title="Одобрить">✓</ActionBtn>
        <ActionBtn onClick={onMerge} disabled={busy} color="#007aff" title="Объединить">⇄</ActionBtn>
        <ActionBtn onClick={onDelete} disabled={busy} color="#ff3b30" title="Удалить">✕</ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, disabled, color, title, children }: {
  onClick: () => void; disabled: boolean; color: string; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: "var(--radius-sm)",
        background: disabled ? "#e5e5e7" : color,
        color: "#fff", border: "none", cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
