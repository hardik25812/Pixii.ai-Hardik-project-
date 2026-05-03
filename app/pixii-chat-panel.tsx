'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ─── Types ────────────────────────────────────────────────────── */
type Block =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: any;
      status: 'pending' | 'running' | 'done' | 'error';
      progress: string[];
      output?: any;
    };

interface Message {
  role: 'user' | 'assistant';
  blocks: Block[];
  dbId?: string;
}

interface Thread {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  loaded: boolean;
}

const SUGGESTIONS = [
  'Fetch latest Monte voice on LinkedIn',
  'Mine fresh Reddit hooks now',
  'Fetch Reddit and X, pick a pattern, draft and schedule a post about hiring filters tomorrow 9am',
  'Show my top 10 hooks',
];

function uid(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatToolName(n: string) {
  return n.replace(/_/g, ' ');
}

const DIMENSIONS = [
  { key: 'sentenceLength', label: 'Sentence length' },
  { key: 'numberDensity', label: 'Number density' },
  { key: 'hookStrength', label: 'Hook strength' },
  { key: 'fillerWords', label: 'Filler words' },
  { key: 'parentheticals', label: 'Parentheticals' },
  { key: 'lineBreakRhythm', label: 'Line-break rhythm' },
] as const;

function cleanAssistantText(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/---+/g, '—');
}

function Bar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
  return (
    <span className="mono text-xs tracking-tight">
      <span className="text-accent">{'█'.repeat(safe)}</span>
      <span className="text-[var(--border)]">{'░'.repeat(10 - safe)}</span>
    </span>
  );
}

function totalColor(t: number) {
  if (t >= 80) return 'text-green-600';
  if (t >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function totalBg(t: number) {
  if (t >= 80) return 'bg-green-50 border-green-200';
  if (t >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function StreamingText({ text, animate }: { text: string; animate: boolean }) {
  const cleaned = cleanAssistantText(text);
  const chars = Array.from(cleaned);
  if (!animate) {
    return <>{cleaned}</>;
  }
  return (
    <>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="chat-word"
          style={{ animationDelay: `${i * (ch === ' ' || ch === '\n' ? 0.012 : 0.022)}s` }}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

function VoiceScoreCard({ output }: { output: any }) {
  if (!output || output.error) {
    return (
      <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        {output?.error ?? 'Voice score unavailable'}
      </div>
    );
  }

  const total: number = output.total ?? 0;

  return (
    <div className="mt-3 rounded-2xl border hairline bg-card p-5 shadow-xl">
      <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 ${totalBg(total)}`}>
        <span className="text-sm font-black text-ink">Overall Voice Match</span>
        <span className={`mono text-2xl font-black ${totalColor(total)}`}>{total}%</span>
      </div>

      <div className="space-y-2">
        {DIMENSIONS.map(({ key, label }, i) => {
          const v = Number(output[key]) || 0;
          const connector = i === DIMENSIONS.length - 1 ? '└' : '├';
          return (
            <div key={key} className="flex items-center gap-2 font-mono text-xs text-ink">
              <span className="select-none text-[var(--border)]">{connector}──</span>
              <span className="w-[7.5rem] shrink-0 font-semibold">{label}</span>
              <Bar value={v} />
              <span className="ml-1 w-8 text-right font-bold text-muted">{v}/10</span>
            </div>
          );
        })}
      </div>

      {output.feedback && (
        <div className="mt-4 rounded-xl bg-accent-light px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wider text-accent">AI Tip</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-ink">{output.feedback}</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
          output._source?.includes('live_posts') ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {output._source?.includes('live_posts') ? 'Scored via OpenAI + Live Posts' : 'Scored via OpenAI'}
        </span>
      </div>
    </div>
  );
}

/* ─── Tool card ─────────────────────────────────────────────────── */
function ToolCard({ block, animateDrafts = false }: { block: Extract<Block, { kind: 'tool' }>; animateDrafts?: boolean }) {
  const [open, setOpen] = useState(true);
  const statusLabel =
    block.status === 'running' ? 'Running'
    : block.status === 'done' && !block.output?.error ? 'Done'
    : block.status === 'done' && block.output?.error ? 'Error'
    : block.status === 'error' ? 'Error'
    : 'Pending';

  const isHookList   = block.name === 'list_hooks'             && Array.isArray(block.output?.hooks);
  const isMineResult = (block.name === 'mine_reddit' || block.name === 'mine_x') && Array.isArray(block.output?.top_hooks);
  const isPatterns   = block.name === 'list_patterns'          && Array.isArray(block.output?.patterns);
  const isRuns       = block.name === 'list_mining_runs'       && Array.isArray(block.output?.runs);
  const isDrafts     = block.name === 'generate_linkedin_post' && block.output && (block.output.draft_1 || block.output.draft_2);
  const isPostResult = block.name === 'post_to_platform'       && block.output?.ok === true;
  const isMonteSync  = block.name === 'sync_monte_voice'       && block.output && !block.output.error;
  const isVoice      = block.name === 'score_voice';

  return (
    <div className="my-3 overflow-hidden rounded-2xl border hairline bg-white/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${
            block.status === 'running' ? 'animate-pulse bg-amber-400'
            : statusLabel === 'Done'   ? 'bg-emerald-500'
            : statusLabel === 'Error'  ? 'bg-red-500'
            : 'bg-slate-300'
          }`} />
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.13em] text-ink">
            {formatToolName(block.name)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
            {statusLabel}
          </span>
        </div>
        <span className="text-[11px] text-muted">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t hairline px-4 pb-4 pt-3">
          {/* Input params */}
          {block.status !== 'done' && Object.keys(block.input ?? {}).length > 0 && (
            <pre className="mono mb-3 max-h-28 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-5 text-slate-600">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          )}
          {/* Live progress */}
          {block.progress.length > 0 && block.status === 'running' && (
            <ul className="mb-3 space-y-1">
              {block.progress.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />{p}
                </li>
              ))}
            </ul>
          )}
          {/* Error */}
          {block.status === 'done' && block.output?.error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {String(block.output.error)}
            </div>
          )}
          {/* Rich output */}
          {block.status === 'done' && !block.output?.error && (
            <>
              {isVoice    && <VoiceScoreCard output={block.output} />}
              {isHookList && <HookGrid hooks={block.output.hooks} />}
              {isMineResult && (
                <>
                  <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                    <StatPill label="scraped" value={block.output.posts_scraped} />
                    <StatPill label="hooks"   value={block.output.hooks_extracted} />
                    <StatPill label="stored"  value={block.output.hooks_stored} accent />
                  </div>
                  <HookGrid hooks={block.output.top_hooks} compact />
                </>
              )}
              {isMonteSync && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(block.output).map(([k, v]: any) => (
                    <div key={k} className="rounded-xl bg-slate-50 p-3 text-xs">
                      <div className="mb-1 font-black uppercase tracking-wider text-ink">{k}</div>
                      {v?.error
                        ? <div className="text-red-700">{String(v.error)}</div>
                        : <div className="space-y-0.5 text-muted">
                            <div>scraped: <b className="text-ink">{v?.posts_scraped ?? v?.tweets_scraped ?? 0}</b></div>
                            <div>stored: <b className="text-accent">{v?.posts_stored ?? v?.tweets_stored ?? 0}</b></div>
                          </div>
                      }
                    </div>
                  ))}
                </div>
              )}
              {isPatterns && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {block.output.patterns.slice(0, 8).map((p: any) => (
                    <div key={p.id} className="rounded-xl border hairline bg-white p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{p.example_count ?? 0} hooks · avg {Math.round(p.avg_engagement ?? 0)}</div>
                      <div className="mono mt-1.5 text-[10px] text-slate-400">id: {p.id.slice(0,8)}…</div>
                    </div>
                  ))}
                </div>
              )}
              {isRuns && (
                <ul className="space-y-1.5">
                  {block.output.runs.map((r: any) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-bold capitalize">{r.source}</span>
                      <span className="text-muted">{r.posts_scraped} posts · {r.hooks_stored} stored</span>
                      <span className="mono text-[10px] text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isDrafts && (
                <div className="space-y-4">
                  {[1,2,3].map((i) => {
                    const txt = block.output[`draft_${i}`];
                    const score = block.output.voice_scores?.[i - 1];
                    if (!txt) return null;
                    return (
                      <div key={i} className="w-full rounded-2xl border hairline bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-ink">
                            Draft {i}{block.output.pattern_name ? ` · ${block.output.pattern_name}` : ''}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(txt)}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-accent-light"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="hook-text min-h-[7rem] whitespace-pre-wrap text-[13px] leading-6 text-ink">
                          <StreamingText text={txt} animate={animateDrafts} />
                        </p>
                        {score && <VoiceScoreCard output={score} />}
                      </div>
                    );
                  })}
                </div>
              )}
              {isPostResult && (
                <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
                  ✓ {block.output.status === 'posted' ? 'Posted to LinkedIn.' : `Scheduled for ${block.output.scheduled_at}.`}
                </div>
              )}
              {!isVoice && !isHookList && !isMineResult && !isPatterns && !isRuns && !isDrafts && !isPostResult && !isMonteSync && (
                <pre className="mono max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-5 text-slate-600">
                  {JSON.stringify(block.output, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2">
      <div className={`ticker text-base font-black ${accent ? 'text-accent' : 'text-ink'}`}>{value ?? 0}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function HookGrid({ hooks, compact }: { hooks: any[]; compact?: boolean }) {
  if (!hooks?.length) return <p className="text-xs text-muted">No hooks.</p>;
  return (
    <div className="grid gap-2">
      {hooks.slice(0, compact ? 4 : 8).map((h: any, i: number) => (
        <div key={h.id ?? i} className="rounded-xl border hairline bg-white px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {h.patterns?.name || h.pattern_name || '—'}
            </span>
            {typeof h.engagement_score === 'number' && (
              <span className="mono text-[10px] text-muted">{h.engagement_score} ↑</span>
            )}
          </div>
          <p className="hook-text text-[13px] leading-5 text-ink">{cleanAssistantText(h.hook_text ?? '')}</p>
          {h.reasoning && (
            <p className="mt-1 text-[11px] italic leading-4 text-muted">{h.reasoning}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Message bubble ────────────────────────────────────────────── */
function MessageBubble({ message, isLatestAssistant }: { message: Message; isLatestAssistant: boolean }) {
  if (message.role === 'user') {
    const text = message.blocks.filter((b) => b.kind === 'text').map((b) => (b as any).text).join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-ink px-4 py-2.5 text-sm leading-6 text-white shadow-sm">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {message.blocks.map((b, i) => {
        if (b.kind === 'text') {
          const isLastBlock = i === message.blocks.length - 1;
          return (
            <p
              key={i}
              className="whitespace-pre-wrap text-[15px] leading-7 text-ink"
              style={{ fontFamily: '"Charter","Iowan Old Style","Source Serif Pro",Georgia,serif' }}
            >
              <StreamingText text={b.text} animate={isLatestAssistant && isLastBlock} />
            </p>
          );
        }
        return <ToolCard key={i} block={b} animateDrafts={isLatestAssistant} />;
      })}
    </div>
  );
}

/* ─── Supabase helpers (client-side, via API routes) ───────────── */
async function dbLoadThreads(): Promise<Array<{ id: string; title: string; updated_at: string }>> {
  try {
    const r = await fetch('/api/chat-threads');
    if (!r.ok) return [];
    const d = await r.json();
    return d.threads ?? [];
  } catch { return []; }
}
async function dbUpsertThread(id: string, title: string) {
  try { await fetch('/api/chat-threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, title }) }); } catch {}
}
async function dbDeleteThread(id: string) {
  try { await fetch('/api/chat-threads', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); } catch {}
}
async function dbLoadMessages(threadId: string): Promise<Message[]> {
  try {
    const r = await fetch(`/api/chat-messages?thread_id=${threadId}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.messages ?? []).map((m: any) => ({ role: m.role, blocks: m.blocks ?? [], dbId: m.id }));
  } catch { return []; }
}
async function dbInsertMessage(threadId: string, role: string, blocks: Block[]): Promise<string | undefined> {
  try {
    const r = await fetch('/api/chat-messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId, role, blocks }),
    });
    if (!r.ok) return undefined;
    const d = await r.json();
    return d.id;
  } catch { return undefined; }
}
async function dbUpdateMessage(dbId: string, blocks: Block[]) {
  try {
    await fetch('/api/chat-messages', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: dbId, blocks }),
    });
  } catch {}
}

/* ─── Main component ────────────────────────────────────────────── */
export default function PixiiChatPanel() {
  const [open, setOpen]           = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [sidebarOpen, setSidebar] = useState(true);
  const [input, setInput]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [threads, setThreads]     = useState<Thread[]>([]);
  const [activeId, setActiveId]   = useState<string>('');
  const scrollRef                 = useRef<HTMLDivElement>(null);
  const initDone                  = useRef(false);

  /* ── Boot: load threads list from Supabase ── */
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    (async () => {
      const rows = await dbLoadThreads();
      if (rows.length > 0) {
        const initial: Thread[] = rows.map((r) => ({
          id: r.id, title: r.title, messages: [], updatedAt: new Date(r.updated_at).getTime(), loaded: false,
        }));
        setThreads(initial);
        setActiveId(initial[0].id);
      } else {
        const t: Thread = { id: uid(), title: 'New chat', messages: [], updatedAt: Date.now(), loaded: true };
        setThreads([t]);
        setActiveId(t.id);
        await dbUpsertThread(t.id, t.title);
      }
    })();
  }, []);

  /* ── Load messages when switching threads ── */
  useEffect(() => {
    if (!activeId) return;
    const thread = threads.find((t) => t.id === activeId);
    if (!thread || thread.loaded) return;
    (async () => {
      const msgs = await dbLoadMessages(activeId);
      setThreads((prev) =>
        prev.map((t) => t.id === activeId ? { ...t, messages: msgs, loaded: true } : t)
      );
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, busy, activeId]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);
  const messages     = activeThread?.messages ?? [];

  const updateThread = useCallback((id: string, fn: (t: Thread) => Thread) => {
    setThreads((prev) => prev.map((t) => t.id === id ? fn(t) : t));
  }, []);

  const startNewChat = useCallback(async () => {
    const t: Thread = { id: uid(), title: 'New chat', messages: [], updatedAt: Date.now(), loaded: true };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setInput('');
    await dbUpsertThread(t.id, t.title);
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    await dbDeleteThread(id);
    setThreads((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      if (rest.length === 0) {
        const t: Thread = { id: uid(), title: 'New chat', messages: [], updatedAt: Date.now(), loaded: true };
        dbUpsertThread(t.id, t.title);
        setActiveId(t.id);
        return [t];
      }
      if (id === activeId) setActiveId(rest[0].id);
      return rest;
    });
  }, [activeId]);

  /* ── Send ── */
  async function send(text: string) {
    if (!text.trim() || busy || !activeThread) return;
    setInput('');
    setBusy(true);
    const threadId = activeThread.id;
    const isFirst  = activeThread.messages.length === 0;
    const title    = isFirst ? text.slice(0, 60) : activeThread.title;

    const userMsg: Message  = { role: 'user',      blocks: [{ kind: 'text', text }] };
    const asstMsg: Message  = { role: 'assistant', blocks: [] };

    /* Persist user message + create placeholder assistant row */
    const [userDbId, asstDbId] = await Promise.all([
      dbInsertMessage(threadId, 'user', userMsg.blocks),
      dbInsertMessage(threadId, 'assistant', []),
    ]);
    userMsg.dbId = userDbId;
    asstMsg.dbId = asstDbId;

    updateThread(threadId, (t) => ({
      ...t, title, updatedAt: Date.now(),
      messages: [...t.messages, userMsg, asstMsg],
    }));
    if (isFirst) await dbUpsertThread(threadId, title);

    try {
      /* Build wire messages from history (exclude empty assistant placeholder) */
      const history = [...activeThread.messages, userMsg];
      const wireMessages = history.map((m) => ({
        role: m.role,
        content: m.role === 'user'
          ? m.blocks.filter((b) => b.kind === 'text').map((b) => (b as any).text).join('')
          : (() => {
              const out: any[] = [];
              for (const b of m.blocks) if (b.kind === 'text') out.push({ type: 'text', text: b.text });
              return out.length ? out : 'ok';
            })(),
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: wireMessages }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { applyEvent(threadId, JSON.parse(line)); } catch {}
        }
      }
    } catch (e: any) {
      updateThread(threadId, (t) => {
        const msgs = [...t.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, blocks: [...last.blocks, { kind: 'text', text: `\n\nError: ${String(e?.message ?? e)}` }] };
        }
        return { ...t, messages: msgs };
      });
    } finally {
      /* Persist final assistant blocks */
      setThreads((prev) => {
        const t = prev.find((x) => x.id === threadId);
        if (!t) return prev;
        const last = t.messages[t.messages.length - 1];
        if (last?.role === 'assistant' && last.dbId) {
          dbUpdateMessage(last.dbId, last.blocks);
        }
        return prev;
      });
      setBusy(false);
    }
  }

  function applyEvent(threadId: string, ev: any) {
    updateThread(threadId, (t) => {
      const msgs = t.messages.map((m) => ({ ...m, blocks: [...m.blocks] }));
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'assistant') return t;
      if (ev.type === 'text') {
        last.blocks.push({ kind: 'text', text: ev.text });
      } else if (ev.type === 'tool_use') {
        last.blocks.push({ kind: 'tool', id: ev.id, name: ev.name, input: ev.input, status: 'pending', progress: [] });
      } else if (ev.type === 'tool_running') {
        for (const b of last.blocks) if (b.kind === 'tool' && b.id === ev.id) b.status = 'running';
      } else if (ev.type === 'tool_progress') {
        const tool = [...last.blocks].reverse().find((b): b is Extract<Block, { kind: 'tool' }> => b.kind === 'tool' && b.status === 'running');
        if (tool) tool.progress = [...tool.progress, String(ev.message)];
      } else if (ev.type === 'tool_result') {
        for (const b of last.blocks) if (b.kind === 'tool' && b.id === ev.id) { b.status = 'done'; b.output = ev.output; }
      } else if (ev.type === 'error') {
        last.blocks.push({ kind: 'text', text: `\n\nError: ${ev.message}` });
      }
      return { ...t, messages: msgs, updatedAt: Date.now() };
    });
  }

  const latestAsstIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  }, [messages]);

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <>
      {/* Launcher button */}
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setExpanded(true); }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-ink py-3 pl-4 pr-5 text-sm font-bold text-white shadow-2xl transition hover:scale-[1.03]"
        >
          <div className="chat-orb" style={{ width: 28, height: 28 }}>
            <span />
            <div className="chat-orb-inner" style={{ fontSize: 9 }}>Px</div>
          </div>
          Pixii Chat
        </button>
      )}

      {/* Panel */}
      <div
        className={`fixed z-50 flex bg-[#FAF7F2] transition-all duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${expanded ? 'inset-0' : 'inset-y-0 right-0 w-full max-w-[640px] border-l hairline shadow-2xl'}`}
        aria-hidden={!open}
      >
        <div className="flex h-full w-full">

          {/* History sidebar (only in expanded mode) */}
          {expanded && sidebarOpen && (
            <aside className="flex w-64 shrink-0 flex-col border-r hairline bg-white">
              <div className="flex items-center justify-between border-b hairline px-4 py-4">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-ink">Chats</span>
                <button onClick={startNewChat} className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white hover:opacity-90">
                  + New
                </button>
              </div>
              <div className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
                {threads
                  .slice()
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((t) => (
                    <div key={t.id} className={`group mb-0.5 flex items-center gap-1.5 rounded-xl px-3 py-2 ${t.id === activeId ? 'bg-accent-light' : 'hover:bg-slate-50'}`}>
                      <button onClick={() => setActiveId(t.id)} className="flex-1 truncate text-left text-sm text-ink">
                        {t.title || 'New chat'}
                      </button>
                      <button onClick={() => deleteThread(t.id)} className="rounded opacity-0 p-0.5 transition group-hover:opacity-100 hover:text-red-600">
                        <span className="text-xs text-muted">×</span>
                      </button>
                    </div>
                  ))}
              </div>
            </aside>
          )}

          {/* Main */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { setOpen(false); setExpanded(false); }} className="rounded-full p-2 text-muted hover:bg-accent-light" aria-label="Back">
                  ←
                </button>
                {expanded && (
                  <button onClick={() => setSidebar((v) => !v)} className="rounded-full p-2 text-muted hover:bg-accent-light" title="Toggle history">
                    ☰
                  </button>
                )}
                <div className="flex items-center gap-2.5">
                  <div className="chat-orb" style={{ width: 32, height: 32 }}>
                    <span />
                    <div className="chat-orb-inner" style={{ fontSize: 10 }}>Px</div>
                  </div>
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.18em]">Pixii Chat</div>
                    <div className="truncate max-w-[240px] text-[11px] text-muted">
                      {activeThread?.title || 'New chat'} · Claude 4.5
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={startNewChat} className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-slate-200">
                  + New chat
                </button>
                <button onClick={() => setExpanded((v) => !v)} className="rounded-full p-2 text-muted hover:bg-accent-light" title={expanded ? 'Collapse panel' : 'Full screen'}>
                  {expanded ? '⤡' : '⤢'}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
              <div className="mx-auto w-full max-w-3xl space-y-5 [overflow-anchor:none]">
                {/* Empty state */}
                {messages.length === 0 && (
                  <div className="space-y-5">
                    <div className="flex justify-center pt-6">
                      <div className="chat-orb" style={{ width: 64, height: 64 }}>
                        <span />
                        <div className="chat-orb-inner" style={{ fontSize: 18 }}>Px</div>
                      </div>
                    </div>
                    <h3 className="text-center text-2xl leading-snug text-ink" style={{ fontFamily: '"Charter","Iowan Old Style",Georgia,serif' }}>
                      What should we ship today?
                    </h3>
                    <p className="text-center text-sm leading-6 text-muted">
                      Sync Monte's voice, mine hooks, draft posts, score them,<br />and publish to LinkedIn — autonomously.
                    </p>
                    <div className="grid gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => send(s)} className="rounded-2xl border hairline bg-white px-4 py-3 text-left text-sm text-ink transition hover:bg-accent-light">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.dbId ?? i}
                    message={m}
                    isLatestAssistant={busy && i === latestAsstIdx}
                  />
                ))}

                {busy && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="chat-orb" style={{ width: 28, height: 28 }}>
                      <span />
                      <div className="chat-orb-inner" style={{ fontSize: 9 }}>Px</div>
                    </div>
                    <span className="text-xs font-semibold text-muted">Pixii is working…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t hairline bg-white px-4 py-3">
              <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder="Ask Pixii to sync, mine, draft, schedule, or post…"
                  rows={2}
                  disabled={busy}
                  className="scroll-thin flex-1 resize-none rounded-xl border hairline bg-[#FAF7F2] px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <div className="mx-auto mt-1.5 max-w-3xl text-[10px] text-muted">
                Enter to send · Shift+Enter newline · LinkedIn publishing only
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
