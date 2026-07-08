"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clipboard, Upload } from "lucide-react";
import styles from "../blog.module.css";

const APP_LANGUAGES = ["ru", "en", "de", "it", "fr", "es", "pt-BR", "uk"];

const exampleArticleRu = {
  slug: "bystrye-uzhiny-na-20-minut",
  title: "Быстрые ужины за 20 минут: подборка рецептов для буднего вечера",
  excerpt:
    "Собрали быстрые ужины, которые реально приготовить после работы: паста, боулы, супы и простые тарелки без долгой подготовки.",
  tldr:
    "Для быстрого ужина выбирайте блюда, где основа готовится параллельно с соусом или вообще не требует долгой термообработки. В подборку лучше включать рецепты с понятным временем, простыми продуктами и разными сценариями: паста, суп, боул и блюдо без готовки.",
  meta_title: "Быстрые ужины за 20 минут: подборка",
  meta_description:
    "Подборка быстрых ужинов за 20 минут: паста, суп, боулы и простые блюда для буднего вечера без долгой подготовки.",
  cover_image_alt: "Несколько быстрых домашних ужинов на столе",
  og_image_url: "https://example.com/recipe-og.jpg",
  sections: [
    {
      type: "p",
      text: "Когда времени мало, хороший ужин строится не на сложной технике, а на правильной комбинации: быстрая основа, готовый белок, понятный соус и свежий акцент.",
    },
    { type: "h2", text: "Как выбирать рецепты для быстрых ужинов" },
    {
      type: "ul",
      items: [
        "Время активной готовки должно быть коротким: нарезка, разогрев, смешивание или варка пасты.",
        "Белок лучше брать готовый или быстро готовящийся: тунец, яйца, чечевица, курица гриль, творог.",
        "Вкус собирается соусом, специями, зеленью или кислым акцентом, а не долгим тушением.",
      ],
    },
    { type: "h2", text: "Что включить в подборку" },
    {
      type: "ol",
      items: [
        "Один сытный рецепт с крупой или пастой.",
        "Один легкий вариант с овощами или салатом.",
        "Один горячий суп или блюдо в одной кастрюле.",
        "Один вариант почти без готовки для дней, когда совсем нет сил.",
      ],
    },
    { type: "h2", text: "Частые ошибки" },
    {
      type: "p",
      text: "Главная ошибка быстрых ужинов — выбирать блюда, которые выглядят простыми, но требуют много параллельной подготовки. В подборке лучше честно указывать время, сложность и продукты, которые можно держать дома заранее.",
    },
  ],
  faq_json: [
    {
      q: "Что считается быстрым ужином?",
      a: "Обычно это блюдо с активной готовкой до 20 минут и без долгого маринования, выпекания или сложной подготовки.",
    },
    {
      q: "Можно ли делать подборку без одного главного рецепта?",
      a: "Да. Для подборки используйте article_type: collection и заполните related_recipes точными названиями или UUID рецептов.",
    },
    {
      q: "Нужно ли указывать recipe_id?",
      a: "Для одиночной recipe-статьи лучше указать recipe_id. Для подборки можно указать несколько рецептов в related_recipes.",
    },
  ],
};

const exampleArticleEn = {
  slug: "20-minute-dinners",
  title: "20-Minute Dinners: Fast Recipes for Weeknights",
  excerpt: "Fast dinners you can actually cook after work: pasta, bowls, soups and simple plates with no long prep.",
  tldr:
    "For a fast dinner, pick dishes where the base cooks in parallel with the sauce or needs almost no cooking at all. Mix a pasta or grain dish, a light vegetable option, a one-pot soup, and a no-cook option.",
  meta_title: "20-Minute Dinners: Fast Recipe Roundup",
  meta_description: "A roundup of 20-minute dinners: pasta, soup, bowls and simple plates for busy weeknights.",
  cover_image_alt: "Several fast home-cooked dinners on a table",
  og_image_url: "https://example.com/recipe-og.jpg",
  sections: exampleArticleRu.sections,
  faq_json: [
    { q: "What counts as a fast dinner?", a: "Usually a dish with under 20 minutes of active cooking and no long marinating or baking." },
    { q: "Can a roundup skip a single main recipe?", a: "Yes — use article_type: collection and fill related_recipes with exact titles or UUIDs." },
    { q: "Do I need a recipe_id?", a: "For a single recipe article, prefer recipe_id. For a collection, list several recipes in related_recipes." },
  ],
};

const exampleImport = {
  status: "draft",
  source: "ai_assisted",
  article_type: "collection",
  category: {
    slug: "podborki",
    translations: {
      ru: { name: "Подборки", description: "Практичные подборки рецептов Dishday для быстрых решений на каждый день." },
      en: { name: "Roundups", description: "Practical Dishday recipe roundups for quick everyday decisions." },
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
    { slug: "podborka-retseptov", translations: { ru: "Подборка рецептов", en: "Recipe roundup" } },
  ],
  related_recipes: [
    {
      recipe_title: "Точное название рецепта из базы",
      label: "Главный быстрый ужин",
      note: "Подходит, когда нужен сытный ужин за 20 минут.",
    },
    {
      recipe_title: "Еще одно точное название рецепта",
      label: "Легкая альтернатива",
      note: "Добавьте в подборку второй рецепт, если статья является списком.",
    },
  ],
  cover_image_url: "https://example.com/recipe-cover.jpg",
  reading_time_min: 7,
  translations: {
    ru: exampleArticleRu,
    en: exampleArticleEn,
  },
};

function buildPrompt(exampleJson: string) {
  return `Сгенерируй JSON для импорта статьи в блог Dishday.
Верни ТОЛЬКО валидный JSON без markdown, комментариев и пояснений.

Задача:
- Статья должна быть готова к публикации как recipe article, СРАЗУ на нескольких языках в одном JSON.
- Она может быть трех типов: article_type "recipe" для одного рецепта, "collection" для подборки рецептов, "guide" для обычной статьи без рецепта.
- Она должна помогать Google и AI-поисковикам понять страницу: понятный title, excerpt, TL;DR, подробные секции, FAQ, cover image, теги, категория. Для recipe добавь recipe_title/recipe_id, для collection добавь related_recipes.
- Если у рецепта уже есть точные ингредиенты, время, порции и шаги — не противоречь им в статье.

Языки:
- Поле "translations" — объект, где ключ это код языка, а значение — полностью заполненная статья на этом языке (свой slug, title, excerpt, tldr, meta, sections, faq_json).
- Заполни языки: ${APP_LANGUAGES.join(", ")} (это все языки приложения Dishday). Если явно попросили конкретный язык или подмножество — используй только их.
- Каждый язык переведи полноценно, не дословно, с учётом того, как реально ищут на этом языке — не просто гугл-перевод.
- category.translations и tags[].translations — тоже объекты по языкам: { "ru": {...}, "en": {...}, ... }. Не показывай их только на одном языке.
- author, cover_image_url, article_type, recipe_title/recipe_id, related_recipes, tags[].slug, category.slug — общие для всех языков, заполняются один раз (не дублируются по языкам).

Правила структуры:
- status: сначала "draft", если явно не попросили публиковать.
- article_type обязателен: "recipe", "collection" или "guide".
- Для article_type "recipe": recipe_required: true, recipe_title должен точно совпадать с названием рецепта в базе, если recipe_id неизвестен.
- Для article_type "collection": recipe_required не нужен, но related_recipes обязателен. Каждый элемент related_recipes содержит recipe_title или recipe_id, optional label и note.
- Для article_type "guide": не указывай recipe_title и related_recipes, если статья не связана с рецептами.
- category.slug и tags[].slug пиши латиницей или понятной транслитерацией без пробелов, ОДИНАКОВО во всех языках (это технический идентификатор, не текст).
- translations.<lang>.slug пиши латиницей, коротко, без дат — на каждом языке свой, соответствующий переведённому заголовку.
- translations.<lang>.title: поисковый заголовок с намерением пользователя на этом языке, не кликбейт.
- excerpt: 140-220 символов.
- tldr: 2-3 коротких предложения с прямым ответом на вопрос из заголовка.
- meta_title: до 60 символов.
- meta_description: до 155 символов.
- cover_image_alt: конкретно описывает готовое блюдо, на языке перевода.
- sections: 5-8 блоков на каждом языке. Используй только type: "p", "h2", "h3", "ul", "ol", "blockquote", "image".
- В sections обязательно должны быть: краткое вступление, что важно для результата, пошаговый план, частые ошибки, подача/хранение или вариации.
- faq_json: 3-5 вопросов на каждом языке, ответы короткие и конкретные.
- Не вставляй HTML в sections. Только текст и массивы.
- Не выдумывай UUID. Если recipe_id неизвестен, используй recipe_title.
- Не используй trailing commas.

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
