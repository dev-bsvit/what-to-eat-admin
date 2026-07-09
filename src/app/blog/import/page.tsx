"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clipboard, Upload } from "lucide-react";
import styles from "../blog.module.css";

const APP_LANGUAGES = ["ru", "en", "de", "it", "fr", "es", "pt-BR", "uk"];

const exampleRecipeRu = {
  prep_time_min: 5,
  cook_time_min: 15,
  servings: 4,
  difficulty: "easy",
  cuisine: "Итальянская",
  ingredients: ["Паста пенне — 350 г", "Куриное филе — 400 г", "Сливки 20% — 200 мл", "Чеснок — 3 зубчика", "Пармезан — 50 г"],
  instructions: [
    "Отварите пасту до аль денте, сохранив 100 мл воды из-под неё.",
    "Обжарьте нарезанное кубиками филе до золотистой корочки.",
    "Добавьте чеснок, затем сливки, сыр и воду от пасты, прогрейте не доводя до кипения.",
    "Смешайте с пастой и прогрейте 1-2 минуты до загустения соуса.",
  ],
  nutrition: { calories: 520, protein: 35, fat: 22, carbs: 45 },
};

const exampleArticleRu = {
  slug: "bystryy-uzhin-pasta-s-kuritsey-20-minut",
  title: "Быстрый ужин за 20 минут: сливочная паста с курицей",
  excerpt:
    "Сливочная паста с курицей — сытный ужин за 20 минут в одной сковороде: понятные шаги, реальные граммовки и советы, чтобы соус не свернулся.",
  tldr:
    "Готовится 20 минут на 4 порции. Главный секрет густого соуса — крахмальная вода из-под пасты и сливки, которые нельзя доводить до кипения.",
  meta_title: "Быстрый ужин за 20 минут: паста с курицей",
  meta_description: "Рецепт сливочной пасты с курицей за 20 минут: реальные граммовки, пошаговый план и частые ошибки. Ужин в одной сковороде.",
  cover_image_alt: "Сливочная паста с курицей и пармезаном на тарелке",
  og_image_url: "https://example.com/recipe-og.jpg",
  sections: [
    {
      type: "p",
      text: "После рабочего дня хочется сытный ужин без долгой готовки. Сливочная паста с курицей закрывает это за 20 минут в одной сковороде.",
    },
    { type: "h2", text: "Что важно для результата" },
    {
      type: "ul",
      items: [
        "Крахмальная вода из-под пасты — природный эмульгатор, она не даёт соусу расслоиться.",
        "Сливки нельзя кипятить — только прогревать, иначе они свернутся.",
        "Жарьте курицу порциями: если выложить всё мясо разом, оно потушится, а не подрумянится.",
      ],
    },
    { type: "h2", text: "Частые ошибки" },
    {
      type: "p",
      text: "Главная ошибка — бурное кипячение соуса. Держите огонь на минимуме после того, как влили сливки.",
    },
    { type: "h2", text: "Варианты" },
    {
      type: "ul",
      items: ["С грибами: обжарьте 200 г шампиньонов перед курицей.", "Без молочных продуктов: замените сливки на кокосовое молоко."],
    },
  ],
  faq_json: [
    { q: "Можно ли использовать сливки 10%?", a: "Да, но соус будет более жидким и легче свернётся — смешайте их с ложкой крахмала." },
    { q: "Как загустить соус, если он жидкий?", a: "Прогрейте чуть дольше на слабом огне — паста впитает лишнюю жидкость." },
  ],
  recipe: exampleRecipeRu,
};

const exampleArticleEn = {
  slug: "20-minute-creamy-chicken-pasta",
  title: "20-Minute Dinner: Creamy Chicken Pasta",
  excerpt: "Creamy chicken pasta, one pan, 20 minutes: real measurements, a clear step-by-step plan, and how to keep the sauce from curdling.",
  tldr: "Ready in 20 minutes for 4 servings. The trick to a thick sauce is starchy pasta water and cream that never fully boils.",
  meta_title: "20-Minute Dinner: Creamy Chicken Pasta",
  meta_description: "Creamy chicken pasta in 20 minutes: real measurements, step-by-step plan, and the mistakes to avoid. One-pan dinner.",
  cover_image_alt: "Creamy chicken pasta with parmesan on a plate",
  og_image_url: "https://example.com/recipe-og.jpg",
  sections: [
    { type: "p", text: "After a long day you want a filling dinner without a long cook. This creamy chicken pasta takes 20 minutes, one pan." },
    { type: "h2", text: "What matters for the result" },
    {
      type: "ul",
      items: [
        "Starchy pasta water is a natural emulsifier — it keeps the sauce from splitting.",
        "Never let the cream boil hard — just warm it through, or it will curdle.",
        "Fry the chicken in batches: too much at once steams the meat instead of browning it.",
      ],
    },
    { type: "h2", text: "Common mistakes" },
    { type: "p", text: "The main mistake is boiling the sauce hard. Keep the heat low once the cream goes in." },
    { type: "h2", text: "Variations" },
    { type: "ul", items: ["With mushrooms: sauté 200g before the chicken.", "Dairy-free: swap the cream for coconut milk."] },
  ],
  faq_json: [
    { q: "Can I use 10% cream?", a: "Yes, but the sauce will be thinner and curdles more easily — mix it with a teaspoon of cornstarch first." },
    { q: "How do I thicken a runny sauce?", a: "Simmer a little longer on low heat — the pasta will absorb the extra liquid." },
  ],
  recipe: {
    prep_time_min: 5,
    cook_time_min: 15,
    servings: 4,
    difficulty: "easy",
    cuisine: "Italian",
    ingredients: ["Penne pasta — 350 g", "Chicken breast — 400 g", "20% cream — 200 ml", "Garlic — 3 cloves", "Parmesan — 50 g"],
    instructions: [
      "Cook the pasta to al dente, saving 100 ml of the cooking water.",
      "Fry the diced chicken until golden.",
      "Add garlic, then cream, cheese, and the pasta water; warm through without boiling.",
      "Toss with the pasta and heat 1-2 minutes until the sauce thickens.",
    ],
    nutrition: { calories: 520, protein: 35, fat: 22, carbs: 45 },
  },
};

const exampleImport = {
  status: "draft",
  source: "ai_assisted",
  article_type: "recipe",
  category: {
    slug: "dinners",
    translations: {
      ru: { name: "Ужины", description: "Практичные и быстрые рецепты для вечернего меню." },
      en: { name: "Dinners", description: "Practical and quick recipes for your evening menu." },
    },
  },
  author: {
    name: "Dishday",
    title: "Редакция рецептов",
    bio: "Команда Dishday проверяет рецепты, структуру шагов и полезность подсказок для домашней готовки.",
    same_as: ["https://dishday.online"],
  },
  tags: [
    { slug: "uzhin", translations: { ru: "Ужин", en: "Dinner" } },
    { slug: "bystro", translations: { ru: "Быстро", en: "Fast" } },
  ],
  cover_image_url: "https://example.com/recipe-cover.jpg",
  reading_time_min: 6,
  translations: {
    ru: exampleArticleRu,
    en: exampleArticleEn,
  },
};

function buildPrompt(exampleJson: string) {
  return `Сгенерируй JSON для импорта статьи в блог Dishday.
Верни ТОЛЬКО валидный JSON без markdown, комментариев и пояснений.

Задача:
- Статья должна быть готова к публикации, СРАЗУ на нескольких языках в одном JSON.
- Она может быть трёх типов: article_type "recipe" для одного рецепта, "collection" для подборки рецептов, "guide" для обычной статьи без рецепта.
- Она должна помогать Google и AI-поисковикам понять страницу: понятный title, excerpt, TL;DR, подробные секции, FAQ, cover image, теги, категория.

Как привязать рецепт(ы) (ВАЖНО — у меня НЕТ доступа к базе рецептов Dishday, поэтому НЕ придумывай recipe_id и НЕ используй recipe_title/related_recipes с recipe_id — только реальные данные, которые ты сам пишешь):
- Для article_type "recipe" (статья об одном блюде): заполни translations.<lang>.recipe реальными данными блюда — ингредиенты с граммовками, шаги, время, порции, КБЖУ (см. пример ниже). Это поле само по себе даёт карточку рецепта и Recipe-разметку на сайте, привязка к базе не нужна.
- Для article_type "guide": заполняй translations.<lang>.recipe, только если статья построена вокруг одного конкретного блюда. Если это обычная статья без рецепта — не добавляй это поле вообще.
- Для article_type "collection" (подборка из НЕСКОЛЬКИХ разных рецептов, например "25 идей"): заполни translations.<lang>.recipes — МАССИВ из 2-5 объектов той же формы, что и recipe, но у каждого дополнительно есть "title" (название этого рецепта) и опционально "label"/"note". Каждый рецепт в массиве получит на странице свою полную карточку и Recipe-разметку.

Языки:
- Поле "translations" — объект, где ключ это код языка, а значение — полностью заполненная статья на этом языке (свой slug, title, excerpt, tldr, meta, sections, faq_json, recipe или recipes).
- Заполни языки: ${APP_LANGUAGES.join(", ")} (это все языки приложения Dishday). Если явно попросили конкретный язык или подмножество — используй только их.
- Каждый язык переведи полноценно, не дословно, с учётом того, как реально ищут на этом языке — не просто гугл-перевод. Ингредиенты и шаги в translations.<lang>.recipe/recipes тоже переведи на этот язык, включая единицы измерения.
- category.translations и tags[].translations — тоже объекты по языкам: { "ru": {...}, "en": {...}, ... }. Не показывай их только на одном языке.
- author, cover_image_url, article_type, tags[].slug, category.slug — общие для всех языков, заполняются один раз (не дублируются по языкам).

Правила структуры:
- status: сначала "draft", если явно не попросили публиковать.
- article_type обязателен: "recipe", "collection" или "guide".
- category.slug и tags[].slug пиши латиницей или понятной транслитерацией без пробелов, ОДИНАКОВО во всех языках (это технический идентификатор, не текст).
- translations.<lang>.slug пиши латиницей, коротко, без дат — на каждом языке свой, соответствующий переведённому заголовку.
- translations.<lang>.title: поисковый заголовок с намерением пользователя на этом языке, не кликбейт.
- excerpt: 140-220 символов.
- tldr: 2-3 коротких предложения с прямым ответом на вопрос из заголовка.
- meta_title: до 60 символов.
- meta_description: до 155 символов.
- cover_image_alt: конкретно описывает готовое блюдо, на языке перевода.
- sections: 5-8 блоков на каждом языке. Используй только type: "p", "h2", "h3", "ul", "ol", "blockquote", "image".
- В sections обязательно должны быть: краткое вступление, что важно для результата, частые ошибки, подача/хранение или вариации. НЕ пиши в sections список ингредиентов и нумерованные шаги готовки — они уже берутся из translations.<lang>.recipe/recipes и рендерятся на странице отдельным блоком автоматически.
- faq_json: 3-5 вопросов на каждом языке, ответы короткие и конкретные.
- Не вставляй HTML в sections. Только текст и массивы.
- Не используй trailing commas.
- ЕДИНОЕ ВРЕМЯ: для article_type "recipe"/"guide" используй сумму prep_time_min + cook_time_min из recipe как ЕДИНОЕ число времени во всех местах — title, meta_title, excerpt, tldr. Не указывай в разных полях разные цифры (например "15 минут" в одном поле и "20 минут" в другом) — это одна из главных ошибок, которую нужно избегать. Для "collection" с несколькими recipes у каждого своё время — не смешивай их в общем title/tldr, говори обобщённо ("несколько быстрых идей") или используй время самого быстрого/главного рецепта.

Пример формата (здесь только 2 языка для краткости — в реальном ответе сделай все запрошенные):
${exampleJson}`;
}

const ARTICLE_TYPE_OPTIONS: Array<{ value: "guide" | "recipe" | "collection"; label: string }> = [
  { value: "guide", label: "Обычная статья (без рецепта)" },
  { value: "recipe", label: "Статья про один рецепт" },
  { value: "collection", label: "Подборка рецептов" },
];

export default function BlogImportPage() {
  const exampleJson = useMemo(() => JSON.stringify(exampleImport, null, 2), []);
  const fallbackPrompt = useMemo(() => buildPrompt(exampleJson), [exampleJson]);
  const [importText, setImportText] = useState(exampleJson);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ id?: string; public_url?: string | null; error?: string; warnings?: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [topic, setTopic] = useState("");
  const [articleType, setArticleType] = useState<"guide" | "recipe" | "collection">("guide");
  const [allLanguages, setAllLanguages] = useState(false);
  const [preparedPrompt, setPreparedPrompt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareInfo, setPrepareInfo] = useState<string | null>(null);

  const prompt = preparedPrompt ?? fallbackPrompt;

  const preparePrompt = async () => {
    if (!topic.trim()) {
      setPrepareInfo("Сначала укажите тему статьи.");
      return;
    }
    setPreparing(true);
    setPrepareInfo(null);
    try {
      const res = await fetch("/api/admin/blog/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          article_type: articleType,
          languages: allLanguages ? APP_LANGUAGES : ["ru"],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrepareInfo(data.error || "Не удалось подготовить промпт.");
        return;
      }
      setPreparedPrompt(data.prompt);
      if (articleType !== "guide") {
        setPrepareInfo(
          data.matched_recipes > 0
            ? `Найдено рецептов по теме в базе: ${data.matched_recipes}. Промпт использует только их id.`
            : "По теме не нашлось подходящих рецептов в базе — AI получит инструкцию не выдумывать рецепт."
        );
      } else {
        setPrepareInfo("Промпт готов.");
      }
    } finally {
      setPreparing(false);
    }
  };

  const importArticle = async () => {
    setStatus(null);
    setResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setStatus("Ошибка JSON: проверьте кавычки, запятые и скобки.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/blog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data);
      setStatus(res.ok ? "Статья импортирована." : data.error || "Не удалось импортировать статью.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImportText(await file.text());
  };

  return (
    <div style={{ maxWidth: 1180 }}>
      <Link href="/blog" className="breadcrumb-item" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} />
        К списку статей
      </Link>

      <div className="page-header">
        <div className="section-header">
          <h1 className="section-title">Импорт статьи JSON</h1>
          <p className="section-subtitle">
            Быстро создавайте SEO-статьи из готового JSON: пост сразу на нескольких языках, категорию, теги, автора, FAQ и привязку к рецепту.
          </p>
        </div>
      </div>

      <div className="app-card" style={{ marginBottom: 24 }}>
        <h2 className={styles.importPanelTitle}>1. Тема статьи</h2>
        <p className={styles.importPanelText}>
          Опишите тему — сервер подставит в промпт реальные рецепты, категории и теги из базы, чтобы AI не выдумывал названия.
        </p>
        <div className={styles.metaGrid}>
          <div className="form-group">
            <label className="form-label">Тема / бриф</label>
            <input
              type="text"
              className="input"
              placeholder="например: быстрые ужины на 20 минут"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Тип статьи</label>
            <select className="input" value={articleType} onChange={(event) => setArticleType(event.target.value as typeof articleType)}>
              {ARTICLE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input type="checkbox" checked={allLanguages} onChange={(event) => setAllLanguages(event.target.checked)} />
          Заполнить все языки приложения ({APP_LANGUAGES.length}), а не только русский
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" onClick={preparePrompt} disabled={preparing}>
            {preparing ? "Готовим…" : "Подготовить промпт"}
          </button>
          {prepareInfo && <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.8 }}>{prepareInfo}</span>}
        </div>
      </div>

      <div className={styles.importGrid}>
        <section className={styles.importPanel}>
          <div>
            <h2 className={styles.importPanelTitle}>2. Промпт для AI</h2>
            <p className={styles.importPanelText}>
              {preparedPrompt
                ? "Промпт собран по теме выше с реальными рецептами/категориями/тегами из базы. Скопируйте и вставьте в ChatGPT."
                : "Промпт-заготовка без темы. Заполните тему выше и нажмите «Подготовить промпт», чтобы подставить реальные рецепты из базы."}
            </p>
          </div>
          <textarea className={styles.codeTextarea} readOnly rows={24} value={prompt} spellCheck={false} />
          <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(prompt)}>
            <Clipboard size={16} />
            Скопировать промпт
          </button>
        </section>

        <section className={styles.importPanel}>
          <div>
            <h2 className={styles.importPanelTitle}>3. JSON статьи</h2>
            <p className={styles.importPanelText}>Вставьте JSON или загрузите файл. Повторный импорт с тем же slug обновит статью.</p>
          </div>
          <textarea
            className={styles.codeTextarea}
            rows={24}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            spellCheck={false}
          />
          <div className={styles.importActions}>
            <label className="btn btn-secondary">
              <Upload size={16} />
              Файл .json
              <input type="file" accept=".json,application/json" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
            </label>
            <button type="button" className="btn btn-primary" onClick={importArticle} disabled={submitting || !importText.trim()}>
              {submitting ? "Импортируем…" : "Импортировать"}
            </button>
          </div>
          {status && (
            <div className={status.startsWith("Статья") ? styles.importStatusOk : styles.importStatusError}>
              {status}
              {result?.public_url && (
                <>
                  {" "}
                  <a href={result.public_url} target="_blank" rel="noreferrer">
                    Открыть
                  </a>
                </>
              )}
              {result?.id && !result.public_url && (
                <>
                  {" "}
                  <Link href={`/blog/${result.id}`}>Редактировать</Link>
                </>
              )}
            </div>
          )}
          {result?.warnings && result.warnings.length > 0 && (
            <ul style={{ marginTop: 8, fontSize: 13, opacity: 0.85, paddingLeft: 18 }}>
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
