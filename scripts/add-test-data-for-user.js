const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addTestData() {
  console.log('📝 Добавляем тестовые данные для демонстрации...\n');

  // Получаем первого пользователя
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .limit(1)
    .single();

  if (!profiles) {
    console.log('❌ Нет пользователей в базе');
    return;
  }

  const userId = profiles.id;
  console.log(`👤 Пользователь: ${profiles.name || 'Без имени'}`);
  console.log(`   ID: ${userId}\n`);

  // Создаем 2 тестовых каталога
  const { data: cuisines } = await supabase
    .from('cuisines')
    .insert([
      {
        name: '🏠 Мои домашние рецепты',
        description: 'Тестовый каталог пользователя',
        status: 'hidden',
        is_user_generated: true,
        owner_id: userId
      },
      {
        name: '🎄 Новогодние рецепты',
        description: 'Праздничная коллекция',
        status: 'hidden',
        is_user_generated: true,
        owner_id: userId
      }
    ])
    .select();

  console.log(`✅ Создано каталогов: ${cuisines?.length || 0}\n`);

  // Получаем несколько рецептов для избранного
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id')
    .limit(3);

  if (recipes && recipes.length > 0) {
    // Добавляем в избранное
    const { data: favorites } = await supabase
      .from('favorites')
      .insert(
        recipes.map(recipe => ({
          user_id: userId,
          recipe_id: recipe.id
        }))
      )
      .select();

    console.log(`✅ Добавлено в избранное: ${favorites?.length || 0} рецептов\n`);
  }

  console.log('🎉 Готово! Теперь обновите страницу /users');
}

addTestData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
