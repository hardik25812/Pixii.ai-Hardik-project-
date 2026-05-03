import Anthropic from '@anthropic-ai/sdk';
import type { RawPost } from './scraper';

export const PATTERN_NAMES = [
  'The Rejection List',
  'The Screenshot Reveal',
  'The Contrarian Take',
  'The Personal Story Arc',
  'The Data Drop',
  'The Bold Claim + Evidence',
  'Other',
] as const;

export type PatternName = (typeof PATTERN_NAMES)[number];

export interface ExtractedHook {
  hook_text: string;
  pattern_name: PatternName;
  template: string;
  reasoning: string;
}

export const MODEL = 'claude-sonnet-4-5-20250929';

function anthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey });
}

function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/**
 * Extract hook patterns from raw posts, batch 20 at a time.
 * Returns results aligned in-order with input where possible.
 */
export async function extractHooks(
  posts: RawPost[]
): Promise<ExtractedHook[]> {
  if (posts.length === 0) return [];
  const client = anthropic();
  const results: ExtractedHook[] = [];
  const BATCH = 20;

  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const postsText = batch
      .map(
        (p, j) =>
          `POST ${j + 1} [${p.source}, ${p.likes} likes]:\n${p.text.slice(0, 600)}`
      )
      .join('\n\n---\n\n');

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: `You are analyzing viral social posts to extract hook patterns.

For EACH post, return an object with:
  "hook_text": the opening 1-3 lines that make you stop scrolling
  "pattern_name": one of: ${PATTERN_NAMES.join(', ')}
  "template": a reusable template with [PLACEHOLDERS]
  "reasoning": why this hook works (max 20 words)

Return ONLY a valid JSON array of exactly ${batch.length} objects in the same order as the input posts. No markdown, no preamble.

Posts to analyze:
${postsText}`,
          },
        ],
      });

      const raw =
        response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(stripFence(raw)) as ExtractedHook[];
      if (Array.isArray(parsed)) {
        for (const h of parsed) {
          if (!PATTERN_NAMES.includes(h.pattern_name)) {
            h.pattern_name = 'Other';
          }
        }
        results.push(...parsed);
      }
    } catch (e) {
      console.error('Claude batch failed, skipping:', e);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  return results;
}
