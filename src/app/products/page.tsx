"use client";

import { Package, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductsManager from "./ProductsManager";
import ModerationManager from "./ModerationManager";
import styles from "../catalogs/catalogs-blueprint.module.css";

type ProductsWorkspaceView = "products" | "moderation";

export default function ProductsWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: ProductsWorkspaceView = viewParam === "moderation" ? "moderation" : "products";

  const setView = (view: ProductsWorkspaceView) => {
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
            <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.33, letterSpacing: "-0.45px", fontWeight: 600, color: "var(--color-deep-black, #000)" }}>
              Продукты
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-midtone-gray, #737373)" }}>
              База продуктов и модерация пользовательских добавлений в одном рабочем месте
            </p>
          </div>

          <div style={{ display: "flex", background: "var(--color-ghost-gray, #f2f2f2)", borderRadius: 9999, padding: 3, gap: 2 }}>
            <button
              type="button"
              onClick={() => setView("products")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 14px",
                borderRadius: 9999,
                border: 0,
                cursor: "pointer",
                background: activeView === "products" ? "var(--color-deep-black, #000)" : "transparent",
                color: activeView === "products" ? "var(--color-canvas-white, #fff)" : "var(--color-rich-black, #0a0a0a)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Package size={14} />
              База продуктов
            </button>
            <button
              type="button"
              onClick={() => setView("moderation")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 14px",
                borderRadius: 9999,
                border: 0,
                cursor: "pointer",
                background: activeView === "moderation" ? "var(--color-deep-black, #000)" : "transparent",
                color: activeView === "moderation" ? "var(--color-canvas-white, #fff)" : "var(--color-rich-black, #0a0a0a)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} />
              Модерация
            </button>
          </div>
        </div>
      </div>

      {activeView === "products" ? <ProductsManager /> : <ModerationManager />}
    </div>
  );
}
