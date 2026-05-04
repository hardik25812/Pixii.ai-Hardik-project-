import { duckDuckSearch } from './jina';
import { ApifyClient } from 'apify-client';

export interface RawPost {
  text: string;
  url: string;
  source: 'linkedin' | 'reddit' | 'twitter';
  likes: number;
  comments: number;
  author_followers?: number;
}

/* ─── Reddit — public JSON API (free, no auth) ─── */

const SUBREDDITS = [
  'FulfillmentByAmazon',
  'ecommerce',
  'AmazonSeller',
  'Entrepreneur',
  'startups',
  'SaaS',
  'artificial',
  'smallbusiness',
];

/**
 * Scrape Reddit via Apify actor `datara/reddit-search-scraper`.
 * Pricing: $5 per 10,000 results -> 80 results ~= $0.04 per run.
 * Vercel-safe (no 403, no Reddit OAuth needed).
 */
async function scrapeRedditViaApify(): Promise<RawPost[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const client = new ApifyClient({ token });

  // Hard cap to keep cost ~$0.04 per run (well under $0.40 budget)
  const MAX_ITEMS = 80;

  const startUrls = SUBREDDITS.map((s) => ({
    url: `https://www.reddit.com/r/${s}/top/?t=month`,
  }));

  const input: Record<string, unknown> = {
    startUrls,
    searches: SUBREDDITS.map((s) => `subreddit:${s}`),
    maxItems: MAX_ITEMS,
    type: 'posts',
    sort: 'top',
    time: 'month',
    proxy: { useApifyProxy: true },
  };

  const run = await client.actor('datara/reddit-search-scraper').call(input, {
    timeout: 180,
    memory: 512,
  });

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems({ limit: MAX_ITEMS });

  const posts: RawPost[] = [];
  for (const raw of items as Array<Record<string, unknown>>) {
    const title = String(raw.title ?? raw.postTitle ?? '');
    const body = String(raw.text ?? raw.selftext ?? raw.body ?? raw.content ?? '');
    const text = `${title}\n${body}`.trim();
    if (text.length < 40) continue;

    const url = String(raw.url ?? raw.postUrl ?? raw.permalink ?? raw.link ?? '');
    const likes = Number(
      raw.score ?? raw.ups ?? raw.upVotes ?? raw.numUpvotes ?? raw.likes ?? 0
    );
    const comments = Number(
      raw.numComments ?? raw.commentsCount ?? raw.num_comments ?? raw.comments ?? 0
    );

    posts.push({
      text: text.slice(0, 4000),
      url: url.startsWith('/r/') ? `https://www.reddit.com${url}` : url,
      source: 'reddit',
      likes,
      comments,
    });
  }

  return posts
    .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
    .slice(0, MAX_ITEMS);
}

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PixiiHookMiningEngine/1.0 by hardik25812',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.access_token === 'string' ? json.access_token : null;
}

async function fetchRedditListing(sub: string, token: string | null) {
  const url = token
    ? `https://oauth.reddit.com/r/${sub}/top?t=month&limit=50`
    : `https://www.reddit.com/r/${sub}/top.json?t=month&limit=50&raw_json=1`;

  return fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'PixiiHookMiningEngine/1.0 by hardik25812',
        }
      : {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; PixiiHookMiningEngine/1.0; +https://pixii.ai)',
        },
    signal: AbortSignal.timeout(15000),
  });
}

async function scrapeRedditViaSearch(): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const queries = [
    'site:reddit.com/r/FulfillmentByAmazon top amazon seller',
    'site:reddit.com/r/ecommerce ecommerce founder',
    'site:reddit.com/r/AmazonSeller amazon listing',
    'site:reddit.com/r/Entrepreneur startup growth',
    'site:reddit.com/r/SaaS product marketing',
  ];

  for (const query of queries) {
    try {
      const md = await duckDuckSearch(query);
      const blocks = md.split(/\n## \[/g).slice(1);
      for (const raw of blocks) {
        const block = '## [' + raw;
        const titleMatch = block.match(/## \[([^\]]+)\]\(([^)]+)\)/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        const ddgUrl = titleMatch[2];
        const uddgMatch = ddgUrl.match(/uddg=([^&]+)/);
        const realUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : ddgUrl;
        if (!/reddit\.com\/r\//i.test(realUrl)) continue;
        if (title.length < 25) continue;
        posts.push({
          text: title.slice(0, 1200),
          url: realUrl,
          source: 'reddit',
          likes: 0,
          comments: 0,
        });
      }
    } catch {
      // continue to next query
    }
  }

  const seen = new Set<string>();
  return posts.filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true))).slice(0, 60);
}

export async function scrapeReddit(): Promise<RawPost[]> {
  // Preferred path: Apify actor (Vercel-safe, ~$0.04/run, capped at 80 items)
  if (process.env.APIFY_API_TOKEN) {
    try {
      const apifyPosts = await scrapeRedditViaApify();
      if (apifyPosts.length > 0) return apifyPosts;
    } catch (e) {
      // fall through to OAuth / public path on Apify failure
      console.error('Apify Reddit scrape failed, falling back:', e);
    }
  }

  const posts: RawPost[] = [];
  const errors: string[] = [];
  const token = await getRedditAccessToken();

  for (const sub of SUBREDDITS) {
    try {
      const res = await fetchRedditListing(sub, token);
      if (!res.ok) {
        errors.push(`r/${sub}: ${res.status}`);
        continue;
      }
      const json = await res.json();
      const children = json?.data?.children ?? [];
      for (const child of children) {
        const d = child?.data;
        if (!d) continue;
        const text = `${d.title ?? ''}\n${d.selftext ?? ''}`.trim();
        if (text.length < 40) continue;
        const permalink = d.permalink
          ? `https://www.reddit.com${d.permalink}`
          : d.url ?? '';
        posts.push({
          text,
          url: permalink,
          source: 'reddit',
          likes: d.score ?? d.ups ?? 0,
          comments: d.num_comments ?? 0,
        });
      }
    } catch (err: any) {
      errors.push(`r/${sub}: ${err?.message ?? String(err)}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    const fallbackPosts = await scrapeRedditViaSearch();
    if (fallbackPosts.length > 0) return fallbackPosts;
    throw new Error(
      token
        ? `Reddit OAuth scraping failed: ${errors.join(' | ')}`
        : `Reddit public scraping failed: ${errors.join(' | ')}. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in Vercel for reliable Reddit mining.`
    );
  }

  return posts
    .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
    .slice(0, 100);
}

/* ─── X.com / Twitter — Jina search (free, no API key) ─── */

const X_QUERIES = [
  'amazon seller tip',
  'ecommerce AI',
  'product photography AI',
  'Amazon FBA growth',
  'AI startup founder',
  'DTC brand strategy',
];

/**
 * Is this URL an actual individual post (not a profile, hashtag, or search page)?
 *
 * X.com post:     https://x.com/username/status/1234567890
 * LinkedIn post:  https://linkedin.com/posts/username_slug-activity-1234567890
 * LinkedIn pulse: https://linkedin.com/pulse/title-author-1234567890
 */
function isRealPostUrl(url: string, source: 'twitter' | 'linkedin'): boolean {
  if (source === 'twitter') {
    return /x\.com\/[^/]+\/status\/\d+/i.test(url);
  }
  return /linkedin\.com\/(posts|pulse)\//i.test(url);
}

function parseDdg(
  markdown: string,
  source: 'twitter' | 'linkedin'
): RawPost[] {
  const posts: RawPost[] = [];

  const blocks = markdown.split(/\n## \[/g).slice(1);

  for (const raw of blocks) {
    const block = '## [' + raw;
    const titleMatch = block.match(/## \[([^\]]+)\]\(([^)]+)\)/);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const ddgUrl = titleMatch[2];

    const uddgMatch = ddgUrl.match(/uddg=([^&]+)/);
    const realUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : ddgUrl;

    // Only keep actual individual post URLs — not profiles, hashtags, search pages
    if (!isRealPostUrl(realUrl, source)) continue;

    const linkTexts = Array.from(
      block.matchAll(/\[([^\]]{40,500})\]\([^)]+\)/g)
    )
      .map((m) => m[1])
      .filter((t) => !t.startsWith('!') && !/^Image \d+/.test(t))
      .filter((t) => !/^https?:\/\//.test(t))
      .sort((a, b) => b.length - a.length);

    const snippet = (linkTexts[0] ?? '').trim();
    const text = [title, snippet]
      .filter(Boolean)
      .join('\n')
      .replace(/\*\*/g, '')
      .trim();

    if (text.length < 40) continue;

    // No fake engagement. DDG doesn't provide metrics.
    // The value is the hook text itself — Claude extracts the pattern.
    posts.push({
      text: text.slice(0, 1200),
      url: realUrl,
      source,
      likes: 0,
      comments: 0,
    });
  }

  return posts;
}

export async function scrapeTwitter(): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const errors: string[] = [];

  for (const query of X_QUERIES) {
    try {
      const md = await duckDuckSearch(`site:x.com ${query}`);
      posts.push(...parseDdg(md, 'twitter'));
    } catch (err: any) {
      errors.push(`X "${query}": ${err?.message ?? String(err)}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    console.error('X.com scraping issues:', errors.join(' | '));
  }

  const seen = new Set<string>();
  return posts
    .filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .slice(0, 60);
}

/* ─── LinkedIn — Jina search (free, no API key) ─── */

const LINKEDIN_QUERIES = [
  'amazon seller linkedin post',
  'ecommerce founder linkedin',
  'amazon FBA linkedin',
  'AI product photography linkedin',
  'DTC brand linkedin post',
  'amazon listing optimization linkedin',
];

export async function scrapeLinkedIn(): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const errors: string[] = [];

  for (const query of LINKEDIN_QUERIES) {
    try {
      const md = await duckDuckSearch(`site:linkedin.com/posts ${query}`);
      posts.push(...parseDdg(md, 'linkedin'));
    } catch (err: any) {
      errors.push(`LI "${query}": ${err?.message ?? String(err)}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    console.error('LinkedIn scraping issues:', errors.join(' | '));
  }

  const seen = new Set<string>();
  return posts
    .filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .slice(0, 60);
}

/* ─── Dynamic keyword scraping (for chat tool) ─── */

export async function scrapeRedditByKeywords(
  keywords: string[],
  maxItems = 40
): Promise<RawPost[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    // Fallback: DuckDuckGo search-based
    const posts: RawPost[] = [];
    for (const kw of keywords.slice(0, 5)) {
      try {
        const md = await duckDuckSearch(`site:reddit.com ${kw}`);
        const blocks = md.split(/\n## \[/g).slice(1);
        for (const raw of blocks) {
          const block = '## [' + raw;
          const titleMatch = block.match(/## \[([^\]]+)\]\(([^)]+)\)/);
          if (!titleMatch) continue;
          const title = titleMatch[1].trim();
          const ddgUrl = titleMatch[2];
          const uddgMatch = ddgUrl.match(/uddg=([^&]+)/);
          const realUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : ddgUrl;
          if (!/reddit\.com/i.test(realUrl)) continue;
          if (title.length < 25) continue;
          posts.push({ text: title.slice(0, 1200), url: realUrl, source: 'reddit', likes: 0, comments: 0 });
        }
      } catch { /* skip */ }
    }
    const seen = new Set<string>();
    return posts.filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true))).slice(0, maxItems);
  }

  const client = new ApifyClient({ token });
  const cap = Math.min(maxItems, 80);

  const input: Record<string, unknown> = {
    searches: keywords.map((kw) => kw),
    maxItems: cap,
    type: 'posts',
    sort: 'top',
    time: 'month',
    proxy: { useApifyProxy: true },
  };

  const run = await client.actor('datara/reddit-search-scraper').call(input, {
    timeout: 180,
    memory: 512,
  });

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems({ limit: cap });

  const posts: RawPost[] = [];
  for (const raw of items as Array<Record<string, unknown>>) {
    const title = String(raw.title ?? raw.postTitle ?? '');
    const body = String(raw.text ?? raw.selftext ?? raw.body ?? raw.content ?? '');
    const text = `${title}\n${body}`.trim();
    if (text.length < 40) continue;
    const url = String(raw.url ?? raw.postUrl ?? raw.permalink ?? raw.link ?? '');
    posts.push({
      text: text.slice(0, 4000),
      url: url.startsWith('/r/') ? `https://www.reddit.com${url}` : url,
      source: 'reddit',
      likes: Number(raw.score ?? raw.ups ?? raw.upVotes ?? 0),
      comments: Number(raw.numComments ?? raw.commentsCount ?? raw.num_comments ?? 0),
    });
  }

  return posts
    .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
    .slice(0, cap);
}

export async function scrapeTwitterByKeywords(
  keywords: string[],
  maxItems = 40
): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  for (const kw of keywords.slice(0, 6)) {
    try {
      const md = await duckDuckSearch(`site:x.com ${kw}`);
      posts.push(...parseDdg(md, 'twitter'));
    } catch { /* skip */ }
  }
  const seen = new Set<string>();
  return posts
    .filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .slice(0, maxItems);
}

/* ─── Combined ─── */

export async function scrapeAll(): Promise<RawPost[]> {
  const results = await Promise.allSettled([
    scrapeReddit(),
    scrapeTwitter(),
    scrapeLinkedIn(),
  ]);
  const posts: RawPost[] = [];
  const errors: string[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') posts.push(...r.value);
    else errors.push(String(r.reason?.message ?? r.reason));
  }

  if (posts.length === 0 && errors.length > 0) {
    throw new Error(`All scrapers failed: ${errors.join(' | ')}`);
  }

  return posts;
}
