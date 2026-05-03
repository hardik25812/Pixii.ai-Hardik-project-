import { DEMO_HOOKS } from '@/lib/demo-data';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { Pattern } from '@/lib/types';
import WriterClient from './writer-client';

export const dynamic = 'force-dynamic';

async function getPatterns(): Promise<{ patterns: Pattern[]; isDemo: boolean }> {
  if (!hasSupabaseConfig()) {
    const names = Array.from(new Set(DEMO_HOOKS.map((h) => h.pattern_name)));
    return {
      patterns: names.map((name) => {
        const hs = DEMO_HOOKS.filter((h) => h.pattern_name === name);
        return {
          id: name,
          name,
          template: name === 'The Rejection List'
            ? 'I [verb]ed [X] [things].\nRejected [Y]% for these [N] reasons.'
            : name === 'The Screenshot Reveal'
              ? '[Specific metric] on [task].\n[Absurd outcome].'
              : name === 'The Contrarian Take'
                ? '[Common belief]?\n[Stronger counter-claim].'
                : name === 'The Personal Story Arc'
                  ? '[Surprising statistic].\nHere\'s how I [did the hard thing].'
                  : name === 'The Data Drop'
                    ? 'We got [specific number] [things] in [timeframe].\n[N] stood out for [reason].'
                    : '[Counterintuitive statement].\n[Evidence 1]\n[Evidence 2]\n[Evidence 3]',
          description: 'Demo pattern',
          example_count: hs.length,
          avg_engagement: Math.round(hs.reduce((s, h) => s + h.engagement_score, 0) / hs.length),
        };
      }),
      isDemo: true,
    };
  }

  const db = supabaseAdmin();
  const { data } = await db
    .from('patterns')
    .select('id, name, template, description, example_count, avg_engagement')
    .order('avg_engagement', { ascending: false });
  return { patterns: (data ?? []) as Pattern[], isDemo: false };
}

export default async function WritePage({ searchParams }: { searchParams: { pattern?: string } }) {
  const { patterns, isDemo } = await getPatterns();
  return (
    <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
      {isDemo && (
        <div className="mb-6 rounded-3xl border hairline bg-card p-4 text-sm font-semibold text-muted shadow-sm">
          Demo mode can show the writer UI. Add Supabase + Anthropic env vars to generate live drafts.
        </div>
      )}
      <WriterClient patterns={patterns} initialPatternId={searchParams.pattern} />
    </main>
  );
}
