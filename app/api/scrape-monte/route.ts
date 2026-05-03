import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Monte's LinkedIn profile — the actor accepts profile URLs directly
const MONTE_LINKEDIN_URLS = [
  'https://www.linkedin.com/in/montedesai/',
];

// Try these actor identifiers in order until one works.
// All support a LinkedIn profile URL as input. No cookies required.
const ACTOR_CANDIDATES = [
  'supreme_coder/linkedin-post',              // the actor shown in the user's Apify screenshot
  'harvestapi/linkedin-profile-posts',        // 11K uses, 4.9 stars — free, no cookies
  'apimaestro/linkedin-profile-posts',        // 17K uses, 4.6 stars — free, no cookies
];

interface ApifyLinkedInPost {
  text?: string;
  postUrl?: string;
  url?: string;
  content?: string;
  numLikes?: number;
  likesCount?: number;
  numComments?: number;
  commentsCount?: number;
  numShares?: number;
  postedAt?: string;
  publishedAt?: string;
  [key: string]: unknown;
}

export async function POST() {
  try {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'APIFY_API_TOKEN not configured' },
        { status: 500 }
      );
    }

    const client = new ApifyClient({ token });

    // Try each actor candidate until one succeeds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let run: any = null;
    let usedActor = '';
    const triedErrors: string[] = [];

    for (const actorId of ACTOR_CANDIDATES) {
      try {
        run = await client.actor(actorId).call({
          profileUrls: MONTE_LINKEDIN_URLS,
          maxPostsPerProfile: 50,
          scrapeAdditionalInfo: true,
          getRawData: false,
        });
        usedActor = actorId;
        break;
      } catch (e: any) {
        triedErrors.push(`${actorId}: ${e?.message ?? e}`);
      }
    }

    if (!run) {
      return NextResponse.json(
        {
          error: 'All actor candidates failed — copy your Default API token (eye icon, first row) from console.apify.com/settings/integrations and paste it in .env.local as APIFY_API_TOKEN',
          tried: triedErrors,
        },
        { status: 500 }
      );
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    // Normalize — actor may use different field names across versions
    function getText(p: ApifyLinkedInPost): string {
      return String(p.text ?? p.content ?? p.commentary ?? '');
    }
    function getUrl(p: ApifyLinkedInPost): string | null {
      return String(p.postUrl ?? p.url ?? p.shareUrl ?? '') || null;
    }
    function getLikes(p: ApifyLinkedInPost): number {
      return Number(p.numLikes ?? p.likesCount ?? p.likeCount ?? 0);
    }
    function getComments(p: ApifyLinkedInPost): number {
      return Number(p.numComments ?? p.commentsCount ?? p.commentCount ?? 0);
    }
    function getPostedAt(p: ApifyLinkedInPost): string | null {
      return String(p.postedAt ?? p.publishedAt ?? p.createdAt ?? '') || null;
    }

    const posts = (items as ApifyLinkedInPost[]).filter(
      (item) => getText(item).length > 30
    );

    if (posts.length === 0) {
      // Return raw first item for debugging if something came back but didn't match
      const debugSample = items[0] ? JSON.stringify(items[0]).slice(0, 300) : 'no items';
      return NextResponse.json({
        success: false,
        error: 'No posts found — check raw sample',
        raw_sample: debugSample,
        posts_scraped: 0,
      });
    }

    // Store in Supabase if configured
    let stored = 0;
    if (hasSupabaseConfig()) {
      const db = supabaseAdmin();
      const toInsert = posts.map((p) => ({
        post_text: getText(p).slice(0, 5000),
        post_url: getUrl(p),
        likes: getLikes(p),
        comments: getComments(p),
        shares: Number(p.numShares ?? p.sharesCount ?? 0),
        posted_at: getPostedAt(p),
      }));

      const { error } = await db
        .from('monte_posts')
        .upsert(toInsert, { onConflict: 'post_url', ignoreDuplicates: true });

      if (error) console.error('Supabase insert error:', error);
      else stored = toInsert.length;
    }

    // Return all posts for the animated feed (not just 10)
    const sample = posts.map((p) => ({
      text: getText(p).slice(0, 500),
      likes: getLikes(p),
      comments: getComments(p),
    }));

    return NextResponse.json({
      success: true,
      actor_used: usedActor,
      posts_scraped: posts.length,
      posts_stored: stored,
      sample,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
