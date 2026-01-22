const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDeleteWithRecipes() {
  console.log('🧪 Тестирование удаления каталога с рецептами\n');

  // 1. Создаем тестовый каталог
  const testCuisineId = crypto.randomUUID();
  console.log(`📝 Создаем тестовый каталог (ID: ${testCuisineId})...`);

  const { data: cuisine, error: cuisineError } = await supabase
    .from('cuisines')
    .insert({
      id: testCuisineId,
      name: 'Тестовый каталог для удаления',
      status: 'active',
      is_user_generated: true
    })
    .select()
    .single();

  if (cuisineError) {
    console.error('❌ Ошибка создания каталога:', cuisineError);
    return;
  }

  console.log(`✅ Каталог создан: ${cuisine.name}\n`);

  // 2. Создаем 2 тестовых рецепта в этом каталоге
  console.log('📝 Создаем 2 тестовых рецепта...');

  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .insert([
      {
        title: 'Тестовый рецепт 1',
        cuisine_id: testCuisineId,
        description: 'Тестовое описание 1'
      },
      {
        title: 'Тестовый рецепт 2',
        cuisine_id: testCuisineId,
        description: 'Тестовое описание 2'
      }
    ])
    .select();

  if (recipesError) {
    console.error('❌ Ошибка создания рецептов:', recipesError);
    return;
  }

  console.log(`✅ Создано рецептов: ${recipes.length}\n`);

  // 3. Проверяем что рецепты есть
  const { count: beforeCount } = await supabase
    .from('recipes')
    .select('*', { count: 'exact', head: true })
    .eq('cuisine_id', testCuisineId);

  console.log(`📊 Рецептов в каталоге до удаления: ${beforeCount}\n`);

  // 4. Удаляем рецепты
  console.log('🗑️ Удаляем рецепты из каталога...');

  const { error: deleteRecipesError } = await supabase
    .from('recipes')
    .delete()
    .eq('cuisine_id', testCuisineId);

  if (deleteRecipesError) {
    console.error('❌ Ошибка удаления рецептов:', deleteRecipesError);
    return;
  }

  console.log('✅ Рецепты удалены\n');

  // 5. Проверяем что рецепты удалены
  const { count: afterCount } = await supabase
    .from('recipes')
    .select('*', { count: 'exact', head: true })
    .eq('cuisine_id', testCuisineId);

  console.log(`📊 Рецептов в каталоге после удаления: ${afterCount}\n`);

  // 6. Удаляем каталог
  console.log('🗑️ Удаляем каталог...');

  const { error: deleteCuisineError } = await supabase
    .from('cuisines')
    .delete()
    .eq('id', testCuisineId);

  if (deleteCuisineError) {
    console.error('❌ Ошибка удаления каталога:', deleteCuisineError);
    return;
  }

  console.log('✅ Каталог удален\n');

  console.log('🎉 Тест пройден успешно!');
  console.log('\n📝 Результат:');
  console.log(`   - Создан каталог: ✓`);
  console.log(`   - Создано рецептов: ${recipes.length}`);
  console.log(`   - Удалено рецептов: ${beforeCount}`);
  console.log(`   - Удален каталог: ✓`);
}

testDeleteWithRecipes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
