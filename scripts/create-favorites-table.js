const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createFavoritesTable() {
  console.log('📝 Создание таблицы favorites...\n');

  // Читаем SQL файл миграции
  const migrationPath = path.join(__dirname, '../../Database/migrations/create_favorites_table.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  try {
    // Выполняем миграцию
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // Если RPC не работает, пробуем выполнить напрямую через REST API
      console.log('⚠️  RPC не доступен, пытаемся выполнить через прямой запрос...\n');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: migrationSQL })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      console.log('✅ Таблица favorites успешно создана через REST API');
    } else {
      console.log('✅ Таблица favorites успешно создана через RPC');
    }

    // Проверяем, что таблица создана
    const { data: tables, error: checkError } = await supabase
      .from('favorites')
      .select('*')
      .limit(1);

    if (checkError) {
      if (checkError.message.includes('schema cache')) {
        console.log('\n⚠️  Таблица создана, но не видна в schema cache.');
        console.log('📌 Решение: Выполните SQL миграцию вручную в Supabase Dashboard:');
        console.log('   1. Откройте Supabase Dashboard → SQL Editor');
        console.log('   2. Скопируйте содержимое файла: Database/migrations/create_favorites_table.sql');
        console.log('   3. Выполните SQL запрос\n');
      } else {
        console.error('❌ Ошибка при проверке таблицы:', checkError.message);
      }
    } else {
      console.log('✅ Таблица favorites доступна и готова к использованию');
      console.log(`   Текущее количество записей: ${tables?.length || 0}\n`);
    }

  } catch (err) {
    console.error('❌ Ошибка при выполнении миграции:', err.message);
    console.log('\n📌 Решение: Выполните SQL миграцию вручную в Supabase Dashboard:');
    console.log('   1. Откройте Supabase Dashboard → SQL Editor');
    console.log('   2. Скопируйте содержимое файла: Database/migrations/create_favorites_table.sql');
    console.log('   3. Выполните SQL запрос\n');
  }
}

createFavoritesTable()
  .then(() => {
    console.log('🎉 Готово!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
