import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { MONTE_VOICE_EXAMPLES, MONTE_VOICE_RULES } from '@/lib/monte-voice';
import { MODEL } from '@/lib/extractor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export async function POST(req: Request) {
  try {
    const { topic, pattern_id } = (await req.json()) as {
      topic?: string;
      pattern_id?: string;
    };

    if (!topic || !pattern_id) {
      return NextResponse.json(
        { error: 'topic and pattern_id are required' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: pattern, error: pErr } = await db
      .from('patterns')
      .select('id, name, template, description')
      .eq('id', pattern_id)
      .single();

    if (pErr || !pattern) {
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    }

    const { data: examples } = await db
      .from('hooks')
      .select('hook_text, engagement_score')
      .eq('pattern_id', pattern_id)
      .order('engagement_score', { ascending: false })
      .limit(5);

    const exampleHooks =
      (examples ?? [])
        .map((e, i) => `HOOK ${i + 1} (${e.engagement_score} engagement):\n${e.hook_text}`)
        .join('\n\n') || '(no examples yet — rely on voice rules)';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }
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

TOP PERFORMING HOOKS IN THIS PATTERN (study the rhythm, don't copy):
${exampleHooks}

TOPIC: ${topic}

Write exactly 3 different post drafts using this pattern and Monte's voice.
Each draft must:
- Open with 2 lines that could survive LinkedIn's "see more" fold.
- Use specific numbers (invent plausible ones if needed — sound real, not round).
- Tie back to Pixii's world (Amazon sellers, listings, AI imagery, founder ops) when the topic allows.
- End with a one-line kicker, a question, or an action CTA.
- Feel genuinely different from the other 2 (different angle/opening/kicker).

Return ONLY valid JSON. No markdown fences. No preamble.
{
  "draft_1": "full post text with \\n for line breaks",
  "draft_2": "full post text with \\n for line breaks",
  "draft_3": "full post text with \\n for line breaks"
}`,
        },
      ],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    let drafts: { draft_1: string; draft_2: string; draft_3: string };
    try {
      drafts = JSON.parse(stripFence(raw));
    } catch {
      return NextResponse.json(
        { error: 'Model returned invalid JSON', raw },
        { status: 502 }
      );
    }

    await db.from('generated_posts').insert({
      topic,
      pattern_id,
      ...drafts,
    });

    return NextResponse.json({ ...drafts, pattern: pattern.name });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
