const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFavoritesTable() {
  console.log('🔍 Проверка таблицы favorites...\n');

  try {
    // Попытка получить данные из таблицы
    const { data, error, count } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    if (error) {
      console.error('❌ Ошибка при доступе к таблице favorites:');
      console.error('   Код:', error.code);
      console.error('   Сообщение:', error.message);
      console.error('   Детали:', error.details);
      console.error('   Подсказка:', error.hint);

      if (error.message.includes('schema cache') || error.code === '42P01' || error.code === 'PGRST202') {
        console.log('\n📌 Таблица favorites НЕ СУЩЕСТВУЕТ в базе данных');
        console.log('   Необходимо создать таблицу вручную в Supabase Dashboard\n');
      }
      return false;
    }

    console.log('✅ Таблица favorites СУЩЕСТВУЕТ и доступна!');
    console.log(`   Всего записей: ${count || 0}`);

    if (data && data.length > 0) {
      console.log(`   Найдено записей (первые 5): ${data.length}\n`);
      data.forEach((fav, idx) => {
        console.log(`   ${idx + 1}. user_id: ${fav.user_id?.slice(0, 8)}...`);
        console.log(`      recipe_id: ${fav.recipe_id?.slice(0, 8)}...`);
        console.log(`      created_at: ${fav.created_at}\n`);
      });
    } else {
      console.log('   Таблица пустая (нет записей)\n');
    }

    return true;
  } catch (err) {
    console.error('❌ Неожиданная ошибка:', err.message);
    return false;
  }
}

async function checkUserFavorites(userId) {
  console.log(`\n🔍 Проверка избранного для пользователя ${userId.slice(0, 8)}...\n`);

  try {
    const { data, error, count } = await supabase
      .from('favorites')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Ошибка:', error.message);
      return;
    }

    console.log(`✅ Найдено записей в избранном: ${count || 0}`);

    if (data && data.length > 0) {
      data.forEach((fav, idx) => {
        console.log(`   ${idx + 1}. recipe_id: ${fav.recipe_id}`);
        console.log(`      created_at: ${fav.created_at}\n`);
      });
    }
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

async function main() {
  const tableExists = await checkFavoritesTable();

  if (tableExists) {
    // Проверяем избранное конкретного пользователя
    const userId = 'b95a5a32-5e81-45c0-9a75-882a9cceb3b8';
    await checkUserFavorites(userId);
  } else {
    console.log('\n📋 Инструкция по созданию таблицы:');
    console.log('   1. Откройте Supabase Dashboard → SQL Editor');
    console.log('   2. Выполните SQL из файла: Database/migrations/create_favorites_table.sql');
    console.log('   3. Перезапустите эту проверку\n');
  }
}

main()
  .then(() => {
    console.log('🎉 Проверка завершена');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
