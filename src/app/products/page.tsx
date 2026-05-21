"use client";

import { Cpu, Package, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductsManager from "./ProductsManager";
import ProductBrainPanel from "./ProductBrainPanel";
import NvidiaModelPanel from "./NvidiaModelPanel";
import styles from "../catalogs/catalogs-blueprint.module.css";

type View = "products" | "brain" | "nvidia";

export default function ProductsWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: View = viewParam === "brain" || viewParam === "nvidia" ? viewParam : "products";

  const setView = (view: View) => {
    const next = new URLSearchParams(searchParams.toString());
    if (view === "products") {
      next.delete("view");
    } else {
      next.set("view", view);
    }
    const query = next.toString();
    router.replace(query ? `/products?${query}` : "/products");
  };

  return (
    <div className={`${styles.blueprint} ${styles.wide}`} style={{ display: "block" }}>
      {/* Header */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--color-canvas-white, #fff)",
        borderBottom: "1px solid var(--color-subtle-ash, #e5e5e5)",
        margin: "-24px -24px 20px",
        padding: "16px 24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.33, letterSpacing: "-0.45px", fontWeight: 600 }}>
              Продукты
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-midtone-gray, #737373)" }}>
              База продуктов и автоматическая обработка качества
            </p>
          </div>

          <div style={{ display: "flex", background: "#f2f2f2", borderRadius: 9999, padding: 3, gap: 2 }}>
            {([
              { id: "products", icon: Package, label: "База продуктов" },
              { id: "brain",    icon: Sparkles, label: "Обработка" },
              { id: "nvidia",   icon: Cpu, label: "NVIDIA тест" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 16px",
                  borderRadius: 9999,
                  border: 0,
                  cursor: "pointer",
                  background: activeView === id ? "#000" : "transparent",
                  color: activeView === id ? "#fff" : "#0a0a0a",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeView === "products" && <ProductsManager />}
      {activeView === "brain" && <ProductBrainPanel />}
      {activeView === "nvidia" && (
        <div style={{ display: "grid", gap: 32 }}>
          <ProductBrainPanel provider="nvidia" />
          <NvidiaModelPanel />
        </div>
      )}
    </div>
  );
}
