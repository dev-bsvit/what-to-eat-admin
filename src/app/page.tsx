"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Stats {
  recipes: number;
  products: number;
  cuisines: number;
}

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ recipes: 0, products: 0, cuisines: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [recipesRes, productsRes, cuisinesRes] = await Promise.all([
        fetch("/api/admin/recipes"),
        fetch("/api/admin/products"),
        fetch("/api/admin/cuisines"),
      ]);

      const [recipes, products, cuisines] = await Promise.all([
        recipesRes.json(),
        productsRes.json(),
        cuisinesRes.json(),
      ]);

      setStats({
        recipes: recipes.data?.length || 0,
        products: products.data?.length || 0,
        cuisines: cuisines.data?.length || 0,
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const quickLinks = [
    {
      title: "Каталоги рецептов",
      description: "Управление каталогами и рецептами",
      icon: "📁",
      color: "#ff6b6b",
      href: "/catalogs",
      stat: `${stats.cuisines} каталогов`,
    },
    {
      title: "Справочник продуктов",
      description: "Категории и продукты",
      icon: "🥗",
      color: "#51cf66",
      href: "/products",
      stat: `${stats.products} продуктов`,
    },
    {
      title: "Подписки",
      description: "Правила и настройки подписки",
      icon: "💎",
      color: "#9775fa",
      href: "/subscription-rules",
      stat: "правила подписки",
    },
  ];

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        fontSize: '18px',
        color: 'var(--text-secondary)',
      }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div>
      {/* Welcome Header */}
      <div className="section-header">
        <h1 className="section-title">🍽️ Добро пожаловать в админ-панель</h1>
        <p className="section-subtitle">
          Управляйте каталогами рецептов и справочником продуктов
        </p>
      </div>

      {/* Stats Overview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-2xl)',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          color: 'white',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-sm)' }}>📚</div>
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            {stats.recipes}
          </div>
          <div style={{ fontSize: '16px', opacity: 0.9 }}>Всего рецептов</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          color: 'white',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-sm)' }}>📁</div>
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            {stats.cuisines}
          </div>
          <div style={{ fontSize: '16px', opacity: 0.9 }}>Каталогов</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          color: 'white',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-sm)' }}>🥗</div>
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            {stats.products}
          </div>
          <div style={{ fontSize: '16px', opacity: 0.9 }}>Продуктов</div>
        </div>
      </div>

      {/* Quick Access */}
      <div className="section">
        <h2 style={{
          fontSize: '24px',
          fontWeight: 700,
          marginBottom: 'var(--spacing-lg)',
          color: 'var(--text-primary)',
        }}>
          Быстрый доступ
        </h2>

        <div className="folder-grid">
          {quickLinks.map((link) => (
            <div
              key={link.href}
              className="folder-card animate-slide-in"
              onClick={() => router.push(link.href)}
              style={{
                borderTopWidth: '4px',
                borderTopColor: link.color,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-md)',
              }}>
                <div style={{
                  fontSize: '56px',
                  width: '80px',
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${link.color}20`,
                  borderRadius: 'var(--radius-md)',
                }}>
                  {link.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}>
                    {link.title}
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--spacing-sm)',
                  }}>
                    {link.description}
                  </p>
                  <div style={{
                    display: 'inline-block',
                    padding: 'var(--spacing-xs) var(--spacing-md)',
                    background: `${link.color}15`,
                    color: link.color,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}>
                    {link.stat}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-xl)',
        border: '2px solid var(--border-light)',
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: 'var(--spacing-lg)',
          color: 'var(--text-primary)',
        }}>
          💡 Возможности системы
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
        }}>
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)',
            }}>
              <span style={{ fontSize: '24px' }}>📁</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Каталоги рецептов</h4>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Организуйте рецепты по категориям кухонь. Создавайте новые каталоги и добавляйте рецепты прямо в них.
            </p>
          </div>

          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)',
            }}>
              <span style={{ fontSize: '24px' }}>🥗</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Справочник продуктов</h4>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Управляйте продуктами по категориям. Добавляйте БЖУ, иконки и единицы измерения для каждого продукта.
            </p>
          </div>

          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)',
            }}>
              <span style={{ fontSize: '24px' }}>📊</span>
              <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Автоматический расчет БЖУ</h4>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              При добавлении ингредиентов система автоматически рассчитывает пищевую ценность рецепта.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
