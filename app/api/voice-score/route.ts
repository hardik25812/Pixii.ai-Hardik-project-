import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MONTE_VOICE_EXAMPLES, MONTE_VOICE_RULES } from '@/lib/monte-voice';
import { hasSupabaseConfig, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Fetch Monte's real LinkedIn posts from the DB.
 * These are scraped via Apify and stored in monte_posts.
 * Falls back to the static MONTE_VOICE_EXAMPLES if none exist.
 */
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

export async function POST(req: Request) {
  try {
    const { draft } = (await req.json()) as { draft?: string };
    if (!draft) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Dynamically fetch Monte's real recent posts
    const recentPosts = await getMonteRecentPosts();

    const dynamicExamples = recentPosts
      ? `MONTE'S ACTUAL RECENT LINKEDIN POSTS (scraped live — use these as the PRIMARY voice reference):\n${recentPosts}\n\nADDITIONAL REFERENCE EXAMPLES:\n${MONTE_VOICE_EXAMPLES}`
      : `MONTE'S LINKEDIN POSTS (reference examples):\n${MONTE_VOICE_EXAMPLES}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You are a writing-style analyst. You score LinkedIn post drafts against Monte Desai's exact voice fingerprint.

IMPORTANT: Score HONESTLY based on how closely the draft matches Monte's actual writing patterns. Do NOT default to any particular score. Analyze each dimension independently.

${dynamicExamples}

${MONTE_VOICE_RULES}

MONTE'S MEASURABLE STYLE FINGERPRINT (derived from his actual posts):
- Average sentence length: ~7 words (short, punchy, staccato rhythm)
- Heavy use of specific numbers (never "many" or "some" — always "3,000" or "17")
- First line (the hook) is always ≤10 words — designed for LinkedIn's "see more" fold
- Zero corporate filler words (no "however", "therefore", "furthermore", "leveraging", "landscape", "synergy", "utilize", "facilitate", "paradigm")
- Parenthetical asides for texture: (it worked) (we're hiring) (still broken)
- Very short paragraphs — lots of line breaks between thoughts
- Dashes for lists, never bullet points
- No emojis, no hashtags in body
- Ends with a kicker, question, or action CTA

SCORING RULES:
- Score each dimension independently from 0-10
- 10 = indistinguishable from Monte's actual writing
- 0 = completely unlike Monte's style
- Be precise — a draft with long sentences should get 2-3 on sentenceLength, not 7-8
- The total should be a WEIGHTED average: hookStrength 25%, sentenceLength 20%, fillerWords 15%, numberDensity 15%, lineBreakRhythm 15%, parentheticals 10%

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
}`,
        },
        {
          role: 'user',
          content: `Score this draft against Monte's voice. Be precise and honest — do not default to any particular score:\n\n${draft}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let scores;
    try {
      scores = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON', raw }, { status: 502 });
    }

    // Tag source for transparency
    scores._source = recentPosts ? 'openai+live_posts' : 'openai+static_examples';

    return NextResponse.json(scores);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
