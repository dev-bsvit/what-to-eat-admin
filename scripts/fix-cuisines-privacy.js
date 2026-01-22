const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixCuisinesPrivacy() {
  console.log('🔍 Checking user-generated cuisines...\n');

  // 1. Получаем все пользовательские каталоги
  const { data: cuisines, error: fetchError } = await supabase
    .from('cuisines')
    .select('id, name, status, owner_id, is_user_generated')
    .eq('is_user_generated', true);

  if (fetchError) {
    console.error('❌ Error fetching cuisines:', fetchError);
    return;
  }

  console.log(`📊 Found ${cuisines.length} user-generated cuisines:\n`);
  cuisines.forEach((c) => {
    console.log(`  - ${c.name} (${c.status}) - Owner: ${c.owner_id?.substring(0, 8)}...`);
  });

  // 2. Фильтруем те, что имеют статус 'active'
  const activeCuisines = cuisines.filter((c) => c.status === 'active');

  if (activeCuisines.length === 0) {
    console.log('\n✅ All user cuisines already have "hidden" status!');
    return;
  }

  console.log(`\n🔄 Updating ${activeCuisines.length} cuisines to "hidden" status...\n`);

  // 3. Обновляем статус на 'hidden'
  const { data: updated, error: updateError } = await supabase
    .from('cuisines')
    .update({
      status: 'hidden',
      updated_at: new Date().toISOString()
    })
    .eq('is_user_generated', true)
    .eq('status', 'active')
    .not('owner_id', 'is', null)
    .select();

  if (updateError) {
    console.error('❌ Error updating cuisines:', updateError);
    return;
  }

  console.log(`✅ Successfully updated ${updated.length} cuisines!\n`);

  updated.forEach((c) => {
    console.log(`  ✓ ${c.name} - now HIDDEN (only visible to owner)`);
  });

  console.log('\n🎉 Migration completed!');
  console.log('\n📝 Summary:');
  console.log(`   - Cuisines with "active" status (visible to all): ${cuisines.filter(c => c.status === 'active').length - updated.length}`);
  console.log(`   - Cuisines with "hidden" status (owner only): ${cuisines.filter(c => c.status === 'hidden').length + updated.length}`);
}

fixCuisinesPrivacy()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
