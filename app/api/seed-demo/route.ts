import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { DEMO_HOOKS } from '@/lib/demo-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Seeds 60 demo hooks tied to the 6 seeded patterns.
 * Idempotent: wipes existing hooks first unless ?append=1.
 *
 * Usage:
 *   POST /api/seed-demo          → wipe + reseed
 *   POST /api/seed-demo?append=1 → append only
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const append = url.searchParams.get('append') === '1';

    const db = supabaseAdmin();

    const { data: patterns, error: pErr } = await db
      .from('patterns')
      .select('id, name');
    if (pErr) throw pErr;
    if (!patterns || patterns.length === 0) {
      return NextResponse.json(
        { error: 'No patterns found. Run supabase/schema.sql first.' },
        { status: 400 }
      );
    }

    const patternMap = Object.fromEntries(patterns.map((p) => [p.name, p.id]));

    if (!append) {
      await db.from('hooks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

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

    // Refresh pattern aggregates.
    for (const p of patterns) {
      const { data: stats } = await db
        .from('hooks')
        .select('engagement_score')
        .eq('pattern_id', p.id);
      const count = stats?.length ?? 0;
      const avg =
        count > 0
          ? stats!.reduce((s, r: any) => s + (r.engagement_score || 0), 0) / count
          : 0;
      await db
        .from('patterns')
        .update({ example_count: count, avg_engagement: avg })
        .eq('id', p.id);
    }

    return NextResponse.json({
      success: true,
      seeded: rows.length,
      wiped: !append,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
