"use client";

import type { ReactNode } from "react";
import styles from "./subscription-rules.module.css";

const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    productId: "com.whattoeat.premium.monthly",
    price: "$5.99",
    period: "/ месяц",
    badge: null,
  },
  {
    id: "yearly",
    name: "Yearly",
    productId: "com.whattoeat.premium.yearly",
    price: "$44.99",
    period: "/ год",
    badge: "Popular",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    productId: "com.whattoeat.premium.lifetime",
    price: "$69.99",
    period: "навсегда",
    badge: "Best Value",
  },
];

const LIMITS = [
  {
    feature: "Сохранённые рецепты",
    free: "20 рецептов",
    premium: "Без ограничений",
    source: "Subscription.swift:244  FreeTierLimits.maxSavedRecipes = 20",
    critical: false,
  },
  {
    feature: "Планирование меню",
    free: "3 дня",
    premium: "Без ограничений",
    source: "Subscription.swift:245  FreeTierLimits.maxMealPlanDays = 3",
    critical: false,
  },
  {
    feature: "Импорт рецептов в день",
    free: "1 рецепт / день",
    premium: "Без ограничений",
    source: "Subscription.swift:249  FreeTierLimits.maxImportsPerDay = 1",
    critical: false,
  },
  {
    feature: "Импорт рецептов всего",
    free: "7 рецептов",
    premium: "Без ограничений",
    source: "Subscription.swift:250  FreeTierLimits.maxTotalImports = 7",
    critical: false,
  },
  {
    feature: "AI функции: голос / фото / рецепт",
    free: "2 раза / день на каждую функцию",
    premium: "Без ограничений",
    source: "Subscription.swift:266  FreeTierLimits.maxAIUsesPerDay = 2",
    critical: true,
  },
  {
    feature: "AI чат",
    free: "10 сообщений / день",
    premium: "Без ограничений",
    source: "Subscription.swift:267  FreeTierLimits.maxAIChatUsesPerDay = 10",
    critical: true,
  },
  {
    feature: "AI пробный период",
    free: "7 дней, затем блок",
    premium: "Без ограничений",
    source: "Subscription.swift:254  FreeTierLimits.maxAIUsesDays = 7",
    critical: true,
  },
  {
    feature: "AI улучшение рецепта",
    free: "Недоступно",
    premium: "Доступно",
    source: "ImportedRecipeFormView.swift:541  guard isPremium",
    critical: true,
  },
  {
    feature: "Доступные каталоги кухонь",
    free: "Русская + Международная",
    premium: "Все 9 кухонь + 7 тематик",
    source: "Subscription.swift:246  FreeTierLimits.freeCuisines",
    critical: false,
  },
];

const FREE_CUISINES = ["russian", "international"];

const PREMIUM_FEATURES = [
  { id: "unlimitedRecipes", title: "Без лимита рецептов", desc: "Сохраняй сколько угодно рецептов" },
  { id: "unlimitedMealPlanning", title: "Без лимита планирования", desc: "Планируй меню на любой срок" },
  { id: "aiFeatures", title: "AI функции", desc: "Голос, фото, распознавание рецептов" },
  { id: "allCuisines", title: "Все каталоги и кухни", desc: "9 кухонь + 7 тематических сборок" },
  { id: "noAds", title: "Без рекламы", desc: "Чистый интерфейс без баннеров" },
  { id: "prioritySupport", title: "Приоритетная поддержка", desc: "Ответ в течение 24 часов" },
];

const AI_ENDPOINTS = [
  {
    name: "Голосовой ввод продуктов",
    endpoint: "/api/ai/recognize-text",
    model: "gpt-4o-mini",
    maxTokens: 500,
    freeLimit: "2 / день",
    premiumLimit: "∞",
    desc: "Пользователь говорит — AI разбирает продукты с количеством и единицей",
  },
  {
    name: "Фото чека / списка",
    endpoint: "/api/ai/recognize-image",
    model: "gpt-4o-mini (vision)",
    maxTokens: 800,
    freeLimit: "2 / день",
    premiumLimit: "∞",
    desc: "Фото чека, рукописного списка или кулинарной книги",
  },
  {
    name: "Фото рецепта",
    endpoint: "/api/ai/recognize-recipe",
    model: "gpt-4o-mini (vision, high)",
    maxTokens: 4000,
    freeLimit: "2 / день",
    premiumLimit: "∞",
    desc: "Извлекает полный рецепт из фото: название, ингредиенты, шаги",
  },
  {
    name: "Рецепт из чата",
    endpoint: "/api/ai/extract-recipe-text",
    model: "gpt-4o-mini",
    maxTokens: 2500,
    freeLimit: "2 / день",
    premiumLimit: "∞",
    desc: "Преобразует текстовый рецепт из AI-чата в форму сохранения",
  },
  {
    name: "AI чат",
    endpoint: "/api/ai/chat",
    model: "gpt-4o-mini",
    maxTokens: 600,
    freeLimit: "10 / день",
    premiumLimit: "∞",
    desc: "Кулинарный чат и поиск подходящих рецептов",
  },
  {
    name: "Фото-чат",
    endpoint: "/api/ai/photo-chat",
    model: "gpt-4o-mini (vision)",
    maxTokens: 700,
    freeLimit: "2 / день",
    premiumLimit: "∞",
    desc: "Одноразовый чат по фото продуктов",
  },
  {
    name: "AI улучшение рецепта",
    endpoint: "/api/ai/process-recipe",
    model: "gpt-4o-mini",
    maxTokens: 1500,
    freeLimit: "Только Premium",
    premiumLimit: "∞",
    desc: "Нормализует единицы, чистит ингредиенты, определяет кухню",
  },
];

const SUPABASE_TABLES = [
  {
    table: "profiles",
    fields: [
      "subscription_status (free|monthly|yearly|lifetime)",
      "subscription_expires_at (timestamp|null)",
      "purchased_catalogs ([string])",
    ],
  },
  {
    table: "ai_usage",
    fields: ["user_id (uuid)", "date (date)", "endpoint (text)", "count (int) — сбрасывается каждые сутки"],
  },
  {
    table: "purchases",
    fields: ["user_id", "product_id", "purchased_at", "transaction_id"],
  },
];

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function SubscriptionRulesPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>Admin / Subscription Rules</div>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>Правила подписки</h1>
            <p className={styles.subtitle}>
              Справочник ограничений Free vs Premium, тарифов StoreKit, AI-лимитов и серверных
              таблиц, которые участвуют в монетизации.
            </p>
          </div>
          <div className={styles.heroBadges} aria-label="Источник правил">
            <span className={styles.inverseBadge}>StoreKit</span>
            <span className={styles.outlineBadge}>Subscription.swift</span>
          </div>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Краткая сводка">
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{PLANS.length}</span>
          <span className={styles.metricLabel}>тарифа</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{LIMITS.length}</span>
          <span className={styles.metricLabel}>лимитов</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{AI_ENDPOINTS.length}</span>
          <span className={styles.metricLabel}>AI endpoints</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{FREE_CUISINES.length}</span>
          <span className={styles.metricLabel}>free catalogs</span>
        </div>
      </section>

      <Section eyebrow="Plans" title="Тарифные планы">
        <div className={styles.plansGrid}>
          {PLANS.map((plan) => (
            <article key={plan.id} className={styles.planCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.planName}>{plan.name}</p>
                  <p className={styles.planPeriod}>{plan.period}</p>
                </div>
                {plan.badge && <span className={styles.inverseBadge}>{plan.badge}</span>}
              </div>
              <div className={styles.priceRow}>
                <span className={styles.price}>{plan.price}</span>
              </div>
              <code className={styles.productCode}>{plan.productId}</code>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Access Matrix" title="Лимиты: Free vs Premium">
        <div className={styles.tableCard}>
          <div className={styles.limitHeader}>
            <span>Функция</span>
            <span>Free</span>
            <span>Premium</span>
          </div>

          {LIMITS.map((row) => (
            <div key={row.feature} className={styles.limitRow}>
              <div>
                <div className={styles.limitTitleLine}>
                  <span className={styles.limitTitle}>{row.feature}</span>
                  {row.critical && <span className={styles.outlineBadge}>AI</span>}
                </div>
                <code className={styles.sourceCode}>{row.source}</code>
              </div>
              <div className={styles.limitValue}>{row.free}</div>
              <div className={styles.limitValueStrong}>{row.premium}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className={styles.twoColumn}>
        <Section eyebrow="Free Tier" title="Бесплатные каталоги кухонь">
          <div className={styles.card}>
            <p className={styles.cardText}>Доступны без подписки через FreeTierLimits.freeCuisines.</p>
            <div className={styles.badgeList}>
              {FREE_CUISINES.map((id) => (
                <span key={id} className={styles.neutralBadge}>
                  {id}
                </span>
              ))}
            </div>
            <p className={styles.cardText}>
              Все остальные каталоги доступны только с Premium или через отдельную покупку.
            </p>
          </div>
        </Section>

        <Section eyebrow="Premium" title="Что входит в Premium">
          <div className={styles.featureGrid}>
            {PREMIUM_FEATURES.map((feat) => (
              <article key={feat.id} className={styles.featureCard}>
                <div className={styles.featureIndex}>{feat.id.slice(0, 2).toUpperCase()}</div>
                <div>
                  <h3>{feat.title}</h3>
                  <p>{feat.desc}</p>
                  <code>id: {feat.id}</code>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </div>

      <Section eyebrow="AI Proxy" title="Эндпоинты и лимиты">
        <div className={styles.endpointList}>
          {AI_ENDPOINTS.map((ep) => (
            <article key={ep.endpoint} className={styles.endpointCard}>
              <div className={styles.endpointTop}>
                <div>
                  <h3>{ep.name}</h3>
                  <p>{ep.desc}</p>
                </div>
                <span className={styles.neutralBadge}>max_tokens: {ep.maxTokens}</span>
              </div>
              <div className={styles.endpointMeta}>
                <code>POST {ep.endpoint}</code>
                <span>{ep.model}</span>
              </div>
              <div className={styles.limitPair}>
                <div>
                  <span>Free</span>
                  <strong>{ep.freeLimit}</strong>
                </div>
                <div>
                  <span>Premium</span>
                  <strong>{ep.premiumLimit}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.processCard}>
          <div>
            <p className={styles.eyebrow}>Server Check</p>
            <h3>Как работает проверка лимитов</h3>
          </div>
          <ol>
            <li>Клиент шлёт запрос на proxy с user_id и JWT-токеном.</li>
            <li>Сервер верифицирует токен через Supabase Auth.</li>
            <li>Проверяет subscription_status пользователя в таблице profiles.</li>
            <li>Если Free — проверяет счётчик AI-запросов за сегодня в ai_usage.</li>
            <li>Если лимит достигнут — возвращает 403 с reason: ai_chat_limit_reached или ai_feature_limit_reached.</li>
            <li>Клиент получает 403 и показывает сообщение, что лимит на сегодня закончился.</li>
            <li>Если всё ок — форвардит запрос к OpenAI и возвращает результат.</li>
          </ol>
        </div>
      </Section>

      <Section eyebrow="Data Layer" title="Синхронизация с Supabase">
        <div className={styles.schemaGrid}>
          {SUPABASE_TABLES.map((item) => (
            <article key={item.table} className={styles.schemaCard}>
              <div className={styles.schemaTitle}>
                <span>table</span>
                <strong>{item.table}</strong>
              </div>
              <div className={styles.schemaFields}>
                {item.fields.map((field) => (
                  <code key={field}>{field}</code>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <footer className={styles.footerNote}>
        <strong>Источник истины:</strong> Models/Subscription.swift + StoreKitService.swift в iOS
        проекте. Эта страница — документация для команды. При изменении лимитов в приложении
        обновляй и здесь.
      </footer>
    </div>
  );
}
