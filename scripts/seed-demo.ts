import { DEMO_HOOKS } from '../lib/demo-data';
import { supabaseAdmin } from '../lib/supabase';

async function main() {
  const db = supabaseAdmin();
  const { data: patterns, error: patternsError } = await db
    .from('patterns')
    .select('id, name');

  if (patternsError) throw patternsError;
  if (!patterns?.length) throw new Error('No patterns found. Run supabase/schema.sql first.');

  const patternMap = Object.fromEntries(patterns.map((p: any) => [p.name, p.id]));

  await db.from('hooks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const rows = DEMO_HOOKS.map((h) => ({
    raw_text: h.raw_text,
    hook_text: h.hook_text,
    pattern_id: patternMap[h.pattern_name] ?? null,
    source: h.source,
    source_url: h.source_url,
    engagement_score: h.engagement_score,
    author_followers: h.author_followers,
    reasoning: h.reasoning,
  }));

  const { error } = await db.from('hooks').insert(rows);
  if (error) throw error;

  for (const p of patterns) {
    const { data: stats } = await db
      .from('hooks')
      .select('engagement_score')
      .eq('pattern_id', p.id);
    const count = stats?.length ?? 0;
    const avg = count ? stats!.reduce((s: number, r: any) => s + (r.engagement_score || 0), 0) / count : 0;
    await db.from('patterns').update({ example_count: count, avg_engagement: avg }).eq('id', p.id);
  }

  console.log(`Seeded ${rows.length} demo hooks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
