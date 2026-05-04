import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { supabaseAdmin, hasSupabaseConfig } from './supabase';
import { scrapeReddit, scrapeTwitter, scrapeRedditByKeywords, scrapeTwitterByKeywords, type RawPost } from './scraper';
import { extractHooks, MODEL } from './extractor';
import { ensurePatterns, insertHooks, recordMiningRun, refreshPatternStats } from './ingest';
import { MONTE_VOICE_EXAMPLES, MONTE_VOICE_RULES } from './monte-voice';

export type EmitFn = (event: any) => void;

export interface ToolDef {
  name: string;
  description: string;
  input_schema: any;
}

const DEFAULT_N8N_WEBHOOK_URL =
  'https://n8n.srv1546601.hstgr.cloud/webhook/pixii-linkedin-post';

export const PIXII_TOOLS: ToolDef[] = [
  {
    name: 'sync_monte_voice',
    description:
      "Refresh Monte's actual LinkedIn and/or X posts so voice scoring and drafting use the latest data. Use when the user asks to fetch / sync / refresh Monte's voice or LinkedIn / X posts. Pass platform='linkedin', 'x', or 'both' (default).",
    input_schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['linkedin', 'x', 'both'],
          description: "Which Monte source to refresh. Default 'both'.",
        },
      },
    },
  },
  {
    name: 'mine_reddit',
    description:
      'Scrape recent top posts from Reddit, extract viral hook patterns with Claude, and store them in the database. Use when the user asks to mine, fetch, scrape, or refresh Reddit hooks. Returns counts and the top extracted hooks. Slow (30-90s).',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max posts to analyze. Default 30.',
        },
      },
    },
  },
  {
    name: 'mine_x',
    description:
      'Scrape recent X / Twitter posts via search and extract hook patterns. Use when the user asks to mine, fetch, scrape, or refresh X/Twitter hooks. Slow (30-90s).',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max posts to analyze. Default 30.',
        },
      },
    },
  },
  {
    name: 'list_hooks',
    description:
      'List the most recent or top-performing hooks already stored in the database. Use to review the mine before generating posts.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        sort: { type: 'string', enum: ['engagement', 'virality', 'recent'] },
        pattern_id: { type: 'string' },
      },
    },
  },
  {
    name: 'list_patterns',
    description: 'List all hook patterns with their stats.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_mining_runs',
    description: 'Show the recent mining run history.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'generate_linkedin_post',
    description:
      "Generate 3 LinkedIn post drafts in Monte's voice using a specific pattern. Requires a pattern_id (use list_patterns first if needed) and a topic.",
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        pattern_id: { type: 'string' },
      },
      required: ['topic', 'pattern_id'],
    },
  },
  {
    name: 'score_voice',
    description: "Score a draft against Monte's voice fingerprint (0-100).",
    input_schema: {
      type: 'object',
      properties: { draft: { type: 'string' } },
      required: ['draft'],
    },
  },
  {
    name: 'fetch_viral_hooks',
    description:
      'Scrape Reddit and/or X RIGHT NOW with dynamic keywords the user provides, extract viral hooks with Claude, and return them. Use when the user says things like "find me viral hooks about AI agents" or "what\'s trending on Reddit about ecommerce". The keywords are fully dynamic — whatever the user asks for. After returning hooks, you can draft posts using them.',
    input_schema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dynamic search keywords/topics to scrape. E.g. ["AI agents", "ecommerce growth", "Amazon FBA tips"]. Pick 2-5 keywords based on what the user asked for.',
        },
        sources: {
          type: 'string',
          enum: ['reddit', 'x', 'both'],
          description: "Which platforms to scrape. Default 'both'.",
        },
        limit: {
          type: 'number',
          description: 'Max posts to scrape per source. Default 40, max 80.',
        },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'post_to_platform',
    description:
      'Publish or schedule a post. ONLY the linkedin platform is supported. Any other platform (instagram, x, twitter, facebook, threads, tiktok, etc.) MUST be rejected — return an error explaining only LinkedIn is supported. Set post_now=true for immediate, or pass an ISO scheduled_at timestamp.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string' },
        content: { type: 'string' },
        scheduled_at: { type: 'string' },
        post_now: { type: 'boolean' },
        linkedin_person: { type: 'string' },
      },
      required: ['platform', 'content'],
    },
  },
];

function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

async function runMine(
  source: 'reddit' | 'twitter',
  limit: number | undefined,
  emit: EmitFn
) {
  if (!hasSupabaseConfig()) {
    return { error: 'Supabase is not configured on this server.' };
  }
  const cap = Math.max(5, Math.min(60, limit ?? 30));

  emit({ type: 'tool_progress', message: `Scraping ${source}…` });
  let posts: RawPost[] = [];
  try {
    posts = source === 'reddit' ? await scrapeReddit() : await scrapeTwitter();
  } catch (e: any) {
    await recordMiningRun({
      source,
      status: 'error',
      message: String(e?.message ?? e),
    });
    return { error: `Scrape failed: ${String(e?.message ?? e)}` };
  }

  const sliced = posts.slice(0, cap);
  emit({
    type: 'tool_progress',
    message: `Scraped ${posts.length} posts. Analyzing top ${sliced.length} with Claude…`,
  });

  if (sliced.length === 0) {
    await recordMiningRun({ source, status: 'empty', message: 'No posts found' });
    return { posts_scraped: 0, hooks_extracted: 0, hooks_stored: 0 };
  }

  const hooks = await extractHooks(sliced);
  emit({
    type: 'tool_progress',
    message: `Extracted ${hooks.length} hook patterns. Storing…`,
  });

  const patternMap = await ensurePatterns(hooks.map((h) => h.pattern_name));
  const result = await insertHooks(hooks, sliced, patternMap);
  await refreshPatternStats();

  await recordMiningRun({
    source,
    status: 'success',
    postsScraped: sliced.length,
    hooksExtracted: hooks.length,
    hooksStored: result.stored,
    message: `Mined ${sliced.length} posts, stored ${result.stored} hooks.`,
  });

  return {
    posts_scraped: sliced.length,
    hooks_extracted: hooks.length,
    hooks_stored: result.stored,
    top_hooks: hooks.slice(0, 6).map((h) => ({
      hook_text: h.hook_text,
      pattern_name: h.pattern_name,
      reasoning: h.reasoning,
    })),
  };
}

async function listHooks(input: any) {
  if (!hasSupabaseConfig()) return { error: 'Supabase not configured' };
  const db = supabaseAdmin();
  const limit = Math.min(Number(input?.limit ?? 12), 50);
  const sort: string = input?.sort ?? 'engagement';
  let q = db
    .from('hooks')
    .select(
      'id, hook_text, source, source_url, engagement_score, virality_score, reasoning, pattern_id, scraped_at, patterns(name)'
    )
    .limit(limit);
  if (input?.pattern_id) q = q.eq('pattern_id', input.pattern_id);
  if (sort === 'recent') q = q.order('scraped_at', { ascending: false });
  else if (sort === 'virality')
    q = q.order('virality_score', { ascending: false, nullsFirst: false });
  else q = q.order('engagement_score', { ascending: false });
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { hooks: data ?? [] };
}

async function listPatterns() {
  if (!hasSupabaseConfig()) return { error: 'Supabase not configured' };
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('patterns')
    .select('id, name, template, description, example_count, avg_engagement')
    .order('avg_engagement', { ascending: false });
  if (error) return { error: error.message };
  return { patterns: data ?? [] };
}

async function listMiningRuns(input: any) {
  if (!hasSupabaseConfig()) return { error: 'Supabase not configured' };
  const db = supabaseAdmin();
  const limit = Math.min(Number(input?.limit ?? 10), 50);
  const { data, error } = await db
    .from('mining_runs')
    .select('id, source, status, posts_scraped, hooks_extracted, hooks_stored, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  return { runs: data ?? [] };
}

async function generateLinkedinPost(input: any, emit: EmitFn) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' };
  if (!input?.topic || !input?.pattern_id)
    return { error: 'topic and pattern_id are required' };

  if (!hasSupabaseConfig()) return { error: 'Supabase not configured' };
  const db = supabaseAdmin();
  const { data: pattern, error: pErr } = await db
    .from('patterns')
    .select('id, name, template, description')
    .eq('id', input.pattern_id)
    .single();
  if (pErr || !pattern) return { error: 'Pattern not found' };

  const { data: examples } = await db
    .from('hooks')
    .select('hook_text, engagement_score')
    .eq('pattern_id', input.pattern_id)
    .order('engagement_score', { ascending: false })
    .limit(5);

  const exampleHooks =
    (examples ?? [])
      .map(
        (e, i) =>
          `HOOK ${i + 1} (${e.engagement_score} engagement):\n${e.hook_text}`
      )
      .join('\n\n') || '(no examples yet — rely on voice rules)';

  emit({ type: 'tool_progress', message: `Drafting in Monte's voice…` });

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are writing LinkedIn posts for Monte Desai, founder of Pixii.ai (AI designer for Amazon listings).

${MONTE_VOICE_EXAMPLES}

${MONTE_VOICE_RULES}

PATTERN TO USE: ${pattern.name}
TEMPLATE: ${pattern.template}
DESCRIPTION: ${pattern.description}

TOP PERFORMING HOOKS IN THIS PATTERN:
${exampleHooks}

TOPIC: ${input.topic}

Write exactly 3 different post drafts using this pattern and Monte's voice.
Return ONLY valid JSON:
{ "draft_1": "...", "draft_2": "...", "draft_3": "..." }`,
      },
    ],
  });
  const raw =
    response.content[0]?.type === 'text' ? response.content[0].text : '{}';
  let drafts: any;
  try {
    drafts = JSON.parse(stripFence(raw));
  } catch {
    return { error: 'Model returned invalid JSON', raw };
  }
  await db
    .from('generated_posts')
    .insert({ topic: input.topic, pattern_id: input.pattern_id, ...drafts });
  const voice_scores = await Promise.all(
    [drafts.draft_1, drafts.draft_2, drafts.draft_3].map((draft) =>
      draft ? scoreVoice({ draft }) : Promise.resolve(null)
    )
  );

  return { ...drafts, voice_scores, pattern_name: pattern.name, pattern_id: pattern.id };
}

async function getMonteRecentPosts(): Promise<string> {
  if (!hasSupabaseConfig()) return '';

  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from('monte_posts')
      .select('post_text, likes, comments')
      .order('scraped_at', { ascending: false })
      .limit(15);

    if (!data || data.length === 0) return '';

    return data
      .map(
        (p, i) =>
          `RECENT POST ${i + 1} (${p.likes} likes, ${p.comments} comments):\n${(p.post_text ?? '').slice(0, 500)}`
      )
      .join('\n\n');
  } catch {
    return '';
  }
}

async function scoreVoice(input: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: 'OPENAI_API_KEY not configured' };
  if (!input?.draft) return { error: 'draft is required' };
  const openai = new OpenAI({ apiKey });
  const recentPosts = await getMonteRecentPosts();
  const dynamicExamples = recentPosts
    ? `MONTE'S ACTUAL RECENT LINKEDIN POSTS (scraped live — use these as the PRIMARY voice reference):\n${recentPosts}\n\nADDITIONAL REFERENCE EXAMPLES:\n${MONTE_VOICE_EXAMPLES}`
    : `MONTE'S LINKEDIN POSTS (reference examples):\n${MONTE_VOICE_EXAMPLES}`;
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: `You are a writing-style analyst. You score LinkedIn post drafts against Monte Desai's exact voice fingerprint.

IMPORTANT: Score HONESTLY based on how closely the draft matches Monte's actual writing patterns. Do NOT default to any particular score. Analyze each dimension independently.

${dynamicExamples}

${MONTE_VOICE_RULES}`,
      },
      {
        role: 'user',
        content: `Score this draft against Monte's voice. Be precise and honest — do not default to any particular score.

Return ONLY valid JSON, no markdown fences, no preamble:
{
  "total": <weighted percentage 0-100>,
  "sentenceLength": <0-10>,
  "numberDensity": <0-10>,
  "hookStrength": <0-10>,
  "fillerWords": <0-10>,
  "parentheticals": <0-10>,
  "lineBreakRhythm": <0-10>,
  "feedback": "<one-sentence actionable tip to sound more like Monte>"
}

Draft:
${input.draft}`,
      },
    ],
  });
  const raw = r.choices[0]?.message?.content ?? '{}';
  try {
    return { ...JSON.parse(stripFence(raw)), _source: recentPosts ? 'openai+live_posts' : 'openai+static_examples' };
  } catch {
    return { error: 'Invalid JSON', raw };
  }
}

async function postToPlatform(input: any) {
  const platform = String(input?.platform ?? '').toLowerCase().trim();
  if (platform !== 'linkedin') {
    return {
      error: `Platform "${input?.platform}" is not supported. Pixii currently only posts to LinkedIn.`,
      supported: ['linkedin'],
    };
  }
  if (!input?.content?.trim()) return { error: 'content is required' };
  if (!input?.post_now && !input?.scheduled_at) {
    return { error: 'scheduled_at is required unless post_now is true' };
  }

  const webhookUrl =
    process.env.N8N_LINKEDIN_WEBHOOK_URL || DEFAULT_N8N_WEBHOOK_URL;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      scheduled_at: input.scheduled_at,
      post_now: Boolean(input.post_now),
      linkedin_person: input.linkedin_person,
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    return { error: 'n8n webhook failed', status: res.status, data };
  }
  return {
    ok: true,
    status: input.post_now ? 'posted' : 'scheduled',
    scheduled_at: input.scheduled_at ?? null,
    data,
  };
}

async function fetchViralHooks(input: any, emit: EmitFn) {
  const keywords: string[] = input?.keywords ?? [];
  if (keywords.length === 0) return { error: 'At least one keyword is required.' };

  const sources = String(input?.sources ?? 'both').toLowerCase();
  const limit = Math.min(Math.max(Number(input?.limit ?? 40), 5), 80);
  const allPosts: RawPost[] = [];
  const sourceResults: Record<string, number> = {};

  // Scrape Reddit
  if (sources === 'reddit' || sources === 'both') {
    emit({ type: 'tool_progress', message: `Searching Reddit for: ${keywords.join(', ')}…` });
    try {
      const rPosts = await scrapeRedditByKeywords(keywords, limit);
      allPosts.push(...rPosts);
      sourceResults.reddit = rPosts.length;
    } catch (e: any) {
      sourceResults.reddit_error = e?.message ?? String(e);
    }
  }

  // Scrape X
  if (sources === 'x' || sources === 'both') {
    emit({ type: 'tool_progress', message: `Searching X for: ${keywords.join(', ')}…` });
    try {
      const xPosts = await scrapeTwitterByKeywords(keywords, limit);
      allPosts.push(...xPosts);
      sourceResults.x = xPosts.length;
    } catch (e: any) {
      sourceResults.x_error = e?.message ?? String(e);
    }
  }

  if (allPosts.length === 0) {
    return { error: 'No posts found for those keywords.', source_results: sourceResults };
  }

  // Sort by engagement and take top posts
  const top = allPosts
    .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
    .slice(0, limit);

  emit({
    type: 'tool_progress',
    message: `Found ${top.length} posts. Extracting viral hooks with Claude…`,
  });

  // Extract hooks
  const hooks = await extractHooks(top);

  emit({
    type: 'tool_progress',
    message: `Extracted ${hooks.length} viral hooks from ${top.length} posts.`,
  });

  // Optionally store in DB if Supabase is configured
  let stored = 0;
  if (hasSupabaseConfig() && hooks.length > 0) {
    try {
      const patternMap = await ensurePatterns(hooks.map((h) => h.pattern_name));
      const result = await insertHooks(hooks, top, patternMap);
      stored = result.stored;
      await refreshPatternStats();
    } catch { /* non-critical */ }
  }

  return {
    keywords,
    sources_scraped: sourceResults,
    posts_found: top.length,
    hooks_extracted: hooks.length,
    hooks_stored: stored,
    hooks: hooks.slice(0, 10).map((h) => ({
      hook_text: h.hook_text,
      pattern_name: h.pattern_name,
      reasoning: h.reasoning,
    })),
    top_posts: top.slice(0, 5).map((p) => ({
      text: p.text.slice(0, 200),
      url: p.url,
      source: p.source,
      likes: p.likes,
      comments: p.comments,
    })),
  };
}

async function syncMonteVoice(input: any, emit: EmitFn, origin: string) {
  const platform = String(input?.platform ?? 'both').toLowerCase();
  const targets: string[] = [];
  if (platform === 'linkedin' || platform === 'both') targets.push('/api/scrape-monte');
  if (platform === 'x' || platform === 'twitter' || platform === 'both')
    targets.push('/api/scrape-monte-x');
  if (targets.length === 0) return { error: `Unknown platform: ${input?.platform}` };

  const results: Record<string, any> = {};
  for (const path of targets) {
    const label = path.includes('-x') ? 'x' : 'linkedin';
    emit({ type: 'tool_progress', message: `Syncing Monte ${label} via Apify…` });
    try {
      const res = await fetch(`${origin}${path}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      results[label] = data;
    } catch (e: any) {
      results[label] = { error: String(e?.message ?? e) };
    }
  }
  return results;
}

export async function executeTool(
  name: string,
  input: any,
  emit: EmitFn,
  origin: string
): Promise<any> {
  try {
    switch (name) {
      case 'sync_monte_voice':
        return await syncMonteVoice(input, emit, origin);
      case 'mine_reddit':
        return await runMine('reddit', input?.limit, emit);
      case 'mine_x':
        return await runMine('twitter', input?.limit, emit);
      case 'list_hooks':
        return await listHooks(input);
      case 'list_patterns':
        return await listPatterns();
      case 'list_mining_runs':
        return await listMiningRuns(input);
      case 'generate_linkedin_post':
        return await generateLinkedinPost(input, emit);
      case 'score_voice':
        return await scoreVoice(input);
      case 'fetch_viral_hooks':
        return await fetchViralHooks(input, emit);
      case 'post_to_platform':
        return await postToPlatform(input);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}
