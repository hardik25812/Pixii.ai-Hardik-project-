import { NextResponse } from 'next/server';
import { scrapeAll } from '@/lib/scraper';
import { extractHooks } from '@/lib/extractor';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function run() {
  const posts = await scrapeAll();
  if (posts.length === 0) {
    return { success: false, error: 'No posts scraped' };
  }

  const hooks = await extractHooks(posts);

  const db = supabaseAdmin();
  const { data: patterns } = await db.from('patterns').select('id, name');
  const patternMap = Object.fromEntries(
    (patterns ?? []).map((p) => [p.name, p.id])
  );

  const toInsert = hooks
    .map((h, i) => {
      const post = posts[i];
      if (!post) return null;
      return {
        raw_text: post.text.slice(0, 2000),
        hook_text: h.hook_text,
        pattern_id: patternMap[h.pattern_name] ?? null,
        source: post.source,
        source_url: post.url,
        engagement_score: (post.likes || 0) + (post.comments || 0),
        author_followers: post.author_followers ?? 0,
        reasoning: h.reasoning,
      };
    })
    .filter(Boolean);

  const { error } = await db.from('hooks').insert(toInsert as any);
  if (error) throw error;

  return {
    success: true,
    posts_scraped: posts.length,
    hooks_added: toInsert.length,
  };
}

function unauthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // no secret configured → allow (first run)
  const auth = req.headers.get('authorization');
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron) return false;
  return auth !== `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (unauthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await run();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // Vercel Cron hits via GET by default.
  return POST(req);
}
