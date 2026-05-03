import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MONTE_X_HANDLE = 'MonteDesai';

// Normalized tweet interface covering all actor output schemas
interface NormalizedTweet {
  // Text fields
  text?: string;
  fullText?: string;
  full_text?: string;
  content?: string;
  // URL fields
  url?: string;
  tweetUrl?: string;
  tweet_url?: string;
  // Engagement
  likeCount?: number;
  like_count?: number;
  favorite_count?: number;
  retweetCount?: number;
  retweet_count?: number;
  replyCount?: number;
  reply_count?: number;
  // Timestamps
  createdAt?: string;
  created_at?: string;
  // Flags
  isRetweet?: boolean;
  is_retweet?: boolean;
  retweeted?: boolean;
  isReply?: boolean;
  is_reply?: boolean;
  [key: string]: unknown;
}

function getText(t: NormalizedTweet): string {
  return String(t.fullText ?? t.full_text ?? t.text ?? t.content ?? '').trim();
}
function getLikes(t: NormalizedTweet): number {
  return Number(t.likeCount ?? t.like_count ?? t.favorite_count ?? 0);
}
function getRetweets(t: NormalizedTweet): number {
  return Number(t.retweetCount ?? t.retweet_count ?? 0);
}
function getReplies(t: NormalizedTweet): number {
  return Number(t.replyCount ?? t.reply_count ?? 0);
}
function getUrl(t: NormalizedTweet): string | null {
  return String(t.url ?? t.tweetUrl ?? t.tweet_url ?? '') || null;
}
function getCreatedAt(t: NormalizedTweet): string | null {
  return String(t.createdAt ?? t.created_at ?? '') || null;
}
function isRetweet(t: NormalizedTweet): boolean {
  return !!(t.isRetweet ?? t.is_retweet ?? t.retweeted ?? false);
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

    // Try actors in order — first one that returns real tweet data wins
    const ACTOR_ATTEMPTS: { id: string; input: Record<string, unknown> }[] = [
      {
        // User-specified actor: apidojo/twitter-user-scraper
        // This returns profile + pinned tweet data
        id: 'apidojo/twitter-user-scraper',
        input: {
          twitterHandles: [MONTE_X_HANDLE],
          getFollowers: false,
          getFollowing: false,
          maxItems: 1,
        },
      },
      {
        // apidojo tweet-scraper — searchTerms from:handle, pay-per-result
        id: 'apidojo/tweet-scraper',
        input: {
          searchTerms: [`from:${MONTE_X_HANDLE} -filter:retweets`],
          sort: 'Latest',
          maxItems: 50,
        },
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let run: any = null;
    const triedErrors: string[] = [];

    for (const attempt of ACTOR_ATTEMPTS) {
      try {
        run = await client.actor(attempt.id).call(attempt.input);
        // Verify the run produced items
        const probe = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
        const first = probe.items[0] as Record<string, unknown> | undefined;
        // Reject only explicit demo flags or zero-tweet error objects
        const isDemo = first && ('demo' in first);
        const isError = first && 'error' in first && 'tweet_count' in first && (first as any).tweet_count === 0;
        const isEmpty = probe.items.length === 0;
        if (!isDemo && !isError && !isEmpty) break;
        triedErrors.push(`${attempt.id}: ${isDemo ? 'demo mode' : isError ? 'user not found' : 'empty'}`);
        run = null;
      } catch (e: any) {
        triedErrors.push(`${attempt.id}: ${e?.message ?? e}`);
        run = null;
      }
    }

    if (!run) {
      return NextResponse.json(
        {
          error: 'Twitter scraping unavailable. Errors: ' + triedErrors.join(' | '),
          debug: triedErrors,
        },
        { status: 500 }
      );
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    // Detect output type: user-profile vs tweet list
    const firstItem = items[0] as Record<string, unknown> | undefined;
    const isUserProfileOutput = firstItem && ('userName' in firstItem || 'twitterHandle' in firstItem) && !('full_text' in firstItem) && !('fullText' in firstItem);

    let tweets: NormalizedTweet[] = [];

    if (isUserProfileOutput) {
      // twitter-user-scraper output — extract profile bio + pinned tweet as voice signals
      tweets = (items as Record<string, unknown>[]).flatMap((user) => {
        const results: NormalizedTweet[] = [];
        // Pinned tweet
        const pinned = user.pinnedTweet as Record<string, unknown> | undefined;
        if (pinned && typeof pinned === 'object') {
          const pinnedText = String(pinned.text ?? pinned.fullText ?? pinned.full_text ?? '');
          if (pinnedText.length > 20) {
            results.push({
              text: pinnedText,
              likeCount: Number((pinned as any).likeCount ?? 0),
              retweetCount: Number((pinned as any).retweetCount ?? 0),
              replyCount: Number((pinned as any).replyCount ?? 0),
              url: String((pinned as any).url ?? (pinned as any).tweetUrl ?? ''),
            });
          }
        }
        // Bio/description as a voice signal
        const bio = String(user.description ?? user.bio ?? '');
        if (bio.length > 20) {
          results.push({ text: `[Bio] ${bio}`, likeCount: 0, retweetCount: 0, replyCount: 0 });
        }
        return results;
      });
    } else {
      // Standard tweet list output
      tweets = (items as NormalizedTweet[]).filter(
        (t) => !isRetweet(t) && getText(t).length > 20
      );
    }

    if (tweets.length === 0) {
      const debugSample = firstItem ? JSON.stringify(firstItem).slice(0, 400) : 'no items';
      return NextResponse.json({
        success: false,
        error: 'No tweet content found — check raw sample',
        raw_sample: debugSample,
        tweets_scraped: 0,
      });
    }

    // Store in Supabase if configured
    let stored = 0;
    if (hasSupabaseConfig()) {
      const db = supabaseAdmin();
      const toInsert = tweets.map((t) => ({
        tweet_text: getText(t).slice(0, 2000),
        tweet_url: getUrl(t),
        likes: getLikes(t),
        retweets: getRetweets(t),
        replies: getReplies(t),
        tweeted_at: getCreatedAt(t),
      }));

      const { error } = await db
        .from('monte_tweets')
        .upsert(toInsert, { onConflict: 'tweet_url', ignoreDuplicates: true });

      if (error) console.error('Supabase insert error:', error);
      else stored = toInsert.length;
    }

    const sample = tweets.map((t) => ({
      text: getText(t).slice(0, 500),
      likes: getLikes(t),
      retweets: getRetweets(t),
      replies: getReplies(t),
    }));

    return NextResponse.json({
      success: true,
      tweets_scraped: tweets.length,
      tweets_stored: stored,
      sample,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
