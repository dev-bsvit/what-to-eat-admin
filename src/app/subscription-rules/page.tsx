"use client";

// ─────────────────────────────────────────────────────────────────
//  Subscription Rules — справочная страница правил монетизации
//  Источник истины: Models/Subscription.swift + StoreKitService.swift
//  При изменении лимитов в приложении — обновлять и здесь.
// ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    productId: "com.whattoeat.premium.monthly",
    price: "$5.99",
    period: "/ месяц",
    badge: null,
    color: "#667eea",
  },
  {
    id: "yearly",
    name: "Yearly",
    productId: "com.whattoeat.premium.yearly",
    price: "$44.99",
    period: "/ год",
    badge: "Popular",
    color: "#f093fb",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    productId: "com.whattoeat.premium.lifetime",
    price: "$69.99",
    period: "навсегда",
    badge: "Best Value",
    color: "#fa8231",
  },
];

const LIMITS = [
  {
    feature: "Сохранённые рецепты",
    icon: "📖",
    free: "20 рецептов",
    premium: "Без ограничений",
    source: "Subscription.swift:244  FreeTierLimits.maxSavedRecipes = 20",
    critical: false,
  },
  {
    feature: "Планирование меню",
    icon: "📅",
    free: "3 дня",
    premium: "Без ограничений",
    source: "Subscription.swift:245  FreeTierLimits.maxMealPlanDays = 3",
    critical: false,
  },
  {
    feature: "Импорт рецептов в день",
    icon: "🔗",
    free: "1 рецепт / день",
    premium: "Без ограничений",
    source: "Subscription.swift:249  FreeTierLimits.maxImportsPerDay = 1",
    critical: false,
  },
  {
    feature: "Импорт рецептов всего",
    icon: "📥",
    free: "7 рецептов",
    premium: "Без ограничений",
    source: "Subscription.swift:250  FreeTierLimits.maxTotalImports = 7",
    critical: false,
  },
  {
    feature: "AI голос / фото (в день)",
    icon: "🎤",
    free: "1 раз / день",
    premium: "Без ограничений",
    source: "Subscription.swift:253  FreeTierLimits.maxAIUsesPerDay = 1",
    critical: true,
  },
  {
    feature: "AI пробный период",
    icon: "⏱️",
    free: "7 дней, затем блок",
    premium: "Без ограничений",
    source: "Subscription.swift:254  FreeTierLimits.maxAIUsesDays = 7",
    critical: true,
  },
  {
    feature: "AI улучшение рецепта",
    icon: "✨",
    free: "Недоступно",
    premium: "Доступно",
    source: "ImportedRecipeFormView.swift:541  guard isPremium",
    critical: true,
  },
  {
    feature: "Доступные каталоги кухонь",
    icon: "🌍",
    free: "Русская + Международная",
    premium: "Все 9 кухонь + 7 тематик",
    source: "Subscription.swift:246  FreeTierLimits.freeCuisines",
    critical: false,
  },
];

const FREE_CUISINES = ["russian", "international"];

const PREMIUM_FEATURES = [
  { id: "unlimitedRecipes",      icon: "📚", title: "Без лимита рецептов",          desc: "Сохраняй сколько угодно рецептов" },
  { id: "unlimitedMealPlanning", icon: "📅", title: "Без лимита планирования",      desc: "Планируй меню на любой срок" },
  { id: "aiFeatures",            icon: "✨", title: "AI функции",                   desc: "Голос, фото, распознавание рецептов" },
  { id: "allCuisines",           icon: "🌍", title: "Все каталоги и кухни",         desc: "9 кухонь + 7 тематических сборок" },
  { id: "noAds",                 icon: "🚫", title: "Без рекламы",                  desc: "Чистый интерфейс без баннеров" },
  { id: "prioritySupport",       icon: "🎧", title: "Приоритетная поддержка",       desc: "Ответ в течение 24 часов" },
];

const AI_ENDPOINTS = [
  {
    name: "Голосовой ввод продуктов",
    endpoint: "/api/ai/recognize-text",
    model: "gpt-4o-mini",
    maxTokens: 500,
    freeLimit: "1 / день",
    premiumLimit: "∞",
    desc: "Пользователь говорит — AI разбирает продукты с количеством и единицей",
  },
  {
    name: "Фото чека / списка",
    endpoint: "/api/ai/recognize-image",
    model: "gpt-4o-mini (vision)",
    maxTokens: 800,
    freeLimit: "1 / день (общий с голосом)",
    premiumLimit: "∞",
    desc: "Фото чека, рукописного списка или кулинарной книги",
  },
  {
    name: "Фото рецепта",
    endpoint: "/api/ai/recognize-recipe",
    model: "gpt-4o-mini (vision, high)",
    maxTokens: 4000,
    freeLimit: "1 / день (общий с голосом)",
    premiumLimit: "∞",
    desc: "Извлекает полный рецепт из фото: название, ингредиенты, шаги",
  },
  {
    name: "AI улучшение рецепта",
    endpoint: "/api/ai/process-recipe",
    model: "gpt-4o-mini",
    maxTokens: 1500,
    freeLimit: "❌ Только Premium",
    premiumLimit: "∞",
    desc: "Нормализует единицы, чистит ингредиенты, определяет кухню",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "var(--text-primary)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      background: `${color}22`,
      color,
      fontSize: 12,
      fontWeight: 700,
      marginLeft: 8,
    }}>
      {text}
    </span>
  );
}

export default function SubscriptionRulesPage() {
  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div className="section-header">
        <h1 className="section-title">💎 Правила подписки</h1>
        <p className="section-subtitle">
          Справочник всех ограничений и привилегий — Free vs Premium.
          При изменении лимитов в приложении обновляйте и эту страницу.
        </p>
      </div>

      {/* Plans */}
      <Section title="Тарифные планы">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: "var(--bg-surface)",
                border: `2px solid ${plan.color}`,
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: plan.color }}>{plan.name}</span>
                {plan.badge && <Badge text={plan.badge} color={plan.color} />}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
                {plan.price}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
                {plan.period}
              </div>
              <div style={{
                padding: "6px 10px",
                background: "var(--bg-muted)",
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 11,
                color: "var(--text-secondary)",
                wordBreak: "break-all",
              }}>
                {plan.productId}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Limits table */}
      <Section title="Лимиты: Free vs Premium">
        <div style={{ background: "var(--bg-surface)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border-light)" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1.2fr",
            padding: "12px 20px",
            background: "var(--bg-muted)",
            borderBottom: "1px solid var(--border-light)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            gap: 16,
          }}>
            <span>Функция</span>
            <span>🆓 Free</span>
            <span>💎 Premium</span>
          </div>

          {LIMITS.map((row, i) => (
            <div
              key={row.feature}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 1.2fr",
                padding: "14px 20px",
                borderBottom: i < LIMITS.length - 1 ? "1px solid var(--border-light)" : "none",
                gap: 16,
                alignItems: "start",
                background: row.critical ? "rgba(250, 130, 49, 0.04)" : "transparent",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span>{row.icon}</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>
                    {row.feature}
                  </span>
                  {row.critical && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#fa8231",
                      background: "#fa823120",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}>
                      AI
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>
                  {row.source}
                </div>
              </div>
              <div style={{ fontSize: 14, color: "#e74c3c", fontWeight: 500 }}>{row.free}</div>
              <div style={{ fontSize: 14, color: "#2ecc71", fontWeight: 500 }}>{row.premium}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Free cuisines */}
      <Section title="Бесплатные каталоги кухонь">
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: 16,
          padding: 20,
          border: "1px solid var(--border-light)",
        }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12 }}>
            Доступны без подписки (FreeTierLimits.freeCuisines):
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {FREE_CUISINES.map((id) => (
              <span
                key={id}
                style={{
                  padding: "6px 14px",
                  background: "#2ecc7120",
                  color: "#2ecc71",
                  borderRadius: 20,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {id}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
            Все остальные каталоги (9 кухонь + 7 тематик) доступны только с Premium или через отдельную покупку (In-App Purchase).
          </p>
        </div>
      </Section>

      {/* Premium features */}
      <Section title="Что входит в Premium">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {PREMIUM_FEATURES.map((feat) => (
            <div
              key={feat.id}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 28 }}>{feat.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>
                  {feat.title}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{feat.desc}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", marginTop: 4, opacity: 0.7 }}>
                  id: {feat.id}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* AI proxy endpoints */}
      <Section title="AI Proxy — эндпоинты и лимиты">
        <div style={{
          background: "#1a1a2e",
          borderRadius: 16,
          padding: 4,
          marginBottom: 16,
          border: "1px solid #333",
        }}>
          {AI_ENDPOINTS.map((ep, i) => (
            <div
              key={ep.endpoint}
              style={{
                padding: "18px 20px",
                borderBottom: i < AI_ENDPOINTS.length - 1 ? "1px solid #2a2a3e" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <code style={{
                  background: "#0f3460",
                  color: "#4fc3f7",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  POST {ep.endpoint}
                </code>
                <span style={{
                  background: "#1a3a1a",
                  color: "#4caf50",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}>
                  {ep.model}
                </span>
                <span style={{ color: "#888", fontSize: 12 }}>max_tokens: {ep.maxTokens}</span>
              </div>
              <div style={{ fontSize: 14, color: "#aaa", marginBottom: 10 }}>{ep.desc}</div>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 2 }}>🆓 Free</span>
                  <span style={{ color: "#e74c3c", fontWeight: 600, fontSize: 14 }}>{ep.freeLimit}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 2 }}>💎 Premium</span>
                  <span style={{ color: "#2ecc71", fontWeight: 600, fontSize: 14 }}>{ep.premiumLimit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: "#fff3e0",
          border: "1px solid #ffcc80",
          borderRadius: 12,
          padding: 16,
        }}>
          <div style={{ fontWeight: 700, color: "#e65100", marginBottom: 8 }}>
            ⚠️ Как работает проверка лимитов на сервере
          </div>
          <ol style={{ fontSize: 14, color: "#bf360c", margin: 0, paddingLeft: 20, lineHeight: 2 }}>
            <li>Клиент шлёт запрос на proxy с <code>user_id</code> и JWT-токеном</li>
            <li>Сервер верифицирует токен через Supabase Auth</li>
            <li>Проверяет <code>subscription_status</code> пользователя в таблице profiles</li>
            <li>Если Free — проверяет счётчик AI-запросов за сегодня в таблице <code>ai_usage</code></li>
            <li>Если лимит достигнут → возвращает <code>403 + reason: "ai_limit_reached"</code></li>
            <li>Клиент получает 403 → показывает Paywall</li>
            <li>Если всё ок → форвардит запрос к OpenAI, возвращает результат</li>
          </ol>
        </div>
      </Section>

      {/* Sync with Supabase */}
      <Section title="Синхронизация с Supabase">
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: 12,
          padding: 20,
          border: "1px solid var(--border-light)",
          fontFamily: "monospace",
          fontSize: 13,
        }}>
          <div style={{ marginBottom: 16, fontWeight: 700, fontFamily: "inherit", color: "var(--text-primary)" }}>
            Таблицы и поля:
          </div>
          {[
            { table: "profiles", fields: ["subscription_status (free|monthly|yearly|lifetime)", "subscription_expires_at (timestamp|null)", "purchased_catalogs ([string])"] },
            { table: "ai_usage", fields: ["user_id (uuid)", "date (date)", "count (int) — сбрасывается каждые сутки"] },
            { table: "purchases", fields: ["user_id", "product_id", "purchased_at", "transaction_id"] },
          ].map((t) => (
            <div key={t.table} style={{ marginBottom: 16 }}>
              <div style={{ color: "#4fc3f7", marginBottom: 6 }}>table: <strong>{t.table}</strong></div>
              {t.fields.map((f) => (
                <div key={f} style={{ color: "#aaa", paddingLeft: 20 }}>└─ {f}</div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      {/* Footer note */}
      <div style={{
        background: "var(--bg-muted)",
        borderRadius: 12,
        padding: 16,
        fontSize: 13,
        color: "var(--text-secondary)",
        borderLeft: "4px solid #667eea",
      }}>
        <strong>Источник истины:</strong> Models/Subscription.swift + StoreKitService.swift в iOS проекте.<br />
        Эта страница — документация для команды. При изменении лимитов в приложении — обновляй и здесь.
      </div>
    </div>
  );
}
