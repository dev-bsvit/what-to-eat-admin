import { NextResponse } from "next/server";
import {
  APP_LANGUAGES,
  DEFAULT_LANGUAGE,
  VALID_ARTICLE_TYPES,
  asString,
  isRecord,
  listCategoryOptions,
  listTagOptions,
  searchRecipeCandidates,
} from "@/lib/blogContent";

// POST /api/admin/blog/prompt
// Body: { topic: string, article_type?: "guide"|"recipe"|"collection", languages?: string[] }
//
// Assembles a ready-to-copy AI prompt grounded in real DB data (candidate
// recipes matching the topic, existing category/tag slugs) so the AI writing
// the article can only reference real recipe_id/slug values instead of
// inventing plausible-but-nonexistent titles — the failure mode that broke
// collection-article imports earlier. Returns plain text, not JSON content.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "JSON object is required" }, { status: 400 });

    const topic = asString(body.topic);
    if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

    const articleTypeRaw = asString(body.article_type);
    const articleType = VALID_ARTICLE_TYPES.has(articleTypeRaw) ? articleTypeRaw : "guide";

    const languagesInput = Array.isArray(body.languages) ? body.languages.map(asString).filter(Boolean) : [];
    const languages = languagesInput.length > 0 ? languagesInput.filter((l) => (APP_LANGUAGES as readonly string[]).includes(l)) : [DEFAULT_LANGUAGE];

    const needsRecipes = articleType === "recipe" || articleType === "collection";
    const [recipeCandidates, categories, tags] = await Promise.all([
      needsRecipes ? searchRecipeCandidates(topic, 15) : Promise.resolve([]),
      listCategoryOptions(DEFAULT_LANGUAGE),
      listTagOptions(DEFAULT_LANGUAGE),
    ]);

    const prompt = buildGroundedPrompt({ topic, articleType, languages, recipeCandidates, categories, tags });

    return NextResponse.json({
      prompt,
      recipe_candidates: recipeCandidates,
      matched_recipes: recipeCandidates.length,
      categories,
      tags,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

function buildGroundedPrompt(input: {
  topic: string;
  articleType: string;
  languages: string[];
  recipeCandidates: Array<{ id: string; title: string }>;
  categories: Array<{ slug: string; name: string }>;
  tags: Array<{ slug: string; name: string }>;
}) {
  const { topic, articleType, languages, recipeCandidates, categories, tags } = input;

  const typeInstruction =
    articleType === "recipe"
      ? `Тип статьи: "recipe" — статья об ОДНОМ рецепте. Обязательно укажи recipe_id (не recipe_title), взяв его ТОЛЬКО из списка "Реальные рецепты из базы" ниже. Если ни один из списка не подходит под тему, не изобретай рецепт — вместо этого сделай article_type: "guide" без рецепта.`
      : articleType === "collection"
        ? `Тип статьи: "collection" — подборка из нескольких рецептов. related_recipes обязателен: каждый элемент должен использовать recipe_id ТОЛЬКО из списка "Реальные рецепты из базы" ниже (не recipe_title, не выдуманные названия). Если подходящих рецептов в списке меньше 2 — сократи подборку до тех, что реально есть, не добавляй несуществующие.`
        : `Тип статьи: "guide" — обычная статья без привязки к конкретному рецепту. НЕ указывай recipe_id, recipe_title и related_recipes вообще — эти поля должны отсутствовать или быть пустыми.`;

  const recipesBlock =
    articleType === "guide"
      ? "Рецепты не нужны для этого типа статьи."
      : recipeCandidates.length > 0
        ? recipeCandidates.map((r) => `- id: ${r.id} | title: ${r.title}`).join("\n")
        : "В базе не нашлось рецептов, явно совпадающих с темой. Не изобретай рецепт — либо сузь/измени тему, либо сделай article_type: \"guide\".";

  const categoriesBlock = categories.length > 0 ? categories.map((c) => `- slug: ${c.slug} | ${c.name}`).join("\n") : "(категорий пока нет)";
  const tagsBlock = tags.length > 0 ? tags.map((t) => `- slug: ${t.slug} | ${t.name}`).join("\n") : "(тегов пока нет)";

  return `Сгенерируй JSON для импорта статьи в блог Dishday.
Верни ТОЛЬКО валидный JSON без markdown, комментариев и пояснений.

Тема статьи (от редактора): "${topic}"

${typeInstruction}

Реальные рецепты из базы (используй ТОЛЬКО эти id, не выдумывай другие):
${recipesBlock}

Существующие категории блога (используй одну из них по slug, если по смыслу подходит; создавай новую категорию только если ни одна не подходит):
${categoriesBlock}

Существующие теги блога (переиспользуй подходящие по slug вместо создания дублей):
${tagsBlock}

Языки:
- Поле "translations" — объект, где ключ это код языка, а значение — полностью заполненная статья на этом языке (свой slug, title, excerpt, tldr, meta, sections, faq_json).
- Заполни ТОЛЬКО эти языки: ${languages.join(", ")}. Не добавляй другие.
- Каждый язык переведи полноценно, не дословно, с учётом того, как реально ищут на этом языке — не просто гугл-перевод.
- category.translations и tags[].translations — тоже объекты по языкам, но только для запрошенных языков: ${languages.map((l) => `"${l}"`).join(", ")}.
- author, cover_image_url, article_type, recipe_id, related_recipes, tags[].slug, category.slug — общие для всех языков, заполняются один раз (не дублируются по языкам).

Правила структуры:
- status: "draft".
- source: "ai_assisted".
- article_type: "${articleType}".
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
- Не используй trailing commas.

Формат ответа (пример структуры, замени содержимое реальными данными по теме выше):
{
  "status": "draft",
  "source": "ai_assisted",
  "article_type": "${articleType}",
  "category": { "slug": "...", "translations": { ${languages.map((l) => `"${l}": { "name": "...", "description": "..." }`).join(", ")} } },
  "author": { "name": "Dishday", "title": "Редакция рецептов", "bio": "...", "same_as": ["https://dishday.online"] },
  "tags": [ { "slug": "...", "translations": { ${languages.map((l) => `"${l}": "..."`).join(", ")} } } ],
  ${articleType === "recipe" ? `"recipe_id": "один из id выше",` : ""}
  ${articleType === "collection" ? `"related_recipes": [ { "recipe_id": "один из id выше", "label": "...", "note": "..." } ],` : ""}
  "cover_image_url": "https://...",
  "reading_time_min": 7,
  "translations": {
    ${languages
      .map(
        (l) =>
          `"${l}": { "slug": "...", "title": "...", "excerpt": "...", "tldr": "...", "meta_title": "...", "meta_description": "...", "cover_image_alt": "...", "sections": [ { "type": "p", "text": "..." } ], "faq_json": [ { "q": "...", "a": "..." } ] }`
      )
      .join(",\n    ")}
  }
}`;
}
