const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRecipes() {
  const testCuisineId = '94bba8c6-a9fc-46d5-8dbb-2ded0118f3f2';

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, cuisine_id')
    .eq('cuisine_id', testCuisineId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Найдено рецептов в тестовом каталоге: ${recipes.length}`);
  recipes.forEach(r => console.log(`  - ${r.title} (${r.id})`));
}

checkRecipes().then(() => process.exit(0));
