"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    name: "Каталоги",
    href: "/catalogs",
    icon: "📁",
    description: "Папки с рецептами"
  },
  {
    name: "Продукты",
    href: "/products",
    icon: "🥗",
    description: "Справочник продуктов"
  },
];

export default function FileManagerNav() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '80px',
      background: 'var(--bg-surface)',
      borderBottom: '2px solid var(--border-light)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--spacing-xl)',
      gap: 'var(--spacing-xl)',
    }}>
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)',
          textDecoration: 'none',
          marginRight: 'var(--spacing-xl)',
        }}
      >
        <div style={{
          fontSize: '32px',
        }}>
          🍽️
        </div>
        <div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            What to Eat?
          </div>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}>
            Admin Panel
          </div>
        </div>
      </Link>

      {/* Navigation Items */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-md)',
        flex: 1,
      }}>
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
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                background: isActive ? 'var(--accent-primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '16px',
                transition: 'all 0.2s ease',
                border: isActive ? 'none' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-medium)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '24px' }}>{item.icon}</span>
              <div>
                <div>{item.name}</div>
                <div style={{
                  fontSize: '11px',
                  opacity: 0.8,
                  display: isActive ? 'block' : 'none',
                }}>
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
