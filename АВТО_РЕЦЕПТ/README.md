# АВТО_РЕЦЕПТ

Папка для полуавтоматической подготовки рецептов в формате:

- колонка `A` — полный JSON рецепта в одной ячейке;
- колонка `B` — URL картинки из ImageKit.

Скрипт в этой папке не вызывает OpenAI API. JSON и картинки готовит Codex в чате: JSON текстом/файлом, картинки через встроенный генератор изображений Codex. Скрипт отвечает только за загрузку картинок в ImageKit и сборку итогового CSV.

## Структура

```text
АВТО_РЕЦЕПТ/
  README.md
  imagekit-recipe-table.js
  recipes-manifest.example.jsonl
  env.example
  work/
    recipe-001.json
    recipe-001.png
  output/
    recipes-output.csv
```

`work/` и `output/` можно создавать вручную. В `work/` складываются готовые JSON и локальные картинки. В `output/` пишется итоговая таблица.

## Входной документ

Обычно пользователь даёт таблицу или документ с 36 рецептами. Минимально достаточно:

```text
Название: Сырники с ванилью и вишнёвым соусом
Описание: Нежные сырники с чуть более кремовой текстурой, чем в классике, подаются с быстрым соусом из вишни.
Почему включён: сырники — один из самых узнаваемых украинских завтраков.
Сложность: легкий
```

Для каждого рецепта Codex должен:

1. Сгенерировать полный JSON по эталонному промпту ниже.
2. Сохранить JSON отдельным файлом, например `АВТО_РЕЦЕПТ/work/recipe-001.json`.
3. Сгенерировать картинку 4:3 по рецепту.
4. Сохранить картинку отдельным файлом, например `АВТО_РЕЦЕПТ/work/recipe-001.png`.
5. Добавить строку в `recipes-manifest.jsonl`.
6. Запустить загрузку в ImageKit и сборку CSV.

## Манифест

Файл `recipes-manifest.jsonl` содержит одну JSON-строку на один рецепт:

```json
{"jsonPath":"./АВТО_РЕЦЕПТ/work/recipe-001.json","imagePath":"./АВТО_РЕЦЕПТ/work/recipe-001.png","fileName":"syrnyky-vanilla-cherry-sauce.webp"}
```

Поля:

- `jsonPath` — путь к JSON рецепта.
- `imagePath` — путь к локальной картинке.
- `fileName` — имя файла в ImageKit. Лучше сразу указывать `.webp`.

Можно вместо `jsonPath` передать объект `json`, но для 36 рецептов удобнее хранить отдельные `.json` файлы.

## ImageKit

Нужен приватный ключ ImageKit:

```bash
export IMAGEKIT_PRIVATE_KEY="private_xxx"
```

Опционально:

```bash
export IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/your_id"
export IMAGEKIT_FOLDER="/recipes/ukrainian"
```

Скрипт загружает файл через ImageKit Upload API. Если локально установлен `cwebp` или ImageMagick (`magick`), картинка перед загрузкой конвертируется в WebP. Если конвертера нет, скрипт загрузит оригинал и в колонку `B` запишет ImageKit URL с трансформацией `tr=f-webp,q-80`.

Для строгого режима, где обязательно нужно загрузить именно локальный `.webp`, установить:

```bash
npm run imagekit:setup-webp
```

И запускать с `--local-webp`.

## Запуск

Из папки `admin-panel`:

```bash
npm run imagekit:recipes -- \
  --manifest ./АВТО_РЕЦЕПТ/recipes-manifest.jsonl \
  --out ./АВТО_РЕЦЕПТ/output/recipes-output.csv \
  --folder /recipes/ukrainian \
  --quality 80
```

Сухая проверка без загрузки в ImageKit:

```bash
npm run imagekit:recipes -- \
  --manifest ./АВТО_РЕЦЕПТ/recipes-manifest.jsonl \
  --out ./АВТО_РЕЦЕПТ/output/recipes-output.csv \
  --dry-run
```

Результат: CSV без заголовков. Каждая строка:

```text
A = весь JSON рецепта
B = URL картинки ImageKit
```

## Эталонный промпт для JSON

Использовать этот промпт для каждого рецепта. Вставить в конец название/описание конкретного рецепта.

```text
Сгенерируй JSON для рецепта.
Верни ТОЛЬКО валидный JSON без markdown и пояснений.

Контекст текущей формы:
- Каталог уже выбран: "Українська кухня" (cuisine_id="ca9a1834-6081-4d37-a298-f27ee1ac6a94"). Используй именно этот UUID.
- is_user_defined: false.
- difficulty по умолчанию в текущей форме: "medium".
- Если точное число порций неизвестно, возьми servings=4.
- comments_enabled по умолчанию: true.

Правила:
- title, description, tips, serving_tips, storage_tips и recipe_note — это канонические текстовые поля рецепта.
- Для шагов приготовления используй canonical-массив steps. Каждый шаг обязан содержать text и duration_minutes.
- description делай развернутым: 3-5 предложений, 450-750 символов. Опиши что это за блюдо, его происхождение или контекст, вкус, аромат, текстуру, ключевые ингредиенты и почему оно работает как готовый рецепт.
- steps.text пиши как мини-мастер-класс от шефа для новичка: простыми словами, но познавательно. Каждый шаг объясняет не только "что сделать", но и "зачем это важно" или "как понять, что получилось правильно".
- Для новичков обязательно добавляй визуальные и сенсорные ориентиры: цвет, запах, консистенция, мягкость, момент закипания, степень румяности.
- Сначала определи язык исходного текста. Это базовый язык рецепта.
- translations содержит переводы для ВСЕХ остальных поддерживаемых языков, кроме базового языка.
- Если базовый язык один из поддерживаемых, внутри translations должно быть ровно 7 языков.
- Используй только языки: ru, en, de, fr, it, es, pt-BR, uk.
- Для units используй только: g, kg, ml, l, pcs, tbsp, tsp.
- tags — обязательный массив строк. Выбери из: quick, special occasion, light, hearty, breakfast, lunch, dinner, snack, vegetarian, vegan, gluten-free, dairy-free, soup, salad, pasta, grill, baking, raw.
- ingredients — массив объектов {id,name,quantity,unit}. Если UUID продукта неизвестен, ставь id пустым "" и заполняй name.
- Все числовые поля возвращай как number или null.
- Верхние поля calories / protein / fat / carbs / fiber / sugar / salt / saturated_fat / cholesterol / sodium заполняй реалистичной оценкой на порцию.
- nutrition_per_100g заполняй числами, если их можно оценить.
- Для каждого шага обязательно укажи duration_minutes, но заполняй его ТОЛЬКО если время явно указано в исходном рецепте. Если время не написано явно, ставь null.
- tips, serving_tips, storage_tips и recipe_note — строки или null.
- image_url у рецепта и шагов оставляй null.
- Не выдумывай UUID.
- Никаких trailing commas.

Обязательная структура верхнего уровня:
{
  "id": null,
  "title": "",
  "description": "",
  "image_url": null,
  "cuisine_id": "ca9a1834-6081-4d37-a298-f27ee1ac6a94",
  "dish_type": "",
  "course": "",
  "owner_id": null,
  "is_user_defined": false,
  "author": null,
  "contributor_ids": [],
  "servings": 4,
  "prep_time": null,
  "cook_time": null,
  "difficulty": "medium",
  "tags": [],
  "diet_tags": [],
  "allergen_tags": [],
  "cuisine_tags": [],
  "equipment": [],
  "tools_optional": [],
  "calories": null,
  "protein": null,
  "fat": null,
  "carbs": null,
  "fiber": null,
  "sugar": null,
  "salt": null,
  "saturated_fat": null,
  "cholesterol": null,
  "sodium": null,
  "nutrition_per_100g": null,
  "tips": null,
  "serving_tips": null,
  "storage_tips": null,
  "recipe_note": null,
  "comments_enabled": true,
  "comments_count": 0,
  "ingredients": [],
  "steps": [],
  "translations": {}
}

Рецепт:
<ВСТАВИТЬ НАЗВАНИЕ, ОПИСАНИЕ, СЛОЖНОСТЬ И ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ>
```

## Эталонный промпт для картинки

Картинка должна соответствовать конкретному рецепту, а не общему стилю. Если рецепт — сырники, на изображении должны быть сырники; если борщ — борщ.

```text
Use case: photorealistic-natural
Asset type: recipe catalog food image, 4:3 aspect ratio
Primary request: Close-up 45-degree angle shot of homemade <RECIPE_TITLE>, realistic homemade presentation.
Scene/backdrop: cozy apartment kitchen mood with soft natural window light from the side; realistic shadows, natural colors, warm but not oversaturated.
Subject: <CONCRETE DESCRIPTION OF THIS DISH>. The food should look handmade and slightly imperfect, with natural textures and authentic home cooking atmosphere.
Composition: simple ceramic plate or bowl appropriate for the dish, dark textile napkin, heavy cutlery, one small relevant side prop in the background if useful. Shallow depth of field, Canon R6 50mm f/1.8 food blogger aesthetic, unstaged homemade food photography.
Negative constraints: no glossy advertising style, no oversaturated colors, no plastic-looking food, no CGI, no fake steam, no luxury restaurant plating, no obvious AI-generated look, no excessive props, no studio photography, no text, no watermark.
```

Для каждого рецепта заменить:

- `<RECIPE_TITLE>` — название блюда.
- `<CONCRETE DESCRIPTION OF THIS DISH>` — конкретное описание внешнего вида блюда, ключевых ингредиентов, соуса, текстуры и подачи.

## Рабочий чеклист для нового ИИ

1. Прочитать входной файл с рецептами.
2. Для каждого рецепта создать валидный JSON по эталонному промпту.
3. Проверить JSON через `JSON.parse`.
4. Сохранить JSON в `АВТО_РЕЦЕПТ/work/recipe-XXX.json`.
5. Сгенерировать картинку через встроенный image generator Codex.
6. Визуально проверить, что картинка соответствует рецепту.
7. Скопировать картинку в `АВТО_РЕЦЕПТ/work/recipe-XXX.png`.
8. Добавить строку в `АВТО_РЕЦЕПТ/recipes-manifest.jsonl`.
9. Запустить dry-run.
10. Запустить реальную загрузку в ImageKit.
11. Проверить итоговый CSV: строк должно быть столько же, сколько рецептов; в колонке `A` JSON; в колонке `B` URL.

## Проверка результата

Команда для проверки CSV:

```bash
node - <<'NODE'
const fs = require("fs");
const csv = fs.readFileSync("./АВТО_РЕЦЕПТ/output/recipes-output.csv", "utf8");
console.log(csv.split(/\r?\n/).filter(Boolean).length);
NODE
```

Для точной проверки можно открыть CSV в Numbers/Excel/Google Sheets: JSON должен быть целиком в одной ячейке колонки `A`, URL картинки — в соседней ячейке колонки `B`.
