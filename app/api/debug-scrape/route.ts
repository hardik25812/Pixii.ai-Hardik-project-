import { NextResponse } from 'next/server';
import { scrapeReddit, scrapeTwitter, scrapeLinkedIn } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get('source') ?? 'twitter';

  try {
    let posts;
    if (source === 'reddit') posts = await scrapeReddit();
    else if (source === 'linkedin') posts = await scrapeLinkedIn();
    else posts = await scrapeTwitter();

    return NextResponse.json({
      source,
      count: posts.length,
      sample: posts.slice(0, 5),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e), source },
      { status: 500 }
    );
  }
}
