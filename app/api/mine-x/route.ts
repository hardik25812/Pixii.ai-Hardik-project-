import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { extractHooks } from '@/lib/extractor';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';
import type { RawPost } from '@/lib/scraper';
import type { ExtractedHook } from '@/lib/extractor';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Keywords that surface high-engagement content relevant to Monte's patterns
const MINING_KEYWORDS = [
  'Amazon seller tips',
  'ecommerce AI listings',
];

const MAX_ITEMS_PER_KEYWORD = 15; // 2 keywords × 15 = 30 tweets max

/**
 * Streams real-time X/Twitter mining progress as newline-delimited JSON events.
 * Uses watcher.data/search-x-by-keywords → Claude hook extraction → Supabase storage.
 */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      try {
        const token = process.env.APIFY_API_TOKEN;
        if (!token) {
          send({ phase: 'error', message: 'APIFY_API_TOKEN not configured' });
          controller.close();
          return;
        }

        // ── Phase 1: Scrape X via watcher.data/search-x-by-keywords ──
        send({
          phase: 'scraping',
          message: `Searching X for: ${MINING_KEYWORDS.join(', ')}…`,
          progress: 5,
        });

        const client = new ApifyClient({ token });
        let rawItems: Record<string, unknown>[] = [];

        try {
          const run = await client.actor('watcher.data/search-x-by-keywords').call({
            keywords: MINING_KEYWORDS,
            searchType: 'tweets',
            maxItemsPerKeyword: MAX_ITEMS_PER_KEYWORD,
            includeReplies: false,
            includeRetweets: false,
            sortBy: 'latest',
          });

          const { items } = await client.dataset(run.defaultDatasetId).listItems();
          rawItems = items as Record<string, unknown>[];
        } catch (e: any) {
          send({ phase: 'error', message: `X scraping failed: ${e?.message ?? e}` });
          controller.close();
          return;
        }

        // Deduplicate by id/url and filter to real tweet text
        const seen = new Set<string>();
        const tweets = rawItems.filter((t) => {
          const key = String(t.id ?? t.url ?? '');
          if (!key || seen.has(key)) return false;
          seen.add(key);
          const text = String(t.text ?? '').trim();
          return !t.is_retweet && !t.is_reply && text.length > 30;
        }).slice(0, 30); // hard cap at 30

        send({
          phase: 'scraping',
          message: `Fetched ${tweets.length} unique tweets from X (cap: 30)`,
          progress: 30,
          posts_count: tweets.length,
          sample: tweets.slice(0, 3).map((t) => ({
            title: String(t.text ?? '').slice(0, 80),
            likes: Number(t.like_count ?? 0),
            comments: Number(t.reply_count ?? 0),
          })),
        });

        if (tweets.length === 0) {
          send({ phase: 'done', message: 'No tweets found', hooks_extracted: 0, hooks_stored: 0 });
          controller.close();
          return;
        }

        // Convert to RawPost shape for extractHooks
        const posts: RawPost[] = tweets.map((t) => ({
          text: String(t.text ?? '').slice(0, 2000),
          url: String(t.url ?? ''),
          source: 'twitter' as const,
          likes: Number(t.like_count ?? 0),
          comments: Number(t.reply_count ?? 0),
          author_followers: 0,
        }));

        // ── Phase 2: Extract hooks via Claude in batches ──
        send({
          phase: 'extracting',
          message: `Sending ${posts.length} tweets to Claude for hook extraction…`,
          progress: 35,
        });

        const BATCH = 20;
        const hooks: ExtractedHook[] = [];

        try {
          for (let i = 0; i < posts.length; i += BATCH) {
            const batchNum = Math.floor(i / BATCH) + 1;
            const totalBatches = Math.ceil(posts.length / BATCH);
            send({
              phase: 'extracting',
              message: `Claude analyzing batch ${batchNum}/${totalBatches}…`,
              progress: 35 + Math.round((i / posts.length) * 45),
              batch: batchNum,
              total_batches: totalBatches,
            });

            const batch = posts.slice(i, i + BATCH);
            const batchHooks = await extractHooks(batch);
            hooks.push(...batchHooks);

            if (batchHooks.length > 0) {
              send({
                phase: 'extracting',
                message: `Extracted ${batchHooks.length} hooks from batch ${batchNum}`,
                progress: 35 + Math.round(((i + BATCH) / posts.length) * 45),
                hooks_so_far: hooks.length,
                latest_hooks: batchHooks.slice(0, 2).map((h) => ({
                  hook: h.hook_text.slice(0, 80),
                  pattern: h.pattern_name,
                })),
              });
            }
          }
        } catch (e: any) {
          send({ phase: 'error', message: `Claude extraction failed: ${e?.message ?? e}` });
          controller.close();
          return;
        }

        send({
          phase: 'extracted',
          message: `Claude extracted ${hooks.length} hooks from ${posts.length} tweets`,
          progress: 82,
          hooks_count: hooks.length,
        });

        // ── Phase 3: Store hooks in Supabase ──
        let storedCount = 0;
        if (hasSupabaseConfig()) {
          send({ phase: 'storing', message: 'Saving X hooks to database…', progress: 87 });
          try {
            const db = supabaseAdmin();
            const { data: patterns } = await db.from('patterns').select('id, name');
            const patternMap = Object.fromEntries(
              (patterns ?? []).map((p: { name: string; id: string }) => [p.name, p.id])
            );

            const toInsert = hooks
              .map((h, i) => {
                const post = posts[i];
                if (!post) return null;
                return {
                  raw_text: post.text.slice(0, 2000),
                  hook_text: h.hook_text,
                  pattern_id: patternMap[h.pattern_name] ?? null,
                  source: 'twitter',
                  source_url: post.url,
                  engagement_score: (post.likes || 0) + (post.comments || 0),
                  author_followers: 0,
                  reasoning: h.reasoning,
                };
              })
              .filter(Boolean);

            const { error } = await db.from('hooks').insert(toInsert as any);
            if (error) throw error;
            storedCount = toInsert.length;
          } catch (e: any) {
            send({ phase: 'storing', message: `Storage warning: ${e?.message}`, progress: 92 });
          }
        }

        // ── Final ──
        send({
          phase: 'done',
          message: `X mining complete! ${hooks.length} hooks extracted from ${posts.length} tweets, ${storedCount} stored.`,
          progress: 100,
          posts_scraped: posts.length,
          hooks_extracted: hooks.length,
          hooks_stored: storedCount,
          hooks: hooks.slice(0, 8).map((h) => ({
            hook_text: h.hook_text,
            pattern_name: h.pattern_name,
            reasoning: h.reasoning,
          })),
        });
      } catch (e: any) {
        send({ phase: 'error', message: String(e?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
