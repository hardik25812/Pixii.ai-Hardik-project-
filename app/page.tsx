import Link from 'next/link';
import { DEMO_HOOKS } from '@/lib/demo-data';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { Hook, Pattern } from '@/lib/types';
import { patternName } from '@/lib/types';
import HomeClient from './home-client';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ hooks: Hook[]; patterns: Pattern[]; isDemo: boolean }> {
  if (!hasSupabaseConfig()) {
    const patterns = Array.from(new Set(DEMO_HOOKS.map((h) => h.pattern_name))).map((name) => ({
      id: name,
      name,
      template: '',
      description: 'Demo pattern',
      example_count: DEMO_HOOKS.filter((h) => h.pattern_name === name).length,
      avg_engagement: Math.round(
        DEMO_HOOKS.filter((h) => h.pattern_name === name).reduce((s, h) => s + h.engagement_score, 0) /
          DEMO_HOOKS.filter((h) => h.pattern_name === name).length
      ),
    }));
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
      patterns,
      isDemo: true,
    };
  }

  const db = supabaseAdmin();
  const [{ data: hooks }, { data: patterns }] = await Promise.all([
    db
      .from('hooks')
      .select('id, hook_text, raw_text, source, source_url, engagement_score, author_followers, virality_score, reasoning, pattern_id, scraped_at, patterns(name)')
      .order('engagement_score', { ascending: false })
      .limit(120),
    db
      .from('patterns')
      .select('id, name, template, description, example_count, avg_engagement')
      .order('avg_engagement', { ascending: false }),
  ]);

  return { hooks: (hooks ?? []) as Hook[], patterns: (patterns ?? []) as Pattern[], isDemo: false };
}

function fmt(n?: number | null): string {
  if (!n) return '—';
  return Intl.NumberFormat('en', { notation: 'compact' }).format(n);
}

function sourceLabel(s: string): string {
  if (s === 'reddit') return 'Reddit';
  if (s === 'twitter') return 'X / Twitter';
  if (s === 'linkedin') return 'LinkedIn';
  return s;
}

function sourceColor(s: string): string {
  if (s === 'reddit') return 'bg-orange-100 text-orange-700';
  if (s === 'twitter') return 'bg-sky-100 text-sky-700';
  if (s === 'linkedin') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

export default async function HomePage() {
  const { hooks, patterns, isDemo } = await getData();
  const hooksWithEngagement = hooks.filter((h) => (h.engagement_score || 0) > 0);
  const totalEngagement = hooksWithEngagement.reduce((s, h) => s + (h.engagement_score || 0), 0);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
      <header className="mb-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="mono mb-3 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Monday morning content machine
          </p>
          <h1 className="display max-w-4xl text-5xl font-black leading-[0.95] text-ink md:text-7xl">
            Mine the hooks before they become obvious.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            Crawl viral posts, extract the hook DNA, cluster the patterns, then write Pixii-branded LinkedIn drafts in Monte's voice.
          </p>
        </div>
        <div className="rounded-[2rem] border hairline bg-card p-6 shadow-sm">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="ticker text-3xl font-black text-ink">{hooks.length}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-muted">Hooks</div>
            </div>
            <div>
              <div className="ticker text-3xl font-black text-ink">{patterns.length}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-muted">Patterns</div>
            </div>
            <div>
              <div className="ticker text-3xl font-black text-accent">{totalEngagement > 0 ? fmt(totalEngagement) : '—'}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-muted">{totalEngagement > 0 ? 'Engagement' : 'Engagement'}</div>
            </div>
          </div>
          {isDemo && (
            <p className="mt-5 rounded-2xl bg-accent-light p-4 text-sm font-semibold text-ink">
              Demo mode: add Supabase env vars and run `/api/seed-demo` to persist 60 hooks.
            </p>
          )}
        </div>
      </header>

      <section className="mb-8">
        <HomeClient />
      </section>

      <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="display text-3xl font-black">The Mine</h2>
          <p className="mt-1 text-sm text-muted">Sorted by engagement. Weekly cron refreshes through `/api/mine`.</p>
        </div>
        <Link href="/write" className="rounded-full bg-accent px-5 py-3 text-sm font-black text-white shadow-sm hover:opacity-90">
          Write from these patterns
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hooks.map((hook) => (
          <article key={hook.id} className="group rounded-[1.75rem] border hairline bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-accent-light px-3 py-1 text-xs font-black uppercase tracking-wide text-accent">
                {patternName(hook)}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${sourceColor(hook.source)}`}>{sourceLabel(hook.source)}</span>
            </div>
            <p className="hook-text min-h-24 text-xl font-black leading-7 text-ink">{hook.hook_text}</p>
            <p className="mt-5 line-clamp-3 text-sm leading-6 text-muted">{hook.raw_text}</p>
            <div className="mt-6 flex items-end justify-between border-t hairline pt-4">
              {(hook.engagement_score || 0) > 0 ? (
                <div>
                  <div className="ticker text-2xl font-black text-ink">{fmt(hook.engagement_score)}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">engagement</div>
                </div>
              ) : (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">sourced via search</div>
                </div>
              )}
              <div className="max-w-[52%] text-right text-xs font-semibold leading-5 text-muted">
                {hook.reasoning}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
