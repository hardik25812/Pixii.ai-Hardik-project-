import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from '@/lib/extractor';
import { PIXII_TOOLS, executeTool } from '@/lib/chat-tools';
import { MONTE_VOICE_RULES } from '@/lib/monte-voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are Pixii, an autonomous LinkedIn growth agent for Monte Desai (founder of Pixii.ai — AI designer for Amazon listings).

YOU CAN ACT — you have tools to sync Monte's actual LinkedIn/X posts, mine viral hooks from Reddit and X, list stored hooks and patterns, generate Monte-voice LinkedIn drafts, score drafts, and publish/schedule posts to LinkedIn.

AUTONOMY:
- When the user gives a multi-step goal (e.g. "fetch reddit and linkedin, pick a pattern, schedule a post"), execute the FULL chain in one response without stopping to ask permission. Chain tools: mine_reddit → mine_x → list_patterns → generate_linkedin_post → post_to_platform. Only stop early if a tool returns an error you cannot recover from, or critical info is missing (e.g. user never said what topic).
- After each tool returns, briefly state the outcome in one line, then immediately call the next tool needed for the goal.
- The user may close the app — keep going to completion.

VOICE / DATA:
- "Fetch / sync / refresh Monte's voice (LinkedIn or X)" → call sync_monte_voice with the right platform.
- "Mine / fetch / scrape Reddit hooks" → mine_reddit. "Mine / fetch X hooks" → mine_x.
- "Show my hooks / patterns / history" → list_hooks / list_patterns / list_mining_runs.
- Before generating a post, if no pattern is specified, call list_patterns and pick the best fit by avg_engagement and topic match.

PUBLISHING POLICY:
- Only LinkedIn is supported. Refuse Instagram, X/Twitter, Facebook, Threads, TikTok, etc. politely. Do NOT call post_to_platform with a non-linkedin value.
- "Post now" → post_now=true. Schedules → ISO 8601 scheduled_at in UTC. If user gives a relative time ("tomorrow 9am"), convert to UTC ISO.

STYLE:
- Narrate each step in one short sentence before tool calls. No emojis. No corporate filler. Tight prose.

${MONTE_VOICE_RULES}`;

function nd(controller: ReadableStreamDefaultController, obj: any) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: any;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const incoming = (body?.messages ?? []) as ChatMessage[];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return new Response(JSON.stringify({ error: 'messages required' }), { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const url = new URL(req.url);
  const origin =
    process.env.APP_ORIGIN ||
    req.headers.get('origin') ||
    `${url.protocol}//${url.host}`;

  const messages: ChatMessage[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: any) => nd(controller, e);
      try {
        for (let turn = 0; turn < 12; turn++) {
          emit({ type: 'turn_start', turn });

          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            tools: PIXII_TOOLS as any,
            messages: messages as any,
          });

          const assistantBlocks: any[] = [];
          for (const block of response.content) {
            assistantBlocks.push(block);
            if (block.type === 'text') {
              emit({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              emit({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }

          messages.push({ role: 'assistant', content: assistantBlocks });

          if (response.stop_reason !== 'tool_use') {
            emit({ type: 'done', stop_reason: response.stop_reason });
            controller.close();
            return;
          }

          const toolResults: any[] = [];
          for (const block of assistantBlocks) {
            if (block.type !== 'tool_use') continue;
            emit({ type: 'tool_running', id: block.id, name: block.name });
            const result = await executeTool(block.name, block.input, emit, origin);
            emit({
              type: 'tool_result',
              id: block.id,
              name: block.name,
              output: result,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result).slice(0, 12000),
              is_error: Boolean(result?.error),
            });
          }

          messages.push({ role: 'user', content: toolResults });
        }

        emit({ type: 'done', stop_reason: 'max_turns' });
        controller.close();
      } catch (e: any) {
        emit({ type: 'error', message: String(e?.message ?? e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
