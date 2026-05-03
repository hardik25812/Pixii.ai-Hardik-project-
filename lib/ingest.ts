/**
 * Shared Supabase ingest helpers for mining routes.
 * Handles: pattern upsert (including "Other"), hook insertion,
 * and post-ingest pattern stats refresh.
 */
import { supabaseAdmin } from './supabase';
import type { ExtractedHook } from './extractor';
import type { RawPost } from './scraper';

/**
 * Build the pattern name→id map, auto-creating any missing patterns
 * (e.g. "Other") so every hook gets a valid pattern_id.
 */
export async function getPatternMap(): Promise<Record<string, string>> {
  const db = supabaseAdmin();
  const { data: patterns } = await db.from('patterns').select('id, name');
  const map: Record<string, string> = {};
  for (const p of patterns ?? []) map[p.name] = p.id;

  return map;
}

/**
 * Ensure a pattern row exists for every name Claude returns.
 * Creates missing ones (like "Other") on the fly.
 */
export async function ensurePatterns(names: string[]): Promise<Record<string, string>> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('patterns').select('id, name');
  const map: Record<string, string> = {};
  for (const p of existing ?? []) map[p.name] = p.id;

  const missing = [...new Set(names)].filter((n) => !map[n]);
  if (missing.length > 0) {
    const rows = missing.map((name) => ({
      name,
      template: '[Hook pattern]\n[Supporting evidence]',
      description: `Auto-discovered pattern from mining.`,
    }));
    const { data: created } = await db
      .from('patterns')
      .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
      .select('id, name');
    for (const p of created ?? []) map[p.name] = p.id;

    // If upsert didn't return (ignoreDuplicates), re-fetch
    if (missing.some((n) => !map[n])) {
      const { data: refetch } = await db.from('patterns').select('id, name');
      for (const p of refetch ?? []) map[p.name] = p.id;
    }
  }

  return map;
}

/**
 * Insert extracted hooks into Supabase. Returns the count of stored hooks.
 */
export async function insertHooks(
  hooks: ExtractedHook[],
  posts: RawPost[],
  patternMap: Record<string, string>
): Promise<{ stored: number; error?: string }> {
  const db = supabaseAdmin();

  const seenInBatch = new Set<string>();
  const candidates = hooks
    .map((h, i) => {
      const post = posts[i];
      if (!post) return null;
      const sourceUrl = post.url || null;
      const key = sourceUrl || `${post.source}:${h.hook_text.trim().toLowerCase()}:${post.text.slice(0, 120).trim().toLowerCase()}`;
      if (seenInBatch.has(key)) return null;
      seenInBatch.add(key);
      return {
        raw_text: post.text.slice(0, 2000),
        hook_text: h.hook_text,
        pattern_id: patternMap[h.pattern_name] ?? null,
        source: post.source,
        source_url: sourceUrl,
        engagement_score: (post.likes || 0) + (post.comments || 0),
        author_followers: post.author_followers ?? 0,
        reasoning: h.reasoning,
      };
    })
    .filter(Boolean);

  const sourceUrls = candidates
    .map((row: any) => row.source_url)
    .filter(Boolean);
  const hookTexts = candidates
    .map((row: any) => row.hook_text)
    .filter(Boolean);

  const existingUrls = new Set<string>();
  const existingHookTexts = new Set<string>();

  if (sourceUrls.length > 0) {
    const { data } = await db.from('hooks').select('source_url').in('source_url', sourceUrls);
    for (const row of data ?? []) {
      if (row.source_url) existingUrls.add(row.source_url);
    }
  }

  if (hookTexts.length > 0) {
    const { data } = await db.from('hooks').select('hook_text').in('hook_text', hookTexts);
    for (const row of data ?? []) {
      if (row.hook_text) existingHookTexts.add(row.hook_text);
    }
  }

  const toInsert = candidates.filter((row: any) => {
    if (row.source_url && existingUrls.has(row.source_url)) return false;
    if (existingHookTexts.has(row.hook_text)) return false;
    return true;
  });

  if (toInsert.length === 0) return { stored: 0 };

  const { error } = await db.from('hooks').insert(toInsert as any);
  if (error) return { stored: 0, error: error.message };

  return { stored: toInsert.length };
}

export async function recordMiningRun(input: {
  source: string;
  status: string;
  postsScraped?: number;
  hooksExtracted?: number;
  hooksStored?: number;
  message?: string;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from('mining_runs').insert({
    source: input.source,
    status: input.status,
    posts_scraped: input.postsScraped ?? 0,
    hooks_extracted: input.hooksExtracted ?? 0,
    hooks_stored: input.hooksStored ?? 0,
    message: input.message ?? null,
  });
  if (error) {
    console.error('Failed to record mining run:', error.message);
  }
}

/**
 * Refresh pattern stats (example_count, avg_engagement) from the hooks table.
 * Call this after every mining run.
 */
export async function refreshPatternStats(): Promise<void> {
  const db = supabaseAdmin();

  // Get aggregated stats per pattern
  const { data: hooks } = await db
    .from('hooks')
    .select('pattern_id, engagement_score');

  if (!hooks || hooks.length === 0) return;

  const stats: Record<string, { count: number; totalEng: number }> = {};
  for (const h of hooks) {
    if (!h.pattern_id) continue;
    if (!stats[h.pattern_id]) stats[h.pattern_id] = { count: 0, totalEng: 0 };
    stats[h.pattern_id].count++;
    stats[h.pattern_id].totalEng += h.engagement_score || 0;
  }

  // Update each pattern
  for (const [patternId, { count, totalEng }] of Object.entries(stats)) {
    await db.from('patterns').update({
      example_count: count,
      avg_engagement: count > 0 ? Math.round(totalEng / count) : 0,
    }).eq('id', patternId);
  }
}
