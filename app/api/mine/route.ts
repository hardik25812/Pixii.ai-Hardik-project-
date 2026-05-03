import { NextResponse } from 'next/server';
import { scrapeAll } from '@/lib/scraper';
import { extractHooks } from '@/lib/extractor';
import { ensurePatterns, insertHooks, recordMiningRun, refreshPatternStats } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function run() {
  const posts = await scrapeAll();
  if (posts.length === 0) {
    await recordMiningRun({
      source: 'all',
      status: 'empty',
      message: 'No posts scraped',
    });
    return { success: false, error: 'No posts scraped' };
  }

  const hooks = await extractHooks(posts);

  const patternNames = hooks.map((h) => h.pattern_name);
  const patternMap = await ensurePatterns(patternNames);
  const result = await insertHooks(hooks, posts, patternMap);
  if (result.error) throw new Error(result.error);

  await refreshPatternStats();
  await recordMiningRun({
    source: 'all',
    status: 'success',
    postsScraped: posts.length,
    hooksExtracted: hooks.length,
    hooksStored: result.stored,
    message: `Cron mining complete: ${hooks.length} hooks extracted, ${result.stored} stored.`,
  });

  return {
    success: true,
    posts_scraped: posts.length,
    hooks_added: result.stored,
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
