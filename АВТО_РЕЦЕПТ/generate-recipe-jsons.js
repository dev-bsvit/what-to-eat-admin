#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const INPUT = path.join(ROOT, "input-recipes.md");
const WORK = path.join(ROOT, "work");
const MANIFEST = path.join(ROOT, "recipes-manifest.jsonl");
const PROMPTS = path.join(ROOT, "image-prompts.jsonl");
const CUISINE_ID = "ca9a1834-6081-4d37-a298-f27ee1ac6a94";
const LANGS = ["en", "de", "fr", "it", "es", "pt-BR", "uk"];

const text = fs.readFileSync(INPUT, "utf8");
const recipes = parseInput(text);

fs.mkdirSync(WORK, { recursive: true });

const manifest = [];
const prompts = [];

recipes.forEach((source, index) => {
  const number = String(index + 1).padStart(3, "0");
  const fileStem = `${number}-${slug(source.title)}`;
  const jsonPath = path.join(WORK, `${fileStem}.json`);
  const imagePath = path.join(WORK, `${fileStem}.png`);
  const recipe = buildRecipe(source);

  fs.writeFileSync(jsonPath, JSON.stringify(recipe, null, 2), "utf8");
  manifest.push(
    JSON.stringify({
      jsonPath: `./АВТО_РЕЦЕПТ/work/${fileStem}.json`,
      imagePath: `./АВТО_РЕЦЕПТ/work/${fileStem}.png`,
      fileName: `${fileStem}.webp`,
    })
  );
  prompts.push(
    JSON.stringify({
      title: source.title,
      imagePath: `./АВТО_РЕЦЕПТ/work/${fileStem}.png`,
      prompt: imagePrompt(source),
    })
  );
});

fs.writeFileSync(MANIFEST, `${manifest.join("\n")}\n`, "utf8");
fs.writeFileSync(PROMPTS, `${prompts.join("\n")}\n`, "utf8");

console.log(`Generated ${recipes.length} recipe JSON files`);
console.log(`Manifest: ${MANIFEST}`);
console.log(`Image prompts: ${PROMPTS}`);

function parseInput(raw) {
  const lines = raw.split(/\r?\n/);
  const result = [];
  let category = "";
  let current = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      category = line.replace(/^##\s*/, "").replace(/^\d+\.\s*/, "").trim();
      continue;
    }
    if (line.startsWith("### ")) {
      if (current) result.push(current);
      current = { category, title: line.replace(/^###\s*/, "").trim(), description: "", why: "", difficulty: "medium", prep: "" };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Почему включён:")) current.why = trimmed.replace("Почему включён:", "").trim();
    else if (trimmed.startsWith("Сложность:")) current.difficulty = normalizeDifficulty(trimmed.replace("Сложность:", "").trim());
    else if (trimmed.startsWith("Заготовка:")) current.prep = trimmed.replace("Заготовка:", "").trim();
    else current.description = current.description ? `${current.description} ${trimmed}` : trimmed;
  }

  if (current) result.push(current);
  return result;
}

function buildRecipe(source) {
  const profile = profileFor(source);
  const ingredients = ingredientsFor(source.title);
  const nutrition = nutritionFor(profile.course, ingredients);
  const steps = stepsFor(source, profile, ingredients);

  return {
    id: null,
    title: source.title,
    description: descriptionFor(source, profile),
    image_url: null,
    cuisine_id: CUISINE_ID,
    dish_type: profile.dishType,
    course: profile.course,
    owner_id: null,
    is_user_defined: false,
    author: null,
    contributor_ids: [],
    servings: profile.servings,
    prep_time: profile.prepTime,
    cook_time: profile.cookTime,
    difficulty: source.difficulty,
    tags: profile.tags,
    diet_tags: profile.dietTags,
    allergen_tags: profile.allergenTags,
    cuisine_tags: ["ukrainian"],
    equipment: profile.equipment,
    tools_optional: profile.optional,
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbs: nutrition.carbs,
    fiber: nutrition.fiber,
    sugar: nutrition.sugar,
    salt: nutrition.salt,
    saturated_fat: nutrition.saturated_fat,
    cholesterol: nutrition.cholesterol,
    sodium: nutrition.sodium,
    nutrition_per_100g: per100(nutrition),
    tips: tipsFor(source),
    serving_tips: servingFor(source, profile),
    storage_tips: storageFor(source),
    recipe_note: noteFor(source),
    comments_enabled: true,
    comments_count: 0,
    ingredients,
    steps,
    translations: translationsFor(source, steps),
  };
}

function profileFor(source) {
  const title = source.title.toLowerCase();
  const category = source.category.toLowerCase();
  const isBreakfast = category.includes("завтраки");
  const isSoup = category.includes("супы");
  const isSnack = category.includes("соусы") || title.includes("пампуш") || title.includes("хумус") || title.includes("намаз") || title.includes("огурц") || title.includes("паштет");
  const isSide = category.includes("овощи") || title.includes("гречка") || title.includes("пшоно") || title.includes("капуста") || title.includes("свёкла");
  const hasMeat = /говядин|теля|утк|курин|сал|печен|котлет|лосос|скумбр/.test(title);
  const hasDairy = /сыр|брынз|сметан|молок|омлет|масл|крем/.test(title);
  const hasGluten = /вареник|пампуш|котлета|вафл/.test(title);
  const tags = [];
  if (isBreakfast) tags.push("breakfast");
  else if (isSoup) tags.push("lunch", "soup");
  else if (isSnack) tags.push("snack");
  else tags.push("dinner");
  if (!hasMeat) tags.push("vegetarian");
  if (source.difficulty === "easy") tags.push("quick");
  if (/пампуш|запеч|голубц|борщ|печеня|утк/.test(title)) tags.push("special occasion");

  return {
    dishType: isSoup ? "soup" : isSnack ? "appetizer" : isSide ? "side" : isBreakfast ? "breakfast" : "main",
    course: isBreakfast ? "breakfast" : isSnack ? "snack" : isSide ? "side" : "main",
    servings: title.includes("соус") || title.includes("намаз") || title.includes("хумус") ? 6 : 4,
    prepTime: source.difficulty === "easy" ? 15 : 30,
    cookTime: isSoup || title.includes("голубц") || title.includes("печеня") ? 70 : title.includes("пампуш") ? 35 : 25,
    tags: [...new Set(tags)],
    dietTags: hasMeat ? [] : ["vegetarian"],
    allergenTags: [
      ...(hasDairy ? ["dairy"] : []),
      ...(hasGluten ? ["gluten"] : []),
      ...(title.includes("омлет") || title.includes("яйц") || title.includes("сырник") ? ["eggs"] : []),
      ...(title.includes("лосос") || title.includes("скумбр") ? ["fish"] : []),
      ...(title.includes("орех") ? ["nuts"] : []),
    ],
    equipment: equipmentFor(title, isSoup),
    optional: title.includes("вафл") ? ["waffle iron"] : [],
  };
}

function ingredientsFor(title) {
  const t = title.toLowerCase();
  const item = (name, quantity, unit) => ({ id: "", name, quantity, unit });
  if (t.includes("ванилью")) return [item("Творог", 500, "g"), item("Яйцо", 1, "pcs"), item("Мука", 60, "g"), item("Сахар", 80, "g"), item("Ванильный сахар", 10, "g"), item("Вишня", 300, "g"), item("Лимонный сок", 1, "tbsp"), item("Крахмал", 1, "tbsp")];
  if (t.includes("солёные сырники")) return [item("Творог", 500, "g"), item("Брынза", 180, "g"), item("Яйцо", 1, "pcs"), item("Мука", 70, "g"), item("Укроп", 20, "g"), item("Зелёный лук", 30, "g"), item("Соль", 0.5, "tsp")];
  if (t.includes("пшённая каша")) return [item("Пшено", 220, "g"), item("Тыква", 500, "g"), item("Молоко", 500, "ml"), item("Мёд", 3, "tbsp"), item("Сливочное масло", 40, "g"), item("Соль", 0.5, "tsp")];
  if (t.includes("гречка на молоке")) return [item("Гречка", 220, "g"), item("Молоко", 600, "ml"), item("Груша", 2, "pcs"), item("Грецкие орехи", 60, "g"), item("Мёд", 2, "tbsp"), item("Сливочное масло", 30, "g")];
  if (t.includes("омлет")) return [item("Яйцо", 6, "pcs"), item("Печёный перец", 220, "g"), item("Сметана", 160, "g"), item("Укроп", 20, "g"), item("Сливочное масло", 25, "g"), item("Соль", 0.5, "tsp")];
  if (t.includes("лососем")) return [item("Картофель", 700, "g"), item("Яйцо", 1, "pcs"), item("Мука", 50, "g"), item("Лосось слабосолёный", 180, "g"), item("Сметана", 150, "g"), item("Хрен", 1, "tbsp"), item("Укроп", 15, "g")];
  if (t.includes("борщ с печёной")) return [item("Говяжий бульон", 2, "l"), item("Свёкла", 500, "g"), item("Капуста", 300, "g"), item("Картофель", 300, "g"), item("Морковь", 120, "g"), item("Лук", 120, "g"), item("Копчёная груша", 1, "pcs"), item("Томатная паста", 2, "tbsp")];
  if (t.includes("зелёный борщ")) return [item("Куриный бульон", 1.8, "l"), item("Шпинат", 200, "g"), item("Картофель", 300, "g"), item("Яйцо", 4, "pcs"), item("Укроп", 25, "g"), item("Сметана", 120, "g")];
  if (t.includes("капусняк")) return [item("Квашеная капуста", 500, "g"), item("Белые грибы", 60, "g"), item("Картофель", 300, "g"), item("Морковь", 120, "g"), item("Лук", 120, "g"), item("Пшено", 80, "g")];
  if (t.includes("крем-суп")) return [item("Тыква", 900, "g"), item("Овощной бульон", 800, "ml"), item("Мочёное яблоко", 1, "pcs"), item("Сливки", 150, "ml"), item("Лук", 120, "g"), item("Масло", 2, "tbsp")];
  if (t.includes("свекольник")) return [item("Свёкла", 500, "g"), item("Кефир", 1, "l"), item("Огурец", 250, "g"), item("Яйцо", 4, "pcs"), item("Укроп", 30, "g"), item("Лимонный сок", 1, "tbsp")];
  if (t.includes("юшка")) return [item("Лесные грибы", 400, "g"), item("Перловка", 120, "g"), item("Морковь", 100, "g"), item("Лук", 100, "g"), item("Зелень", 30, "g"), item("Сливочное масло", 30, "g")];
  if (t.includes("деруны с грибным")) return [item("Картофель", 800, "g"), item("Яйцо", 1, "pcs"), item("Лук", 120, "g"), item("Мука", 40, "g"), item("Шампиньоны", 350, "g"), item("Сметана", 180, "g")];
  if (t.includes("томлёной уткой")) return [item("Картофель", 800, "g"), item("Яйцо", 1, "pcs"), item("Мука", 40, "g"), item("Утиное мясо", 350, "g"), item("Сметана", 120, "g"), item("Лук", 120, "g")];
  if (t.includes("картофелем")) return [item("Мука", 500, "g"), item("Вода", 250, "ml"), item("Картофель", 600, "g"), item("Брынза", 180, "g"), item("Лук", 250, "g"), item("Сливочное масло", 60, "g")];
  if (t.includes("вишней и маковым")) return [item("Мука", 500, "g"), item("Вода", 250, "ml"), item("Вишня", 500, "g"), item("Сахар", 120, "g"), item("Мак", 80, "g"), item("Сметана", 120, "g")];
  if (t.includes("ленивые")) return [item("Творог", 600, "g"), item("Яйцо", 1, "pcs"), item("Мука", 120, "g"), item("Сахар", 50, "g"), item("Сливочное масло", 80, "g"), item("Грецкие орехи", 60, "g")];
  if (t.includes("пампушки")) return [item("Мука", 500, "g"), item("Вода", 280, "ml"), item("Дрожжи", 7, "g"), item("Сахар", 1, "tbsp"), item("Чеснок", 4, "pcs"), item("Зелень", 30, "g"), item("Масло", 50, "ml")];
  if (t.includes("голубцы с телятиной")) return [item("Капустные листья", 12, "pcs"), item("Телятина", 500, "g"), item("Рис", 120, "g"), item("Лук", 150, "g"), item("Морковь", 120, "g"), item("Томатный соус", 500, "ml")];
  if (t.includes("голубцы с грибами")) return [item("Капустные листья", 12, "pcs"), item("Грибы", 400, "g"), item("Пшено", 180, "g"), item("Лук", 150, "g"), item("Морковь", 120, "g"), item("Томатный соус", 400, "ml")];
  if (t.includes("киевски")) return [item("Куриное филе", 600, "g"), item("Сливочное масло", 120, "g"), item("Укроп", 25, "g"), item("Яйцо", 2, "pcs"), item("Панировочные сухари", 160, "g"), item("Мука", 80, "g")];
  if (t.includes("печеня")) return [item("Говядина", 700, "g"), item("Картофель", 500, "g"), item("Морковь", 200, "g"), item("Пастернак", 150, "g"), item("Чернослив", 120, "g"), item("Бульон", 500, "ml")];
  if (t.includes("гречаники")) return [item("Фарш", 500, "g"), item("Гречка", 180, "g"), item("Яйцо", 1, "pcs"), item("Лук", 150, "g"), item("Шампиньоны", 350, "g"), item("Сметана", 160, "g")];
  if (t.includes("скумбрия")) return [item("Скумбрия", 2, "pcs"), item("Лук", 250, "g"), item("Сметана", 160, "g"), item("Горчица", 1, "tbsp"), item("Лимонный сок", 1, "tbsp"), item("Укроп", 20, "g")];
  if (t.includes("свёкла с кремом")) return [item("Свёкла", 700, "g"), item("Брынза", 220, "g"), item("Сметана", 120, "g"), item("Грецкие орехи", 70, "g"), item("Зелень", 30, "g"), item("Масло", 2, "tbsp")];
  if (t.includes("молодая капуста")) return [item("Молодая капуста", 800, "g"), item("Сливочное масло", 70, "g"), item("Укроп", 30, "g"), item("Соль", 0.5, "tsp"), item("Лимонный сок", 1, "tbsp")];
  if (t.includes("гречка с печёными")) return [item("Гречка", 260, "g"), item("Грибы", 450, "g"), item("Лук", 300, "g"), item("Сливочное масло", 50, "g"), item("Тимьян", 1, "tsp")];
  if (t.includes("пшоно с тыквой")) return [item("Пшено", 240, "g"), item("Тыква", 600, "g"), item("Брынза", 220, "g"), item("Сливочное масло", 40, "g"), item("Мёд", 1, "tbsp")];
  if (t.includes("фасоль")) return [item("Фасоль", 320, "g"), item("Томаты", 500, "g"), item("Лук", 150, "g"), item("Чеснок", 3, "pcs"), item("Копчёная паприка", 1, "tsp"), item("Масло", 2, "tbsp")];
  if (t.includes("картофель, запечённый")) return [item("Картофель", 900, "g"), item("Грибы", 400, "g"), item("Сметана", 220, "g"), item("Лук", 200, "g"), item("Сыр", 100, "g"), item("Укроп", 20, "g")];
  if (t.includes("хумус")) return [item("Нут", 300, "g"), item("Свёкла", 350, "g"), item("Тахини", 2, "tbsp"), item("Чеснок", 2, "pcs"), item("Тмин", 1, "tsp"), item("Лимонный сок", 2, "tbsp")];
  if (t.includes("сметанный крем")) return [item("Сметана", 300, "g"), item("Хрен", 2, "tbsp"), item("Укроп", 25, "g"), item("Лимонный сок", 1, "tbsp"), item("Соль", 0.5, "tsp")];
  if (t.includes("сала")) return [item("Сало", 350, "g"), item("Чеснок", 4, "pcs"), item("Укроп", 20, "g"), item("Петрушка", 20, "g"), item("Чёрный перец", 0.5, "tsp")];
  if (t.includes("огурцы")) return [item("Огурцы", 800, "g"), item("Чеснок", 4, "pcs"), item("Укроп", 40, "g"), item("Соль", 1, "tbsp"), item("Сахар", 1, "tsp"), item("Вода", 500, "ml")];
  if (t.includes("паштет")) return [item("Куриная печень", 500, "g"), item("Яблоко", 1, "pcs"), item("Лук", 150, "g"), item("Сливочное масло", 120, "g"), item("Сливки", 100, "ml")];
  return [item("Основной продукт", 500, "g"), item("Лук", 150, "g"), item("Сметана", 120, "g"), item("Зелень", 25, "g"), item("Соль", 0.5, "tsp")];
}

function stepsFor(source, profile, ingredients) {
  const main = ingredients[0]?.name || "основной ингредиент";
  const second = ingredients[1]?.name || "дополнительные ингредиенты";
  if (profile.dishType === "soup") {
    return [
      step(`Подготовьте ${main.toLowerCase()} и ${second.toLowerCase()}: нарежьте всё похожими кусочками, чтобы вкус раскрывался равномерно. Ароматная основа важна для супа, потому что именно она задаёт глубину бульона.`),
      step("Прогрейте овощи или грибы в кастрюле до мягкости и лёгкого сладкого запаха. Если на дне появляется золотистый след, вкус получится насыщеннее, но не допускайте подгорания."),
      step("Влейте бульон или воду и доведите до спокойного кипения. Поверхность должна мягко двигаться, а не бурлить: так суп останется чистым по вкусу и текстуре."),
      step("Добавьте нежные ингредиенты ближе к концу и попробуйте соль. Готовое блюдо должно пахнуть свежо и полно, а овощи или крупа быть мягкими, но не распадаться."),
    ];
  }
  if (profile.course === "breakfast") {
    return [
      step(`Подготовьте ${main.toLowerCase()} и остальные ингредиенты заранее, чтобы завтрак готовился спокойно. Однородная основа помогает получить нежную текстуру без сухих комков.`),
      step("Смешайте базу до мягкой, влажной массы. Она должна держать форму, но не быть тяжёлой: если добавить слишком много сухих ингредиентов, блюдо получится плотным."),
      step("Готовьте на умеренном огне или запекайте до тёплого золотистого оттенка. Правильный ориентир — приятный сливочный аромат и мягкая середина без сырого привкуса."),
      step("Дайте блюду пару минут постоять перед подачей. За это время вкус выравнивается, а текстура становится более собранной и аккуратной."),
    ];
  }
  if (profile.dishType === "appetizer") {
    return [
      step(`Подготовьте ${main.toLowerCase()}: уберите лишнюю влагу и нарежьте или измельчите до удобной текстуры. Так закуска будет держать форму и не станет водянистой.`),
      step("Соедините основу с ароматными добавками постепенно, пробуя вкус после каждого шага. Соль, чеснок, зелень и кислинка должны поддерживать продукт, а не перекрывать его."),
      step("Доведите массу до нужной консистенции: крем должен быть гладким, булочки — мягкими, а овощи — хрустящими. Визуальный ориентир важнее спешки: поверхность должна выглядеть свежо и аккуратно."),
      step("Перед подачей охладите или дайте настояться, если это подходит блюду. За это время аромат станет ровнее, а вкус — более цельным."),
    ];
  }
  return [
    step(`Подготовьте ${main.toLowerCase()} и ${second.toLowerCase()}, нарезая ингредиенты равномерно. Так они приготовятся одновременно, а готовое блюдо будет выглядеть аккуратно.`),
    step("Соберите основу блюда и прогрейте её до появления явного аппетитного аромата. Лёгкая карамелизация, румяность или сливочная густота подскажут, что вкус начал раскрываться."),
    step("Доведите блюдо до готовности на умеренном огне или в духовке. Следите за текстурой: мясо должно стать мягким, крупа — рассыпчатой, овощи — нежными, но не водянистыми."),
    step("Проверьте соль и дайте блюду коротко отдохнуть перед подачей. Когда соки и соус распределятся, вкус станет спокойнее, а подача — чище."),
  ];
}

function step(text) {
  return { text, duration_minutes: null, image_url: null };
}

function descriptionFor(source, profile) {
  return `${source.title} — современное украинское блюдо, собранное вокруг узнаваемой домашней основы. ${source.description} Вкус строится на понятном контрасте: мягкая сердцевина или насыщенная база сочетается с кислинкой, сливочностью, травами или лёгкой румяностью. ${source.why} Поэтому рецепт хорошо работает в каталоге: он остаётся близким к традиции, но выглядит аккуратно, свежо и подходит для домашнего приготовления без ресторанной сложности.`;
}

function tipsFor(source) {
  return source.prep && source.prep !== "нет" ? `Заготовка: ${source.prep}. Делайте её отдельно и соединяйте с блюдом ближе к подаче, чтобы сохранить свежую текстуру.` : "Не спешите с сильным огнём: умеренное приготовление лучше раскрывает вкус простых украинских продуктов и помогает сохранить аккуратную текстуру.";
}

function servingFor(source, profile) {
  if (profile.dishType === "soup") return "Подавайте в тёплых глубоких тарелках, добавив зелень, сметану или ароматное масло по характеру блюда.";
  if (profile.course === "breakfast") return "Подавайте тёплым, с соусом или кремом отдельно, чтобы сохранить приятный контраст текстур.";
  if (profile.dishType === "appetizer") return "Подавайте небольшими порциями с ржаным хлебом, овощами или как дополнение к основному блюду.";
  return "Подавайте на подогретой тарелке, добавляя соус внизу или рядом, чтобы блюдо выглядело аккуратно и не размокало.";
}

function storageFor(source) {
  if (source.prep.includes("1 день")) return "Храните в холодильнике в закрытой ёмкости и используйте в течение 2–3 дней.";
  if (source.prep.includes("3–4")) return "Храните в холодильнике в закрытом контейнере 3–4 дня, набирая чистой ложкой.";
  return "Храните в холодильнике до 2 суток в закрытом контейнере. Соусы и хрустящие элементы лучше держать отдельно.";
}

function noteFor(source) {
  return `Причина включения в каталог: ${source.why}`;
}

function translationsFor(source, steps) {
  const result = {};
  for (const lang of LANGS) {
    result[lang] = {
      title: translateTitle(source.title, lang),
      description: translateDescription(source, lang),
      tips: translateGeneric("tips", lang),
      serving_tips: translateGeneric("serving", lang),
      storage_tips: translateGeneric("storage", lang),
      recipe_note: translateGeneric("note", lang),
      instructions: steps.map((s) => translateInstruction(s.text, lang)),
    };
  }
  return result;
}

function translateTitle(title, lang) {
  if (lang === "uk") return title.replace(/Сырники/g, "Сирники").replace(/вишнёвым/g, "вишневим").replace(/свёкл/g, "буряк").replace(/Гречка/g, "Гречка");
  return title;
}

function translateDescription(source, lang) {
  const title = translateTitle(source.title, lang);
  const map = {
    en: `${title} is a modern Ukrainian dish built around a familiar home-style base. It keeps the recognizable comfort of the original idea while adding a cleaner texture, balanced acidity, gentle creaminess, herbs, or a warm roasted note. The recipe is practical for home cooking and still feels fresh enough for a contemporary catalog.`,
    de: `${title} ist ein modernes ukrainisches Gericht auf einer vertrauten häuslichen Basis. Es bewahrt den wiedererkennbaren Charakter der Tradition und ergänzt ihn mit klarer Textur, ausgewogener Säure, milder Cremigkeit, Kräutern oder warmen Röstaromen. Das Rezept bleibt alltagstauglich und wirkt zugleich zeitgemäß.`,
    fr: `${title} est un plat ukrainien moderne construit autour d'une base familiale reconnaissable. Il garde le confort de la tradition tout en ajoutant une texture plus nette, une acidité équilibrée, une douceur crémeuse, des herbes ou une note rôtie. La recette reste accessible à la maison et assez actuelle pour un catalogue contemporain.`,
    it: `${title} è un piatto ucraino moderno costruito su una base casalinga riconoscibile. Conserva il carattere della tradizione e aggiunge una consistenza più pulita, acidità equilibrata, delicata cremosità, erbe o note arrostite. La ricetta è pratica da preparare in casa e adatta a un catalogo contemporaneo.`,
    es: `${title} es un plato ucraniano moderno construido sobre una base casera reconocible. Conserva la comodidad de la tradición y suma una textura más limpia, acidez equilibrada, cremosidad suave, hierbas o notas tostadas. La receta funciona bien en casa y se siente actual para un catálogo contemporáneo.`,
    "pt-BR": `${title} é um prato ucraniano moderno construído sobre uma base caseira reconhecível. Ele mantém o conforto da tradição e acrescenta textura mais limpa, acidez equilibrada, cremosidade suave, ervas ou notas assadas. A receita é prática para fazer em casa e atual para um catálogo contemporâneo.`,
    uk: `${title} — сучасна українська страва на знайомій домашній основі. Вона зберігає впізнаваний характер традиції та додає чистішу текстуру, збалансовану кислинку, м'яку кремовість, зелень або теплу запечену ноту. Рецепт зручний для дому й водночас виглядає сучасно.`,
  };
  return map[lang];
}

function translateGeneric(kind, lang) {
  const data = {
    en: {
      tips: "Prepare the make-ahead elements separately and combine them close to serving so the texture stays fresh.",
      serving: "Serve neatly with sauce or garnish added at the end to preserve contrast and a clean presentation.",
      storage: "Store refrigerated in an airtight container for up to 2 days; keep sauces and crisp elements separate when possible.",
      note: "This dish is included because it connects Ukrainian home cooking with a more contemporary serving style.",
    },
    de: {
      tips: "Bereiten Sie Komponenten zum Vorbereiten separat zu und fügen Sie sie erst kurz vor dem Servieren zusammen.",
      serving: "Sauber anrichten und Sauce oder Garnitur erst am Ende hinzufügen, damit Kontrast und Optik erhalten bleiben.",
      storage: "Bis zu 2 Tage luftdicht im Kühlschrank lagern; Saucen und knusprige Elemente möglichst getrennt halten.",
      note: "Dieses Gericht verbindet ukrainische Hausküche mit einer zeitgemäßeren Servierweise.",
    },
    fr: {
      tips: "Préparez les éléments à l'avance séparément et assemblez-les près du service pour garder une texture fraîche.",
      serving: "Servez proprement en ajoutant la sauce ou la garniture à la fin pour préserver le contraste.",
      storage: "Conservez au réfrigérateur dans une boîte hermétique jusqu'à 2 jours; gardez les sauces séparées si possible.",
      note: "Ce plat relie la cuisine familiale ukrainienne à une présentation plus contemporaine.",
    },
    it: {
      tips: "Preparate separatamente gli elementi anticipabili e uniteli vicino al servizio per mantenere la texture fresca.",
      serving: "Servite con ordine, aggiungendo salsa o guarnizione alla fine per conservare contrasto e pulizia visiva.",
      storage: "Conservate in frigorifero in un contenitore chiuso fino a 2 giorni; tenete separate salse ed elementi croccanti.",
      note: "Il piatto collega la cucina domestica ucraina a una presentazione più contemporanea.",
    },
    es: {
      tips: "Prepare los elementos adelantados por separado y únalos cerca del servicio para mantener la textura fresca.",
      serving: "Sirva con orden, añadiendo la salsa o guarnición al final para conservar el contraste.",
      storage: "Guarde en el refrigerador en un recipiente cerrado hasta 2 días; mantenga salsas y partes crujientes separadas.",
      note: "Este plato conecta la cocina casera ucraniana con una presentación más contemporánea.",
    },
    "pt-BR": {
      tips: "Prepare os elementos antecipáveis separadamente e junte perto de servir para manter a textura fresca.",
      serving: "Sirva com cuidado, adicionando molho ou finalização no fim para preservar contraste e aparência limpa.",
      storage: "Guarde na geladeira em recipiente fechado por até 2 dias; mantenha molhos e partes crocantes separados.",
      note: "O prato conecta a cozinha caseira ucraniana a uma apresentação mais contemporânea.",
    },
    uk: {
      tips: "Заготовки готуйте окремо й поєднуйте ближче до подачі, щоб зберегти свіжу текстуру.",
      serving: "Подавайте акуратно, додаючи соус або зелень наприкінці, щоб зберегти контраст і чистий вигляд.",
      storage: "Зберігайте в холодильнику в закритому контейнері до 2 діб; соуси й хрусткі елементи краще тримати окремо.",
      note: "Страва поєднує українську домашню кухню з сучаснішою подачею.",
    },
  };
  return data[lang][kind];
}

function translateInstruction(text, lang) {
  if (lang === "uk") return text.replace(/Подготовьте/g, "Підготуйте").replace(/Подавайте/g, "Подавайте").replace(/Готовьте/g, "Готуйте");
  return translateGeneric("tips", lang);
}

function nutritionFor(course, ingredients) {
  const hasMeat = ingredients.some((i) => /мяс|говяд|теля|ут|кур|лосос|скумбр|сало|печень|фарш/i.test(i.name));
  const hasDairy = ingredients.some((i) => /сыр|брынз|сметан|молок|масл|творог/i.test(i.name));
  const hasGrain = ingredients.some((i) => /греч|пш|мука|рис|перлов|картоф/i.test(i.name));
  const calories = course === "snack" ? 180 : hasMeat ? 560 : hasGrain ? 420 : 260;
  return {
    calories,
    protein: hasMeat ? 28 : hasDairy ? 16 : 9,
    fat: hasMeat ? 28 : hasDairy ? 18 : 10,
    carbs: hasGrain ? 48 : 24,
    fiber: hasGrain ? 6 : 4,
    sugar: hasDairy ? 6 : 5,
    salt: 0.9,
    saturated_fat: hasDairy ? 7 : 3,
    cholesterol: hasMeat || hasDairy ? 75 : 0,
    sodium: 360,
  };
}

function per100(n) {
  return {
    calories: Math.round(n.calories / 2.6),
    protein: round(n.protein / 2.6),
    fat: round(n.fat / 2.6),
    carbs: round(n.carbs / 2.6),
    fiber: round(n.fiber / 2.6),
    sugar: round(n.sugar / 2.6),
    salt: round(n.salt / 2.6),
    saturated_fat: round(n.saturated_fat / 2.6),
    cholesterol: Math.round(n.cholesterol / 2.6),
    sodium: Math.round(n.sodium / 2.6),
  };
}

function equipmentFor(title, isSoup) {
  if (isSoup) return ["pot", "chef knife", "cutting board", "ladle"];
  if (title.includes("вареник")) return ["mixing bowl", "rolling pin", "pot", "slotted spoon"];
  if (title.includes("запеч") || title.includes("пампуш")) return ["oven", "baking dish", "mixing bowl"];
  if (title.includes("соус") || title.includes("крем") || title.includes("намаз") || title.includes("хумус")) return ["mixing bowl", "blender", "chef knife"];
  return ["frying pan", "mixing bowl", "chef knife", "cutting board"];
}

function imagePrompt(source) {
  return `Use case: photorealistic-natural\nAsset type: recipe catalog food image, 4:3 aspect ratio\nPrimary request: Close-up 45-degree angle shot of homemade ${source.title}, realistic homemade presentation.\nScene/backdrop: cozy apartment kitchen mood with soft natural window light from the side; realistic shadows, natural colors, warm but not oversaturated.\nSubject: ${source.description} The dish must visibly match this exact recipe and look handmade, slightly imperfect, and appetizing.\nComposition: simple ceramic plate or bowl appropriate for the dish, dark textile napkin, heavy cutlery, one small relevant ingredient or sauce in the background. Shallow depth of field, Canon R6 50mm f/1.8 food blogger aesthetic, unstaged homemade food photography.\nNegative constraints: no glossy advertising style, no oversaturated colors, no plastic-looking food, no CGI, no fake steam, no luxury restaurant plating, no obvious AI-generated look, no excessive props, no studio photography, no text, no watermark.`;
}

function normalizeDifficulty(value) {
  if (value.toLowerCase().includes("лег")) return "easy";
  if (value.toLowerCase().includes("сред")) return "medium";
  return "medium";
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9іїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function round(value) {
  return Math.round(value * 10) / 10;
}
