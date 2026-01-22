// Тестирование парсера на международных сайтах рецептов

const testRecipes = [
  // США
  {
    country: "🇺🇸 США",
    site: "AllRecipes",
    url: "https://www.allrecipes.com/recipe/12682/apple-pie-by-grandma-ople/"
  },
  {
    country: "🇺🇸 США",
    site: "Food Network",
    url: "https://www.foodnetwork.com/recipes/alton-brown/good-eats-roast-turkey-recipe-1950271"
  },
  {
    country: "🇺🇸 США",
    site: "Bon Appétit",
    url: "https://www.bonappetit.com/recipe/chocolate-chip-cookies"
  },

  // Германия
  {
    country: "🇩🇪 Германия",
    site: "Chefkoch.de",
    url: "https://www.chefkoch.de/rezepte/1/1.html"
  },
  {
    country: "🇩🇪 Германия",
    site: "Lecker.de",
    url: "https://www.lecker.de/schweinebraten-mit-knuspriger-kruste-68649.html"
  },

  // Италия
  {
    country: "🇮🇹 Италия",
    site: "GialloZafferano",
    url: "https://www.giallozafferano.com/recipes/Carbonara.html"
  },

  // Франция
  {
    country: "🇫🇷 Франция",
    site: "Marmiton",
    url: "https://www.marmiton.org/recettes/recette_poulet-roti-au-four_31396.aspx"
  },
  {
    country: "🇫🇷 Франция",
    site: "750g",
    url: "https://www.750g.com/quiche-lorraine-r12502.htm"
  },

  // Испания
  {
    country: "🇪🇸 Испания",
    site: "RecetasGratis",
    url: "https://www.recetasgratis.net/receta-de-paella-valenciana-35829.html"
  },

  // Россия
  {
    country: "🇷🇺 Россия",
    site: "iamcook.ru",
    url: "https://www.iamcook.ru/showrecipe/3327"
  }
];

async function testParser(recipe) {
  try {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`${recipe.country} | ${recipe.site}`);
    console.log(`URL: ${recipe.url}`);
    console.log("=".repeat(80));

    const response = await fetch("http://localhost:3000/api/import-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: recipe.url })
    });

    const data = await response.json();

    if (response.ok) {
      const r = data.recipe;
      console.log(`✅ SUCCESS - Method: ${data.meta.method}`);
      console.log(`   Title: ${r.title}`);
      console.log(`   Ingredients: ${r.ingredients.length} items`);
      console.log(`   Steps: ${r.steps.length} items`);
      console.log(`   Confidence: ${r.confidence}`);

      if (r.ingredients.length > 0) {
        console.log(`   Sample ingredient: ${r.ingredients[0].name}`);
      }
      if (r.steps.length > 0) {
        console.log(`   First step: ${r.steps[0].text.substring(0, 60)}...`);
      }

      return {
        success: true,
        country: recipe.country,
        site: recipe.site,
        method: data.meta.method,
        ingredientsCount: r.ingredients.length,
        stepsCount: r.steps.length,
        confidence: r.confidence
      };
    } else {
      console.log(`❌ FAILED - ${data.error}: ${data.message}`);
      return {
        success: false,
        country: recipe.country,
        site: recipe.site,
        error: data.error
      };
    }
  } catch (error) {
    console.log(`❌ ERROR - ${error.message}`);
    return {
      success: false,
      country: recipe.country,
      site: recipe.site,
      error: error.message
    };
  }
}

async function runTests() {
  console.log("\n🧪 ТЕСТИРОВАНИЕ МЕЖДУНАРОДНОГО ПАРСЕРА РЕЦЕПТОВ\n");
  console.log(`Всего тестов: ${testRecipes.length}\n`);

  const results = [];

  for (const recipe of testRecipes) {
    const result = await testParser(recipe);
    results.push(result);
    // Пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Итоговая статистика
  console.log("\n" + "=".repeat(80));
  console.log("📊 ИТОГОВАЯ СТАТИСТИКА");
  console.log("=".repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Успешно: ${successful.length}/${results.length}`);
  console.log(`❌ Провалено: ${failed.length}/${results.length}`);
  console.log(`📈 Success Rate: ${((successful.length / results.length) * 100).toFixed(1)}%\n`);

  if (successful.length > 0) {
    console.log("Успешные парсинги:");
    successful.forEach(r => {
      console.log(`  ${r.country} ${r.site} - ${r.method} (${r.ingredientsCount} ингр, ${r.stepsCount} шагов, ${r.confidence})`);
    });
  }

  if (failed.length > 0) {
    console.log("\nПроваленные парсинги:");
    failed.forEach(r => {
      console.log(`  ${r.country} ${r.site} - ${r.error}`);
    });
  }

  console.log("\n" + "=".repeat(80));
}

runTests().catch(console.error);
