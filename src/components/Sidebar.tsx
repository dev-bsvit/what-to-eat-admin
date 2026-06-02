"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const sections = [
  {
    label: "Контент",
    items: [
      { name: "Каталоги", href: "/catalogs", icon: "□" },
      { name: "Продукты", href: "/products", icon: "◇", productHub: true },
      { name: "Отзывы", href: "/reviews-moderation", icon: "!" },
      { name: "Пользователи", href: "/users", icon: "○" },
    ],
  },
  {
    label: "Операции",
    items: [
      { name: "Подписки", href: "/subscription-rules", icon: "$" },
      { name: "Уведомления", href: "/notifications", icon: "•" },
      { name: "Парсеры", href: "/parsers", icon: "⌁" },
      { name: "Instagram импорт", href: "/instagram-import", icon: "+" },
    ],
  },
  {
    label: "Техническое",
    items: [
      { name: "AI токени", href: "/ai-tokens", icon: "#" },
      { name: "AI теги", href: "/recommend-setup", icon: "⌘" },
      { name: "Теги рецептов", href: "/recipes/tags", icon: "⌑" },
      { name: "Тест импорта", href: "/test-import", icon: "?" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const productView = pathname === "/products"
    ? searchParams.get("view") === "moderation" || searchParams.get("view") === "agent"
      ? searchParams.get("view")
      : "products"
    : pathname === "/moderation"
      ? "moderation"
      : "products";

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isItemActive = (href: string, productHub?: boolean) => {
    if (productHub) return pathname === "/products" || pathname === "/moderation";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    marginBottom: 2,
    borderRadius: 10,
    textDecoration: "none",
    background: active ? "#000000" : "transparent",
    color: active ? "#ffffff" : "#0a0a0a",
    fontSize: 14,
    lineHeight: 1.2,
    fontWeight: active ? 600 : 500,
    transition: "background 0.15s, color 0.15s",
  });

  return (
    <aside style={{
      width: 248,
      background: "#ffffff",
      minHeight: "100vh",
      padding: "16px 10px",
      display: "flex",
      flexDirection: "column",
      position: "fixed",
      left: 0,
      top: 0,
      bottom: 0,
      borderRight: "1px solid #e5e5e5",
    }}>
      <Link
        href="/"
        style={{
          padding: "6px 10px 18px",
          marginBottom: 10,
          textDecoration: "none",
          display: "block",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: "#000000", letterSpacing: "-0.45px" }}>
          What to Eat
        </div>
        <div style={{ fontSize: 12, color: "#737373", marginTop: 3 }}>
          Admin workspace
        </div>
      </Link>

      <nav style={{ flex: 1, overflowY: "auto", padding: "0 2px" }}>
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div style={{
              padding: "0 8px 7px",
              fontSize: 11,
              lineHeight: 1.2,
              color: "#737373",
              fontWeight: 600,
              textTransform: "uppercase",
            }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isItemActive(item.href, item.productHub);
              return (
                <div key={item.name}>
                  <Link href={item.href} style={linkStyle(active)}>
                    <span style={{
                      width: 22,
                      height: 22,
                      borderRadius: 9999,
                      border: active ? "1px solid rgba(255,255,255,0.28)" : "1px solid #e5e5e5",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      flex: "0 0 auto",
                    }}>
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                  </Link>

                  {item.productHub && active && (
                    <div style={{ margin: "4px 0 8px 32px", display: "grid", gap: 2 }}>
                      <Link
                        href="/products"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 9999,
                          textDecoration: "none",
                          fontSize: 12,
                          color: productView === "products" ? "#000000" : "#737373",
                          background: productView === "products" ? "#f2f2f2" : "transparent",
                          fontWeight: productView === "products" ? 600 : 500,
                        }}
                      >
                        База продуктов
                      </Link>
                      <Link
                        href="/products?view=moderation"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 9999,
                          textDecoration: "none",
                          fontSize: 12,
                          color: productView === "moderation" ? "#000000" : "#737373",
                          background: productView === "moderation" ? "#f2f2f2" : "transparent",
                          fontWeight: productView === "moderation" ? 600 : 500,
                        }}
                      >
                        Модерация
                      </Link>
                      <Link
                        href="/products?view=agent"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 9999,
                          textDecoration: "none",
                          fontSize: 12,
                          color: productView === "agent" ? "#000000" : "#737373",
                          background: productView === "agent" ? "#f2f2f2" : "transparent",
                          fontWeight: productView === "agent" ? 600 : 500,
                        }}
                      >
                        AI агент
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "12px 2px 0", borderTop: "1px solid #e5e5e5" }}>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 9999,
            border: "1px solid #e5e5e5",
            background: "#ffffff",
            color: "#0a0a0a",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
