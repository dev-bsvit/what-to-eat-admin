/**
 * tag-recipes.js
 * Assigns mood_tags to all recipes using GPT-4o-mini.
 * Run: node scripts/tag-recipes.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const BATCH_SIZE = 10; // parallel GPT calls per batch
const MOOD_TAGS = ['light', 'hearty', 'junk', 'usual'];

const SYSTEM_PROMPT = `You are a food categorization assistant.
Given a recipe, assign one or more mood tags from this fixed list: light, hearty, junk, usual.

Rules:
- light: salads, soups, vegetables, fish, low-calorie, healthy dishes
- hearty: meat dishes, pasta, stews, filling meals, high-protein
- junk: burgers, pizza, fries, fast food, fried snacks, comfort junk food
- usual: everyday simple dishes that don't fit other categories

Return ONLY a JSON array of tags, e.g.: ["light"] or ["hearty"] or ["junk","usual"]
No explanation, no markdown, just the JSON array.`;

async function classifyRecipe(recipe) {
  const userMsg = `Recipe: ${recipe.title}\nDescription: ${recipe.description || 'none'}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 30,
      temperature: 0,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() ?? '["usual"]';

  try {
    const tags = JSON.parse(raw);
    // Validate — keep only known tags
    return tags.filter((t) => MOOD_TAGS.includes(t));
  } catch {
    console.warn(`  ⚠️  Could not parse tags for "${recipe.title}": ${raw}`);
    return ['usual'];
  }
}

async function main() {
  console.log('🏷️  Starting recipe auto-tagging...\n');

  // Fetch recipes without mood_tags
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, description')
    .or('mood_tags.is.null,mood_tags.eq.{}')
    .order('created_at', { ascending: true });

  if (error) { console.error('DB error:', error); process.exit(1); }
  if (!recipes || recipes.length === 0) {
    console.log('✅ All recipes already tagged.');
    return;
  }

  console.log(`📋 Found ${recipes.length} recipes to tag\n`);

  let done = 0;
  for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (recipe) => {
        const tags = await classifyRecipe(recipe);
        await supabase.from('recipes').update({ mood_tags: tags }).eq('id', recipe.id);
        return { title: recipe.title, tags };
      })
    );

    for (const r of results) {
      done++;
      if (r.status === 'fulfilled') {
        console.log(`  [${done}/${recipes.length}] ✅ ${r.value.title} → [${r.value.tags.join(', ')}]`);
      } else {
        console.log(`  [${done}/${recipes.length}] ❌ Error: ${r.reason}`);
      }
    }

    // Small pause between batches to avoid rate limits
    if (i + BATCH_SIZE < recipes.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n🎉 Done! Tagged ${done} recipes.`);
}

main().catch(console.error);
