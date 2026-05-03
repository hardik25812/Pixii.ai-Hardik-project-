import { NextResponse } from 'next/server';
import { scrapeReddit } from '@/lib/scraper';
import { extractHooks } from '@/lib/extractor';
import { hasSupabaseConfig } from '@/lib/supabase';
import { ensurePatterns, insertHooks, recordMiningRun, refreshPatternStats } from '@/lib/ingest';
import type { RawPost } from '@/lib/scraper';
import type { ExtractedHook } from '@/lib/extractor';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Streams real-time Reddit mining progress as newline-delimited JSON events.
 * The client sees each phase: scraping → extracting → storing.
 */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      try {
        // Phase 1: Scrape Reddit
        send({ phase: 'scraping', message: 'Scraping Reddit subreddits...', progress: 0 });
        let posts: RawPost[];
        try {
          posts = await scrapeReddit();
        } catch (e: any) {
          send({ phase: 'error', message: `Scraping failed: ${e?.message ?? e}` });
          controller.close();
          return;
        }
        send({
          phase: 'scraping',
          message: `Scraped ${posts.length} posts from Reddit`,
          progress: 30,
          posts_count: posts.length,
          sample: posts.slice(0, 3).map((p) => ({
            title: p.text.slice(0, 80),
            likes: p.likes,
            comments: p.comments,
          })),
        });

        if (posts.length === 0) {
          if (hasSupabaseConfig()) {
            await recordMiningRun({
              source: 'reddit',
              status: 'empty',
              message: 'No posts found on Reddit',
            });
          }
          send({ phase: 'done', message: 'No posts found on Reddit', hooks_added: 0 });
          controller.close();
          return;
        }

        // Phase 2: Extract hooks via Claude
        send({
          phase: 'extracting',
          message: `Sending ${posts.length} posts to Claude for hook extraction...`,
          progress: 40,
        });

        let hooks: ExtractedHook[];
        try {
          // Send progress updates for each batch
          const BATCH = 20;
          hooks = [];
          for (let i = 0; i < posts.length; i += BATCH) {
            const batchNum = Math.floor(i / BATCH) + 1;
            const totalBatches = Math.ceil(posts.length / BATCH);
            send({
              phase: 'extracting',
              message: `Claude analyzing batch ${batchNum}/${totalBatches}...`,
              progress: 40 + Math.round((i / posts.length) * 40),
              batch: batchNum,
              total_batches: totalBatches,
            });
            const batch = posts.slice(i, i + BATCH);
            const batchHooks = await extractHooks(batch);
            hooks.push(...batchHooks);

            // Show extracted hooks from this batch
            if (batchHooks.length > 0) {
              send({
                phase: 'extracting',
                message: `Extracted ${batchHooks.length} hooks from batch ${batchNum}`,
                progress: 40 + Math.round(((i + BATCH) / posts.length) * 40),
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
          message: `Claude extracted ${hooks.length} hooks from ${posts.length} posts`,
          progress: 80,
          hooks_count: hooks.length,
        });

        // Phase 3: Store in Supabase
        let storedCount = 0;
        if (hasSupabaseConfig()) {
          send({ phase: 'storing', message: 'Saving hooks to database...', progress: 85 });

          try {
            // Auto-create any new patterns Claude discovered
            const patternNames = hooks.map((h) => h.pattern_name);
            const patternMap = await ensurePatterns(patternNames);

            const result = await insertHooks(hooks, posts, patternMap);
            if (result.error) {
              send({ phase: 'storing', message: `Storage warning: ${result.error}`, progress: 90 });
            }
            storedCount = result.stored;

            // Refresh pattern stats (example_count, avg_engagement)
            send({ phase: 'storing', message: 'Updating pattern statistics...', progress: 95 });
            await refreshPatternStats();
          } catch (e: any) {
            send({ phase: 'storing', message: `Storage warning: ${e?.message}`, progress: 90 });
          }
        }

        // Final result
        if (hasSupabaseConfig()) {
          await recordMiningRun({
            source: 'reddit',
            status: 'success',
            postsScraped: posts.length,
            hooksExtracted: hooks.length,
            hooksStored: storedCount,
            message: `Mining complete! ${hooks.length} hooks extracted, ${storedCount} stored.`,
          });
        }

        send({
          phase: 'done',
          message: `Mining complete! ${hooks.length} hooks extracted, ${storedCount} stored.`,
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
