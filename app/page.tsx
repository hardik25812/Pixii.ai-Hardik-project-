import { DEMO_HOOKS } from '@/lib/demo-data';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { Hook, Pattern } from '@/lib/types';
import HomeClient from './home-client';

export const dynamic = 'force-dynamic';

function fmt(n?: number | null): string {
  if (!n) return '—';
  return Intl.NumberFormat('en', { notation: 'compact' }).format(n);
}

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

  const seen = new Set<string>();
  const uniqueHooks = (hooks ?? []).filter((hook) => {
    const key = hook.source_url || hook.hook_text;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { hooks: uniqueHooks as Hook[], patterns: (patterns ?? []) as Pattern[], isDemo: false };
}

export default async function HomePage() {
  const { hooks, patterns, isDemo } = await getData();
  const hooksWithEngagement = hooks.filter((h) => (h.engagement_score || 0) > 0);
  const totalEngagement = hooksWithEngagement.reduce((s, h) => s + (h.engagement_score || 0), 0);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-16 pt-4">
      <header className="hero-stage mb-10 overflow-hidden rounded-[2.5rem] border border-white/70 bg-white/55 p-4 shadow-[0_30px_90px_rgba(26,22,20,0.12)] backdrop-blur-2xl md:p-6">
        <div className="hero-door hero-door-left" />
        <div className="hero-door hero-door-right" />
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#8B5CF6]/20 blur-3xl" />
        <div className="relative grid min-h-[480px] gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hero-panel-left flex flex-col justify-between rounded-[2rem] bg-ink p-7 text-white shadow-2xl md:p-10">
            <div>
              <h1 className="display max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.05em] md:text-7xl">
                Welcome to the hook engine that sees momentum first.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
                Crawl viral posts, extract the hook DNA, cluster winning patterns, then turn them into Pixii-branded LinkedIn drafts in Monte&apos;s voice.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <a href="#mine" className="rounded-full bg-accent px-6 py-4 text-center text-sm font-black text-white shadow-[0_18px_40px_rgba(255,92,0,0.35)] transition hover:-translate-y-0.5">
                Start mining hooks
              </a>
              <a href="/write" className="rounded-full border border-white/15 bg-white/10 px-6 py-4 text-center text-sm font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15">
                Write a post
              </a>
            </div>
          </section>
          <section className="hero-panel-right relative rounded-[2rem] border border-white/70 bg-[#fffaf4]/80 p-6 shadow-xl backdrop-blur-xl md:p-8">
            <div className="absolute right-8 top-8 rounded-full bg-ink px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white">
              Live mine
            </div>
            <div className="mt-10 rounded-[1.75rem] border hairline bg-card/90 p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="mono text-xs font-bold uppercase tracking-[0.24em] text-accent">
                    Signal dashboard
                  </p>
                  <h2 className="mt-2 display text-3xl font-black leading-none text-ink">
                    Pattern radar
                  </h2>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-light text-xl font-black text-accent">
                  Px
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-bg p-4">
                  <div className="ticker text-3xl font-black text-ink">{hooks.length}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">Hooks</div>
                </div>
                <div className="rounded-2xl bg-bg p-4">
                  <div className="ticker text-3xl font-black text-ink">{patterns.length}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">Patterns</div>
                </div>
                <div className="rounded-2xl bg-accent text-white p-4 shadow-[0_18px_40px_rgba(255,92,0,0.25)]">
                  <div className="ticker text-3xl font-black">{totalEngagement > 0 ? fmt(totalEngagement) : '—'}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/75">Engagement</div>
                </div>
              </div>
              {isDemo && (
                <p className="mt-5 rounded-2xl bg-accent-light p-4 text-sm font-semibold text-ink">
                  Demo mode: add Supabase env vars and run <code>/api/seed-demo</code> to persist hooks.
                </p>
              )}
            </div>
          </section>
        </div>
      </header>

      <section id="mine" className="mb-8 scroll-mt-8">
        <HomeClient initialHooks={hooks} />
      </section>
    </main>
  );
}
