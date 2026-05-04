import { DEMO_HOOKS } from '@/lib/demo-data';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { Hook } from '@/lib/types';
import HomeClient from './home-client';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ hooks: Hook[] }> {
  if (!hasSupabaseConfig()) {
    return {
      hooks: DEMO_HOOKS.map((h, i) => ({
        id: `demo-${i}`,
        hook_text: h.hook_text,
        raw_text: h.raw_text,
        source: h.source,
        source_url: h.source_url,
        engagement_score: h.engagement_score,
        author_followers: h.author_followers,
        virality_score: h.engagement_score / h.author_followers,
        reasoning: h.reasoning,
        pattern_id: h.pattern_name,
        scraped_at: new Date().toISOString(),
        patterns: { name: h.pattern_name },
      })),
    };
  }

  const db = supabaseAdmin();
  const { data: hooks } = await db
    .from('hooks')
    .select('id, hook_text, raw_text, source, source_url, engagement_score, author_followers, virality_score, reasoning, pattern_id, scraped_at, patterns(name)')
    .order('engagement_score', { ascending: false })
    .limit(120);

  const seen = new Set<string>();
  const uniqueHooks = (hooks ?? []).filter((hook) => {
    const key = hook.source_url || hook.hook_text;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { hooks: uniqueHooks as Hook[] };
}

export default async function HomePage() {
  const { hooks } = await getData();

  return (
    <main className="mx-auto max-w-7xl px-6 pb-16 pt-4">
      <section id="mine" className="mb-8 scroll-mt-8">
        <HomeClient initialHooks={hooks} />
      </section>
    </main>
  );
}
