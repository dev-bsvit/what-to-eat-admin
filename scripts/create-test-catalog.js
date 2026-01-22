const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestCatalog() {
  const testCuisineId = crypto.randomUUID();

  console.log('📝 Создаем тестовый каталог с рецептами для проверки UI...\n');

  // Создаем каталог
  const { data: cuisine, error: cuisineError } = await supabase
    .from('cuisines')
    .insert({
      id: testCuisineId,
      name: '🧪 ТЕСТ: Удалите меня',
      description: 'Тестовый каталог с рецептами для проверки удаления',
      status: 'active',
      is_user_generated: true
    })
    .select()
    .single();

  if (cuisineError) {
    console.error('❌ Ошибка:', cuisineError);
    return;
  }

  console.log(`✅ Создан каталог: ${cuisine.name}`);
  console.log(`   ID: ${testCuisineId}\n`);

  // Создаем 3 рецепта
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .insert([
      {
        title: '🧪 Тестовый рецепт 1',
        cuisine_id: testCuisineId,
        description: 'Будет удален вместе с каталогом',
        cook_time: 30
      },
      {
        title: '🧪 Тестовый рецепт 2',
        cuisine_id: testCuisineId,
        description: 'Будет удален вместе с каталогом',
        cook_time: 45
      },
      {
        title: '🧪 Тестовый рецепт 3',
        cuisine_id: testCuisineId,
        description: 'Будет удален вместе с каталогом',
        cook_time: 60
      }
    ])
    .select();

  if (recipesError) {
    console.error('❌ Ошибка:', recipesError);
    return;
  }

  console.log(`✅ Создано рецептов: ${recipes.length}\n`);

  console.log('🎯 Теперь откройте http://localhost:3000/catalogs');
  console.log('   и попробуйте удалить каталог "🧪 ТЕСТ: Удалите меня"');
  console.log('   Должно появиться сообщение о 3 рецептах!');
}

createTestCatalog()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
