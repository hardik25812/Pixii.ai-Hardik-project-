'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────
interface MiningEvent {
  phase: string;
  message: string;
  progress?: number;
  posts_count?: number;
  hooks_count?: number;
  hooks_extracted?: number;
  hooks_stored?: number;
  posts_scraped?: number;
  batch?: number;
  total_batches?: number;
  hooks_so_far?: number;
  latest_hooks?: { hook: string; pattern: string }[];
  hooks?: { hook_text: string; pattern_name: string; reasoning: string }[];
  sample?: { title: string; likes: number; comments: number }[];
}

interface ScrapePost {
  text: string;
  likes: number;
  comments: number;
}

interface MonteResult {
  success: boolean;
  posts_scraped: number;
  posts_stored: number;
  actor_used?: string;
  error?: string;
  sample?: ScrapePost[];
}

// ── LinkedIn-style Post Card ─────────────────────────────────────────
function LinkedInPostCard({ post, index, visible }: { post: ScrapePost; index: number; visible: boolean }) {
  const lines = post.text.split('\n').filter(Boolean);
  const hook = lines[0] ?? '';
  const body = lines.slice(1).join('\n').trim();
  const [expanded, setExpanded] = useState(false);
  const BODY_LIMIT = 120;
  const bodyTrimmed = body.length > BODY_LIMIT && !expanded ? body.slice(0, BODY_LIMIT) + '…' : body;

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(18px)',
        transition: `opacity 0.45s ease ${index * 0.12}s, transform 0.45s ease ${index * 0.12}s`,
      }}
      className="rounded-2xl border hairline bg-card p-4 shadow-sm"
    >
      {/* LinkedIn-style header */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#0077B5] text-sm font-black text-white shadow-sm">
            M
          </div>
          {/* LinkedIn logo badge */}
          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#0077B5] text-[7px] font-black text-white ring-2 ring-white">
            in
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-ink">Monte Desai</p>
          <p className="truncate text-[11px] text-muted">Founder @ Pixii · AI for Amazon Sellers</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full border hairline px-2.5 py-0.5 text-[10px] font-black text-accent">
          Live
        </span>
      </div>

      {/* Post text */}
      <div className="mt-3 space-y-1.5">
        <p className="text-sm font-black leading-snug text-ink">{hook}</p>
        {bodyTrimmed && (
          <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-ink/80">
            {bodyTrimmed}
            {body.length > BODY_LIMIT && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 font-bold text-[#0077B5] hover:underline"
              >
                {expanded ? 'see less' : 'see more'}
              </button>
            )}
          </p>
        )}
      </div>

      {/* Engagement row */}
      <div className="mt-3 flex items-center gap-4 border-t hairline pt-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11z" />
          </svg>
          {post.likes > 0 ? post.likes.toLocaleString() : '—'}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {post.comments > 0 ? post.comments.toLocaleString() : '—'}
        </span>
        <span className="ml-auto mono text-[10px] font-black uppercase tracking-wider text-accent/70">
          #{index + 1}
        </span>
      </div>
    </div>
  );
}

// ── Skeleton Card (loading placeholder) ─────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 0.1}s` }}
      className="animate-pulse rounded-2xl border hairline bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-light" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-24 rounded-full bg-accent-light" />
          <div className="h-2.5 w-36 rounded-full bg-[var(--bg)]" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3.5 w-full rounded-full bg-accent-light" />
        <div className="h-3 w-4/5 rounded-full bg-[var(--bg)]" />
        <div className="h-3 w-3/5 rounded-full bg-[var(--bg)]" />
      </div>
      <div className="mt-3 flex gap-4 border-t hairline pt-3">
        <div className="h-2.5 w-10 rounded-full bg-accent-light" />
        <div className="h-2.5 w-10 rounded-full bg-[var(--bg)]" />
      </div>
    </div>
  );
}

// ── Monte Voice Sync ────────────────────────────────────────────────
function MonteVoiceSync() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [posts, setPosts] = useState<ScrapePost[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalScraped, setTotalScraped] = useState(0);
  const [error, setError] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const handleSync = useCallback(async () => {
    setPhase('loading');
    setError('');
    setPosts([]);
    setVisibleCount(0);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    try {
      const res = await fetch('/api/scrape-monte', { method: 'POST' });
      const json: MonteResult = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Scraping failed');

      const fetched = json.sample ?? [];
      setTotalScraped(json.posts_scraped);
      setPosts(fetched);
      setPhase('done');

      // Stagger each post appearing — LinkedIn feed style
      fetched.forEach((_, i) => {
        const t = setTimeout(() => setVisibleCount((c) => c + 1), i * 140 + 80);
        timers.current.push(t);
      });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase('error');
    }
  }, []);

  return (
    <div className="rounded-[2rem] border hairline bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0077B5] text-sm font-black text-white shadow-sm">
              in
            </span>
            <p className="mono text-xs font-black uppercase tracking-[0.2em] text-accent">Voice Calibration</p>
          </div>
          <h3 className="display mt-2 text-xl font-black">Sync Monte&apos;s Voice</h3>
          <p className="mt-1 text-sm text-muted">
            Pull Monte&apos;s real LinkedIn posts into the voice scoring engine.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={phase === 'loading'}
          className="shrink-0 rounded-full bg-accent px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Scraping…
            </span>
          ) : phase === 'done' ? 'Refresh' : 'Fetch Posts'}
        </button>
      </div>

      {/* Success banner */}
      {phase === 'done' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-2.5">
          <svg className="h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-bold text-green-800">
            {totalScraped} posts scraped from Monte&apos;s LinkedIn · voice engine calibrated
          </span>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
      )}

      {/* Loading skeletons — 3 placeholder cards */}
      {phase === 'loading' && (
        <div className="mt-5 space-y-3">
          <p className="mono text-[10px] font-black uppercase tracking-widest text-muted">
            Fetching from LinkedIn…
          </p>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
        </div>
      )}

      {/* Animated post feed */}
      {phase === 'done' && posts.length > 0 && (
        <div className="mt-5 space-y-3 max-h-[520px] overflow-y-auto pr-1">
          <p className="mono text-[10px] font-black uppercase tracking-widest text-muted">
            Monte&apos;s real posts · {posts.length} shown
          </p>
          {posts.map((post, i) => (
            <LinkedInPostCard
              key={i}
              post={post}
              index={i}
              visible={i < visibleCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Live Reddit Mining ──────────────────────────────────────────────
function RedditMiner() {
  const [mining, setMining] = useState(false);
  const [events, setEvents] = useState<MiningEvent[]>([]);
  const [finalResult, setFinalResult] = useState<MiningEvent | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const handleMine = useCallback(async () => {
    setMining(true);
    setEvents([]);
    setFinalResult(null);

    try {
      const res = await fetch('/api/mine-reddit', { method: 'POST' });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setEvents([{ phase: 'error', message: json.error || 'Mining failed' }]);
        setMining(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as MiningEvent;
            setEvents((prev) => [...prev, event]);
            if (event.phase === 'done' || event.phase === 'error') {
              setFinalResult(event);
            }
            // Auto-scroll log
            setTimeout(() => {
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
            }, 50);
          } catch {}
        }
      }
    } catch (e: any) {
      setEvents((prev) => [...prev, { phase: 'error', message: String(e?.message ?? e) }]);
    } finally {
      setMining(false);
    }
  }, []);

  const latestProgress = events.filter((e) => e.progress !== undefined).pop()?.progress ?? 0;

  return (
    <div className="rounded-[2rem] border hairline bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="mono text-xs font-black uppercase tracking-[0.2em] text-accent">Live Mining</p>
          <h3 className="display mt-1 text-xl font-black">Mine Reddit Now</h3>
          <p className="mt-2 text-sm text-muted">
            Scrape top Reddit posts live, then watch Claude extract hooks and patterns in real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={handleMine}
          disabled={mining}
          className="shrink-0 rounded-full bg-accent px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mining ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Mining…
            </span>
          ) : (
            'Start Mining'
          )}
        </button>
      </div>

      {/* Progress bar */}
      {mining && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${latestProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs font-bold text-muted">{latestProgress}%</p>
        </div>
      )}

      {/* Live log */}
      {events.length > 0 && (
        <div
          ref={logRef}
          className="scroll-thin mt-4 max-h-72 overflow-y-auto rounded-2xl bg-[#1A1614] p-4 font-mono text-xs leading-6"
        >
          {events.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <span className={
                ev.phase === 'error' ? 'text-red-400' :
                ev.phase === 'done' ? 'text-green-400' :
                ev.phase === 'extracting' ? 'text-amber-400' :
                ev.phase === 'scraping' ? 'text-sky-400' :
                'text-gray-400'
              }>
                {ev.phase === 'scraping' && '> '}
                {ev.phase === 'extracting' && '>> '}
                {ev.phase === 'extracted' && '>>> '}
                {ev.phase === 'storing' && '>>>> '}
                {ev.phase === 'done' && '✓ '}
                {ev.phase === 'error' && '✗ '}
              </span>
              <span className="text-gray-300">{ev.message}</span>
            </div>
          ))}
          {mining && (
            <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent" />
          )}
        </div>
      )}

      {/* Final extracted hooks */}
      {finalResult?.phase === 'done' && finalResult.hooks && finalResult.hooks.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-3">
            <span className="text-lg">&#10003;</span>
            <span className="text-sm font-bold text-green-800">
              {finalResult.hooks_extracted} hooks extracted from {finalResult.posts_scraped} posts &middot; {finalResult.hooks_stored} stored
            </span>
          </div>
          <p className="mono text-[10px] font-black uppercase tracking-widest text-muted">Extracted hooks</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {finalResult.hooks.map((h, i) => (
              <div key={i} className="rounded-xl border hairline bg-[var(--bg)] p-3">
                <span className="mono mb-1 block text-[10px] font-black uppercase tracking-wider text-accent">
                  {h.pattern_name}
                </span>
                <p className="text-sm font-bold leading-5 text-ink">{h.hook_text}</p>
                <p className="mt-1 text-xs text-muted">{h.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// XPostCard + XVoiceSync disabled — X profile scraping unreliable for small accounts

// ── X Miner (watcher.data/search-x-by-keywords → Claude hooks) ──────
function XMiner() {
  const [mining, setMining] = useState(false);
  const [events, setEvents] = useState<MiningEvent[]>([]);
  const [finalResult, setFinalResult] = useState<MiningEvent | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const handleMine = useCallback(async () => {
    setMining(true);
    setEvents([]);
    setFinalResult(null);

    try {
      const res = await fetch('/api/mine-x', { method: 'POST' });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setEvents([{ phase: 'error', message: json.error || 'X mining failed' }]);
        setMining(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as MiningEvent;
            setEvents((prev) => [...prev, event]);
            if (event.phase === 'done' || event.phase === 'error') setFinalResult(event);
            setTimeout(() => {
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
            }, 50);
          } catch {}
        }
      }
    } catch (e: any) {
      setEvents((prev) => [...prev, { phase: 'error', message: String(e?.message ?? e) }]);
    } finally {
      setMining(false);
    }
  }, []);

  const latestProgress = events.filter((e) => e.progress !== undefined).pop()?.progress ?? 0;

  return (
    <div className="rounded-[2rem] border hairline bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-black text-sm font-black text-white shadow-sm">
              𝕏
            </span>
            <p className="mono text-xs font-black uppercase tracking-[0.2em] text-accent">Live X Mining</p>
          </div>
          <h3 className="display mt-2 text-xl font-black">Mine X Now</h3>
          <p className="mt-1 text-sm text-muted">
            Search X for top ecommerce tweets, then watch Claude extract hooks in real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={handleMine}
          disabled={mining}
          className="shrink-0 rounded-full bg-black px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mining ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Mining…
            </span>
          ) : 'Start X Mining'}
        </button>
      </div>

      {/* Progress bar */}
      {mining && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full bg-black transition-all duration-500"
              style={{ width: `${latestProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs font-bold text-muted">{latestProgress}%</p>
        </div>
      )}

      {/* Live log */}
      {events.length > 0 && (
        <div
          ref={logRef}
          className="scroll-thin mt-4 max-h-72 overflow-y-auto rounded-2xl bg-[#0d0d0d] p-4 font-mono text-xs leading-6"
        >
          {events.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <span className={
                ev.phase === 'error' ? 'text-red-400' :
                ev.phase === 'done' ? 'text-green-400' :
                ev.phase === 'extracting' ? 'text-amber-400' :
                ev.phase === 'scraping' ? 'text-sky-400' :
                'text-gray-400'
              }>
                {ev.phase === 'scraping' && '𝕏 '}
                {ev.phase === 'extracting' && '>> '}
                {ev.phase === 'extracted' && '>>> '}
                {ev.phase === 'storing' && '>>>> '}
                {ev.phase === 'done' && '✓ '}
                {ev.phase === 'error' && '✗ '}
              </span>
              <span className="text-gray-300">{ev.message}</span>
            </div>
          ))}
          {mining && (
            <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-white" />
          )}
        </div>
      )}

      {/* Final extracted hooks */}
      {finalResult?.phase === 'done' && finalResult.hooks && finalResult.hooks.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-bold text-green-800">
              {finalResult.hooks_extracted} hooks extracted from {finalResult.posts_scraped} tweets &middot; {finalResult.hooks_stored} stored
            </span>
          </div>
          <p className="mono text-[10px] font-black uppercase tracking-widest text-muted">Extracted hooks from X</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {finalResult.hooks.map((h, i) => (
              <div key={i} className="rounded-xl border hairline bg-[var(--bg)] p-3">
                <span className="mono mb-1 block text-[10px] font-black uppercase tracking-wider text-accent">
                  {h.pattern_name}
                </span>
                <p className="text-sm font-bold leading-5 text-ink">{h.hook_text}</p>
                <p className="mt-1 text-xs text-muted">{h.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Combined export ─────────────────────────────────────────────────
export default function HomeClient() {
  return (
    <div className="space-y-4">
      <MonteVoiceSync />
      <div className="grid gap-4 lg:grid-cols-2">
        <RedditMiner />
        <XMiner />
      </div>
    </div>
  );
}
