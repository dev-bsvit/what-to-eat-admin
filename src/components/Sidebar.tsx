"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navigation = [
  { name: "Каталоги", href: "/catalogs", icon: "📁" },
  { name: "Продукты", href: "/products", icon: "🥗" },
  { name: "Модерация", href: "/moderation", icon: "📋" },
  { name: "Пользователи", href: "/users", icon: "👤" },
  { name: "Парсеры", href: "/parsers", icon: "⚙️" },
  { name: "Тест импорта", href: "/test-import", icon: "🧪" },
  { name: "Instagram импорт", href: "/instagram-import", icon: "📷" },
  { name: "AI теги", href: "/recommend-setup", icon: "🏷️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside style={{
      width: '240px',
      background: '#1a1a1a',
      minHeight: '100vh',
      padding: 'var(--spacing-lg) 0',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
    }}>
      {/* Brand */}
      <Link
        href="/"
        style={{
          padding: '0 var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
          textDecoration: 'none',
          display: 'block',
        }}
      >
        <div style={{
          fontSize: '28px',
          marginBottom: '4px',
        }}>
          🍽️
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '-0.3px',
        }}>
          What to Eat?
        </div>
        <div style={{
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}>
          Admin Panel
        </div>
      </Link>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 var(--spacing-sm)' }}>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                padding: '10px var(--spacing-sm)',
                marginBottom: '4px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                background: isActive ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                fontSize: '15px',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                }
              }}
            >
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '0 var(--spacing-sm) var(--spacing-lg)' }}>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            padding: '10px var(--spacing-sm)',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '18px' }}>🚪</span>
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
}
