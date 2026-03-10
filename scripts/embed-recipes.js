/**
 * embed-recipes.js
 * Generates vector embeddings for all recipes using OpenAI text-embedding-3-small.
 * Run: node scripts/embed-recipes.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const BATCH_SIZE = 20; // embeddings API handles batches well

function buildEmbedText(recipe) {
  // Combine key fields into a single text for embedding
  const parts = [
    recipe.title,
    recipe.description,
    recipe.mood_tags?.length ? `Mood: ${recipe.mood_tags.join(', ')}` : '',
    recipe.diet_tags?.length ? `Diet: ${recipe.diet_tags.join(', ')}` : '',
    recipe.difficulty ? `Difficulty: ${recipe.difficulty}` : '',
    recipe.cook_time ? `Cook time: ${recipe.cook_time} min` : '',
  ].filter(Boolean);
  return parts.join('. ');
}

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.data.map((d) => d.embedding); // array of float[]
}

async function main() {
  console.log('🧠 Starting recipe embedding generation...\n');

  // Fetch recipes without embeddings
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, description, mood_tags, diet_tags, difficulty, cook_time')
    .is('embedding', null)
    .order('created_at', { ascending: true });

  if (error) { console.error('DB error:', error); process.exit(1); }
  if (!recipes || recipes.length === 0) {
    console.log('✅ All recipes already have embeddings.');
    return;
  }

  console.log(`📋 Found ${recipes.length} recipes to embed\n`);

  let done = 0;
  for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbedText);

    try {
      const embeddings = await embedBatch(texts);

      // Update each recipe with its embedding
      await Promise.all(
        batch.map((recipe, idx) =>
          supabase
            .from('recipes')
            .update({ embedding: embeddings[idx] })
            .eq('id', recipe.id)
        )
      );

      done += batch.length;
      console.log(`  [${done}/${recipes.length}] ✅ Batch embedded (${batch[0].title} … ${batch[batch.length - 1].title})`);
    } catch (err) {
      console.error(`  ❌ Batch failed:`, err.message);
    }

    // Pause between batches
    if (i + BATCH_SIZE < recipes.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n🎉 Done! Embedded ${done} recipes.`);
}

main().catch(console.error);
