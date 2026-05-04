import Link from 'next/link';
import { DEMO_HOOKS } from '@/lib/demo-data';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { Hook, Pattern } from '@/lib/types';
import { patternName } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ patterns: Pattern[]; hooks: Hook[]; isDemo: boolean }> {
  if (!hasSupabaseConfig()) {
    const names = Array.from(new Set(DEMO_HOOKS.map((h) => h.pattern_name)));
    return {
      patterns: names.map((name) => {
        const hs = DEMO_HOOKS.filter((h) => h.pattern_name === name);
        return {
          id: name,
          name,
          template: name === 'The Data Drop'
            ? 'We got [specific number] [things] in [timeframe].\n[N] stood out for [reason].'
            : '[Pattern hook]\n[Specific evidence]',
          description: 'Demo pattern cluster from Monte/Pixii style hooks.',
          example_count: hs.length,
          avg_engagement: Math.round(hs.reduce((s, h) => s + h.engagement_score, 0) / hs.length),
        };
      }),
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
      isDemo: true,
    };
  }

  const db = supabaseAdmin();
  const [{ data: patterns }, { data: hooks }] = await Promise.all([
    db.from('patterns').select('id, name, template, description, example_count, avg_engagement').order('avg_engagement', { ascending: false }),
    db.from('hooks').select('id, hook_text, raw_text, source, source_url, engagement_score, author_followers, virality_score, reasoning, pattern_id, scraped_at, patterns(name)').order('engagement_score', { ascending: false }).limit(120),
  ]);
  return { patterns: (patterns ?? []) as Pattern[], hooks: (hooks ?? []) as Hook[], isDemo: false };
}

function fmt(n?: number | null): string {
  if (!n) return '—';
  return Intl.NumberFormat('en', { notation: 'compact' }).format(n);
}

export default async function PatternsPage() {
  const { patterns, hooks, isDemo } = await getData();

  return (
    <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
      <header className="mb-10 max-w-4xl">
        <p className="mono mb-3 text-xs font-bold uppercase tracking-[0.24em] text-accent">Pattern library</p>
        <h1 className="display text-5xl font-black leading-none md:text-7xl">Seven hook structures Monte already uses.</h1>
        <p className="mt-5 text-lg leading-8 text-muted">
          Each cluster turns viral raw material into repeatable post templates. Pick one, then generate Pixii drafts from the Writer.
        </p>
        {isDemo && <p className="mt-4 text-sm font-semibold text-muted">Showing bundled demo hooks until Supabase is configured.</p>}
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        {patterns.map((pattern) => {
          const patternHooks = hooks.filter((h) => patternName(h) === pattern.name).slice(0, 3);
          return (
            <article key={pattern.id} className="rounded-[2rem] border hairline bg-card p-7 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="display text-3xl font-black">{pattern.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{pattern.description}</p>
                </div>
                <Link href={`/write?pattern=${encodeURIComponent(pattern.id)}`} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-black text-white hover:opacity-90">
                  Use
                </Link>
              </div>

              <div className="rounded-2xl bg-accent-light p-4">
                <div className="mono mb-2 text-[11px] font-black uppercase tracking-widest text-accent">Template</div>
                <pre className="whitespace-pre-wrap font-mono text-sm font-bold leading-6 text-ink">{pattern.template}</pre>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border hairline p-4">
                  <div className="ticker text-2xl font-black">{pattern.example_count}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">examples</div>
                </div>
                <div className="rounded-2xl border hairline p-4">
                  <div className="ticker text-2xl font-black">{pattern.avg_engagement > 0 ? fmt(pattern.avg_engagement) : '—'}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">avg engagement</div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {patternHooks.map((hook) => (
                  <div key={hook.id} className="rounded-2xl border hairline bg-bg/60 p-4">
                    <p className="hook-text text-sm font-black leading-6">{hook.hook_text}</p>
                    <p className="mt-2 text-xs font-semibold text-muted">{(hook.engagement_score || 0) > 0 ? `${fmt(hook.engagement_score)} engagement` : `${hook.source} • sourced via search`}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
