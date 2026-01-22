const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🔧 Применение миграции для автоматического связывания рецептов с каталогами...\n');

  try {
    // Читаем SQL файл миграции
    const migrationPath = path.join(__dirname, '../../Database/migrations/auto_link_user_recipes_to_catalog.sql');

    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Файл миграции не найден:', migrationPath);
      return false;
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Выполнение SQL миграции через Supabase Dashboard...\n');
    console.log('⚠️  ВНИМАНИЕ: Автоматическое выполнение SQL через API может не поддерживаться.');
    console.log('📌 Пожалуйста, выполните следующие шаги вручную:\n');
    console.log('   1. Откройте Supabase Dashboard → SQL Editor');
    console.log('   2. Создайте новый запрос');
    console.log('   3. Скопируйте содержимое файла:');
    console.log('      Database/migrations/auto_link_user_recipes_to_catalog.sql');
    console.log('   4. Выполните SQL запрос\n');

    return true;
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    return false;
  }
}

async function fixExistingRecipes() {
  console.log('🔍 Поиск существующих рецептов без cuisine_id...\n');

  try {
    // Находим все пользовательские рецепты без cuisine_id
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, owner_id, title, is_user_defined')
      .eq('is_user_defined', true)
      .is('cuisine_id', null)
      .not('owner_id', 'is', null);

    if (recipesError) {
      console.error('❌ Ошибка при поиске рецептов:', recipesError.message);
      return;
    }

    if (!recipes || recipes.length === 0) {
      console.log('✅ Все пользовательские рецепты уже связаны с каталогами\n');
      return;
    }

    console.log(`📊 Найдено ${recipes.length} рецептов без cuisine_id\n`);

    // Группируем рецепты по пользователям
    const recipesByUser = {};
    recipes.forEach(recipe => {
      if (!recipesByUser[recipe.owner_id]) {
        recipesByUser[recipe.owner_id] = [];
      }
      recipesByUser[recipe.owner_id].push(recipe);
    });

    // Обрабатываем каждого пользователя
    for (const [ownerId, userRecipes] of Object.entries(recipesByUser)) {
      console.log(`👤 Пользователь ${ownerId.slice(0, 8)}... (${userRecipes.length} рецептов)`);

      // Ищем или создаем каталог "Мои рецепты"
      let { data: existingCuisine } = await supabase
        .from('cuisines')
        .select('id, status')
        .eq('owner_id', ownerId)
        .eq('is_user_generated', true)
        .eq('name', 'Мои рецепты')
        .single();

      let cuisineId;

      if (existingCuisine) {
        cuisineId = existingCuisine.id;
        console.log(`   ✓ Найден существующий каталог: ${cuisineId.slice(0, 8)}...`);

        // Убеждаемся, что статус active
        if (existingCuisine.status !== 'active') {
          await supabase
            .from('cuisines')
            .update({ status: 'active' })
            .eq('id', cuisineId);
          console.log(`   ✓ Статус каталога изменен на 'active'`);
        }
      } else {
        // Создаем новый каталог
        const { data: newCuisine, error: cuisineError } = await supabase
          .from('cuisines')
          .insert({
            name: 'Мои рецепты',
            owner_id: ownerId,
            is_user_generated: true,
            status: 'active',
            image_url: null,
          })
          .select('id')
          .single();

        if (cuisineError) {
          console.error(`   ❌ Ошибка при создании каталога:`, cuisineError.message);
          continue;
        }

        cuisineId = newCuisine.id;
        console.log(`   ✓ Создан новый каталог: ${cuisineId.slice(0, 8)}...`);
      }

      // Обновляем все рецепты пользователя
      const recipeIds = userRecipes.map(r => r.id);
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ cuisine_id: cuisineId })
        .in('id', recipeIds);

      if (updateError) {
        console.error(`   ❌ Ошибка при обновлении рецептов:`, updateError.message);
      } else {
        console.log(`   ✓ Обновлено ${recipeIds.length} рецептов\n`);
      }
    }

    console.log('✅ Все существующие рецепты обработаны\n');
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

async function main() {
  console.log('🚀 Установка автоматического связывания рецептов с каталогами\n');
  console.log('═'.repeat(60) + '\n');

  // Шаг 1: Применяем миграцию (инструкции)
  await applyMigration();

  console.log('═'.repeat(60) + '\n');

  // Шаг 2: Исправляем существующие рецепты
  await fixExistingRecipes();

  console.log('═'.repeat(60) + '\n');
  console.log('✨ Готово!\n');
  console.log('После выполнения SQL миграции в Dashboard:');
  console.log('• Все новые пользовательские рецепты будут автоматически связываться с каталогом');
  console.log('• Каталог "Мои рецепты" будет создаваться автоматически при необходимости');
  console.log('• Статус каталога всегда будет "active"\n');
}

main()
  .then(() => {
    console.log('🎉 Скрипт завершен');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
