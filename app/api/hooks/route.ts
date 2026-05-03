import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const patternId = url.searchParams.get('pattern_id');
    const sort = url.searchParams.get('sort') ?? 'engagement';
    const q = url.searchParams.get('q')?.trim();
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);

    const db = supabaseAdmin();
    let query = db
      .from('hooks')
      .select(
        'id, hook_text, raw_text, source, source_url, engagement_score, author_followers, virality_score, reasoning, pattern_id, scraped_at, patterns(name)'
      )
      .limit(limit);

    if (patternId) query = query.eq('pattern_id', patternId);
    if (q) query = query.ilike('hook_text', `%${q}%`);

    if (sort === 'virality') {
      query = query.order('virality_score', { ascending: false, nullsFirst: false });
    } else if (sort === 'recent') {
      query = query.order('scraped_at', { ascending: false });
    } else {
      query = query.order('engagement_score', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ hooks: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
