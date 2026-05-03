'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Pattern } from '@/lib/types';
import { fetchVoiceScore, type VoiceScore } from '@/lib/voice-score';

interface Props {
  patterns: Pattern[];
  initialPatternId?: string;
}

interface Drafts {
  draft_1: string;
  draft_2: string;
  draft_3: string;
  pattern?: string;
}

interface TiltCardProps {
  tiltLimit?: number;
  scale?: number;
  perspective?: number;
  effect?: 'gravitate' | 'evade';
  spotlight?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

function TiltCard({
  tiltLimit = 12,
  scale = 1.02,
  perspective = 1200,
  effect = 'evade',
  spotlight = true,
  className = '',
  style,
  children,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(
    `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`
  );
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const dir = effect === 'evade' ? -1 : 1;

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const xRot = (py - 0.5) * (tiltLimit * 2) * dir;
      const yRot = (px - 0.5) * -(tiltLimit * 2) * dir;
      setTransform(
        `perspective(${perspective}px) rotateX(${xRot}deg) rotateY(${yRot}deg) scale3d(${scale}, ${scale}, ${scale})`
      );
      if (spotlight) {
        setSpotlightPos({ x: px * 100, y: py * 100 });
      }
    },
    [tiltLimit, scale, perspective, dir, spotlight]
  );

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setTransform(
      `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`
    );
    setIsHovered(false);
  }, [perspective]);

  return (
    <div
      ref={cardRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`will-change-transform relative overflow-hidden ${className}`}
      style={{
        transform,
        transition: 'transform 0.2s ease-out',
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {children}
      {spotlight && (
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.3s' }}
        >
          <div
            className="absolute h-[200%] w-[200%] rounded-full opacity-100 dark:opacity-50"
            style={{
              left: `${spotlightPos.x}%`,
              top: `${spotlightPos.y}%`,
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(244, 104, 63, 0.12) 24%, transparent 42%)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Voice Match modal/dropdown ──────────────────────────────────────
const DIMENSIONS: { key: keyof Omit<VoiceScore, 'total' | 'feedback' | '_source'>; label: string }[] = [
  { key: 'sentenceLength', label: 'Sentence length' },
  { key: 'numberDensity', label: 'Number density' },
  { key: 'hookStrength', label: 'Hook strength' },
  { key: 'fillerWords', label: 'Filler words' },
  { key: 'parentheticals', label: 'Parentheticals' },
  { key: 'lineBreakRhythm', label: 'Line-break rhythm' },
];

function Bar({ value }: { value: number }) {
  const filled = Math.round(value);
  const empty = 10 - filled;
  return (
    <span className="mono text-xs tracking-tight">
      <span className="text-accent">{'█'.repeat(filled)}</span>
      <span className="text-[var(--border)]">{'░'.repeat(empty)}</span>
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

function VoiceMatchCard({ draft }: { draft: string }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<VoiceScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (score) return; // already fetched
    setLoading(true);
    setError('');
    try {
      const result = await fetchVoiceScore(draft);
      setScore(result);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [open, score, draft]);

  return (
    <div className="mt-4" ref={panelRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center justify-between rounded-2xl border px-5 py-3 transition-all ${
          open
            ? 'border-accent bg-accent-light shadow-md'
            : 'hairline bg-[var(--bg)] hover:border-accent/40 hover:shadow-sm'
        }`}
      >
        <span className="mono text-xs font-black uppercase tracking-[0.18em] text-muted">
          Voice Match
        </span>
        <span className="flex items-center gap-2">
          {score && (
            <span className={`mono text-lg font-black ${totalColor(score.total)}`}>
              {score.total}%
            </span>
          )}
          {!score && !loading && (
            <span className="text-xs font-bold text-accent">Analyze</span>
          )}
          {loading && (
            <span className="text-xs font-bold text-muted animate-pulse">Scoring…</span>
          )}
          <svg
            className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="mt-2 rounded-2xl border hairline bg-card p-5 shadow-xl animate-in fade-in slide-in-from-top-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <span className="ml-3 text-sm font-bold text-muted">Analyzing voice match via AI…</span>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
          )}

          {score && !loading && (
            <>
              {/* Big score */}
              <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 ${totalBg(score.total)}`}>
                <span className="text-sm font-black text-ink">Overall Voice Match</span>
                <span className={`mono text-2xl font-black ${totalColor(score.total)}`}>
                  {score.total}%
                </span>
              </div>

              {/* Dimension bars */}
              <div className="space-y-2">
                {DIMENSIONS.map(({ key, label }, i) => {
                  const v = score[key];
                  const isLast = i === DIMENSIONS.length - 1;
                  const connector = isLast ? '└' : '├';
                  return (
                    <div key={key} className="flex items-center gap-2 font-mono text-xs text-ink">
                      <span className="text-[var(--border)] select-none">{connector}──</span>
                      <span className="w-[7.5rem] shrink-0 font-semibold">{label}</span>
                      <Bar value={v} />
                      <span className="ml-1 w-8 text-right font-bold text-muted">
                        {v}/10
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* AI feedback */}
              {score.feedback && (
                <div className="mt-4 rounded-xl bg-accent-light px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-wider text-accent">AI Tip</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-ink">{score.feedback}</p>
                </div>
              )}

              {/* Source badge */}
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  score._source?.includes('live_posts')
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {score._source?.includes('live_posts') ? 'Scored via OpenAI + Live Posts' : 'Scored via OpenAI'}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WriterClient({ patterns, initialPatternId }: Props) {
  const [topic, setTopic] = useState('Write me a Pixii post about how AI is changing Amazon listings.');
  const [patternId, setPatternId] = useState(initialPatternId || patterns[0]?.id || '');
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [visibleDrafts, setVisibleDrafts] = useState<string[]>([]);
  const [visibleLines, setVisibleLines] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkedinPerson, setLinkedinPerson] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [postingDraft, setPostingDraft] = useState<number | null>(null);
  const [postStatus, setPostStatus] = useState<Record<number, string>>({});
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const selected = useMemo(() => patterns.find((p) => p.id === patternId), [patterns, patternId]);

  useEffect(() => {
    return () => {
      revealTimers.current.forEach(clearTimeout);
    };
  }, []);

  async function generate() {
    setLoading(true);
    setError('');
    setDrafts(null);
    setVisibleDrafts([]);
    setVisibleLines({});
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    try {
      const res = await fetch('/api/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, pattern_id: patternId }),
      });
      const json = (await res.json()) as Drafts | { error?: string };
      if (!res.ok) throw new Error('error' in json && json.error ? json.error : 'Generation failed');
      const generatedDrafts = json as Drafts;
      setDrafts(generatedDrafts);
      [generatedDrafts.draft_1, generatedDrafts.draft_2, generatedDrafts.draft_3].forEach((draft, idx) => {
        const lines = draft.split('\n');
        const revealCardTimer = setTimeout(() => {
          setVisibleDrafts((current) => [...current, draft]);
          lines.forEach((_line: string, lineIdx: number) => {
            const revealLineTimer = setTimeout(() => {
              setVisibleLines((current) => ({
                ...current,
                [idx]: lineIdx + 1,
              }));
            }, lineIdx * 120);
            revealTimers.current.push(revealLineTimer);
          });
        }, idx * 650);
        revealTimers.current.push(revealCardTimer);
      });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  async function sendToLinkedIn(draft: string, idx: number, postNow: boolean) {
    setPostingDraft(idx);
    setPostStatus((current) => ({ ...current, [idx]: '' }));
    try {
      const res = await fetch('/api/linkedin-post', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: draft,
          scheduled_at: postNow ? undefined : scheduledAt,
          post_now: postNow,
          linkedin_person: linkedinPerson,
        }),
      });
      const json = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(json.error || 'LinkedIn posting failed');
      setPostStatus((current) => ({
        ...current,
        [idx]: postNow ? 'Sent to LinkedIn now.' : 'Scheduled in n8n.',
      }));
    } catch (e: any) {
      setPostStatus((current) => ({ ...current, [idx]: String(e?.message ?? e) }));
    } finally {
      setPostingDraft(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[2rem] border hairline bg-card p-7 shadow-sm">
        <div className="mb-6">
          <p className="mono mb-2 text-xs font-black uppercase tracking-[0.24em] text-accent">The Writer</p>
          <h1 className="display text-5xl font-black leading-none">Five drafts before Monday coffee.</h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            Type a Pixii topic, select a mined hook pattern, and generate three ready-to-post drafts in Monte's voice.
          </p>
        </div>

        <label className="block text-sm font-black uppercase tracking-wider text-ink">Topic</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={5}
          className="mt-3 w-full rounded-3xl border hairline bg-bg px-5 py-4 text-base font-semibold leading-7 outline-none ring-accent/20 focus:ring-4"
        />

        <div className="mt-6">
          <label className="block text-sm font-black uppercase tracking-wider text-ink">Pattern</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {patterns.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                onClick={() => setPatternId(pattern.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  patternId === pattern.id
                    ? 'border-accent bg-accent-light shadow-sm'
                    : 'hairline bg-white hover:bg-accent-light/40'
                }`}
              >
                <span className="block text-sm font-black text-ink">{pattern.name}</span>
                <span className="mt-1 block text-xs font-semibold text-muted">{pattern.example_count} examples</span>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="mt-6 rounded-2xl bg-accent-light p-4">
            <div className="mono mb-2 text-[11px] font-black uppercase tracking-widest text-accent">Selected template</div>
            <pre className="whitespace-pre-wrap font-mono text-sm font-bold leading-6 text-ink">{selected.template}</pre>
          </div>
        )}

        <button
          type="button"
          onClick={generate}
          disabled={loading || !topic.trim() || !patternId}
          className="mt-7 w-full rounded-full bg-accent px-6 py-4 text-base font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Mining the hook DNA...' : 'Generate 3 drafts'}
        </button>

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
      </section>

      <section className="space-y-5">
        {!drafts && !loading && (
          <div className="grid min-h-[520px] place-items-center rounded-[2rem] border hairline bg-card p-10 text-center shadow-sm">
            <div>
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent-light text-2xl font-black text-accent">3</div>
              <h2 className="display text-3xl font-black">Your drafts appear here.</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-muted">
                The output is tuned for short sentences, specific numbers, Pixii context, and a first-two-line LinkedIn hook.
              </p>
            </div>
          </div>
        )}

        {loading && !drafts && [0, 1, 2].map((idx) => (
          <TiltCard key={idx} tiltLimit={5} className="rounded-[2rem] border hairline bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="mono text-xs font-black uppercase tracking-[0.2em] text-accent">Draft {idx + 1}</span>
              <span className="rounded-full border hairline px-4 py-2 text-sm font-black text-muted">Rendering</span>
            </div>
            <div className="space-y-3">
              <div className="h-4 w-5/6 animate-pulse rounded-full bg-accent-light" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-accent-light" />
              <div className="h-4 w-full animate-pulse rounded-full bg-[var(--bg)]" />
              <div className="h-4 w-4/5 animate-pulse rounded-full bg-[var(--bg)]" />
            </div>
          </TiltCard>
        ))}

        {drafts && visibleDrafts.map((draft, idx) => {
          const lines = draft.split('\n');
          const renderedLines = lines.slice(0, visibleLines[idx] ?? 0);
          const complete = renderedLines.length === lines.length;
          return (
            <TiltCard key={`${idx}-${draft}`} tiltLimit={5} className="rounded-[2rem] border hairline bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <article>
                <div className="mb-4 flex items-center justify-between">
                  <span className="mono text-xs font-black uppercase tracking-[0.2em] text-accent">Draft {idx + 1}</span>
                  <button type="button" onClick={() => copy(draft)} disabled={!complete} className="relative z-20 rounded-full border hairline px-4 py-2 text-sm font-black hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50">
                    Copy
                  </button>
                </div>
                <div className="hook-text text-base font-semibold leading-7 text-ink">
                  {renderedLines.map((line, lineIdx) => (
                    <p key={`${lineIdx}-${line}`} className="min-h-7 animate-in fade-in slide-in-from-bottom-1">
                      {line || '\u00a0'}
                    </p>
                  ))}
                  {!complete && (
                    <span className="mt-1 inline-block h-5 w-2 animate-pulse rounded-sm bg-accent align-middle" />
                  )}
                </div>
                {complete && (
                  <div className="relative z-20 mt-5 rounded-2xl border hairline bg-[var(--bg)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="mono text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                          LinkedIn posting
                        </p>
                        <p className="mt-1 text-xs font-semibold text-muted">
                          Send this draft to the Pixii n8n LinkedIn agent.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                      <input
                        value={linkedinPerson}
                        onChange={(e) => setLinkedinPerson(e.target.value)}
                        placeholder="LinkedIn person ID (optional if n8n credential defaults)"
                        className="rounded-2xl border hairline bg-card px-4 py-3 text-sm font-semibold outline-none ring-accent/20 focus:ring-4"
                      />
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="rounded-2xl border hairline bg-card px-4 py-3 text-sm font-semibold outline-none ring-accent/20 focus:ring-4"
                      />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => sendToLinkedIn(draft, idx, true)}
                        disabled={postingDraft !== null}
                        className="rounded-full bg-[#0A66C2] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {postingDraft === idx ? 'Sending…' : 'Post now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendToLinkedIn(draft, idx, false)}
                        disabled={postingDraft !== null || !scheduledAt}
                        className="rounded-full border hairline px-4 py-3 text-sm font-black transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Schedule post
                      </button>
                    </div>
                    {postStatus[idx] && (
                      <p className="mt-3 rounded-xl bg-accent-light px-4 py-3 text-xs font-bold text-ink">
                        {postStatus[idx]}
                      </p>
                    )}
                  </div>
                )}
                {complete && <VoiceMatchCard draft={draft} />}
              </article>
            </TiltCard>
          );
        })}
      </section>
    </div>
  );
}
