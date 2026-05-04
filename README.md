<div align="center">

# Pixii — AI-Powered LinkedIn Growth Engine

**Mine viral hooks. Extract patterns. Draft posts. Publish — all from one conversation.**

[![Next.js](https://img.shields.io/badge/Next.js_14-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Anthropic_Claude-191919?logo=anthropic&logoColor=white)](https://anthropic.com)
[![Vercel](https://img.shields.io/badge/Deploy_on_Vercel-000?logo=vercel&logoColor=white)](https://vercel.com)

</div>

---

## The Problem

LinkedIn creators spend hours manually scrolling Reddit, X, and LinkedIn looking for trending topics and viral hooks. Then they have to figure out *why* a hook worked, adapt the pattern to their voice, write the post, and schedule it — all before the trend dies.

## The Solution

**Pixii** is an end-to-end LinkedIn content engine that automates every step of the pipeline:

> Scrape trending posts → Extract hook DNA → Cluster patterns → Generate branded drafts in your voice → Score voice fidelity → Publish to LinkedIn

The entire workflow is orchestrated through **Pixii Chat** — a single conversational interface powered by Claude that replaces five different tools.

---

## Pixii Chat — The Command Center

Pixii Chat is the heart of the platform. It's a full-screen conversational AI panel where you control every part of the content pipeline through natural language.

### What you can do in one chat thread

| Prompt | What happens |
|--------|-------------|
| *"Fetch me viral hooks about AI agents from Reddit and X"* | Scrapes both platforms with dynamic keywords via Apify + DuckDuckGo, extracts hooks with Claude, stores them in your DB |
| *"Mine fresh Reddit hooks now"* | Runs the full Reddit mining pipeline — scrape → extract → store — with live streaming progress |
| *"Show my top 10 hooks"* | Queries Supabase and renders an interactive hook grid with engagement scores |
| *"Draft 3 LinkedIn posts about Amazon FBA automation"* | Generates three Monte-voice drafts using mined hook patterns, each with a voice fidelity score |
| *"Score this draft against Monte's voice"* | Returns a detailed 6-dimension voice match breakdown (sentence length, number density, hook strength, filler words, parentheticals, line-break rhythm) |
| *"Sync Monte's voice from LinkedIn and X"* | Scrapes Monte Desai's latest posts via Apify actors, stores them for voice calibration |
| *"Post this to LinkedIn now"* | Sends the draft to LinkedIn via n8n webhook — immediate or scheduled |

### How it works under the hood

Pixii Chat uses **Claude with tool use** — 10+ registered tools that the AI calls autonomously based on your request. The architecture streams every step back to you in real time:

```
User prompt
  → Claude decides which tools to call
    → Tools execute (scrape, extract, generate, score, post)
      → Progress streams as NDJSON
        → Rich UI cards render inline (hook grids, voice scores, draft cards)
```

Chat threads persist in Supabase. Switch between conversations, pick up where you left off.

---

## Platform Features

### Hook Mining Engine

Scrape high-engagement posts from **Reddit**, **X (Twitter)**, and **LinkedIn** using:

- **Apify actors** — `datara/reddit-search-scraper` for Reddit (capped at 80 items per run, ~$0.04/execution)
- **DuckDuckGo + Jina AI** — free scraping for X and LinkedIn
- **Dynamic keywords** — mine any topic on demand, not just preconfigured subreddits

Claude extracts the **hook text**, **pattern category**, **template structure**, and **reasoning** from every post. Hooks are deduplicated and stored in Supabase with engagement metrics.

### Pattern Library

Hooks are clustered into reusable pattern categories:

- Contrarian Opener
- Specific Number Lead
- Before/After Transformation
- Question Hook
- Story Loop
- Authority Flex

Each pattern tracks example count and average engagement. Browse them at `/patterns`.

### Post Writer

Generate **3 LinkedIn drafts** from any topic + selected hook pattern:

- Character-by-character typewriter reveal animation
- One-click copy
- **Voice Match scoring** — each draft is scored against Monte Desai's voice fingerprint across 6 dimensions using OpenAI GPT-4o-mini calibrated with live LinkedIn post data
- **LinkedIn posting** — send to LinkedIn immediately or schedule via n8n webhook

### Voice Calibration

Pixii scrapes Monte Desai's actual LinkedIn posts and X tweets, stores them in dedicated tables (`monte_posts`, `monte_tweets`), and uses them as the scoring reference. The voice fingerprint is always up to date.

### Automated Mining

A Vercel Cron job runs `/api/mine` weekly (configurable in `vercel.json`), keeping the hook library fresh without manual intervention.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Pixii Chat UI                     │
│            (Full-screen conversational panel)         │
└────────────────────────┬─────────────────────────────┘
                         │ NDJSON stream
                         ▼
┌──────────────────────────────────────────────────────┐
│               /api/chat (Claude + Tools)              │
│                                                      │
│  Tools:  mine_reddit · mine_x · fetch_viral_hooks    │
│          list_hooks · list_patterns · list_mining_runs│
│          generate_linkedin_post · score_voice         │
│          sync_monte_voice · post_to_platform          │
└───┬──────────┬──────────┬──────────┬─────────────────┘
    │          │          │          │
    ▼          ▼          ▼          ▼
 Apify      Jina AI   Anthropic   OpenAI
 (Reddit)   (X, LI)   (Extract)  (Voice Score)
    │          │          │          │
    └──────────┴──────────┴──────────┘
                    │
                    ▼
           ┌───────────────┐
           │   Supabase    │
           │               │
           │  hooks        │
           │  patterns     │
           │  mining_runs  │
           │  monte_posts  │
           │  monte_tweets │
           │  chat_threads │
           │  chat_messages│
           └───────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | Supabase (Postgres) |
| **AI — Extraction & Chat** | Anthropic Claude (claude-sonnet-4-20250514) |
| **AI — Voice Scoring** | OpenAI GPT-4o-mini |
| **Scraping** | Apify actors, Jina AI, DuckDuckGo |
| **Posting** | n8n webhook → LinkedIn API |
| **Deployment** | Vercel |
| **Cron** | Vercel Cron |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Supabase project
- API keys: Anthropic, OpenAI, Apify

### 1. Install

```bash
pnpm install
cp .env.example .env.local
```

### 2. Configure environment

```bash
# Required
ANTHROPIC_API_KEY=            # Claude — hook extraction + chat
OPENAI_API_KEY=               # GPT-4o-mini — voice scoring
SUPABASE_URL=                 # Supabase project URL
SUPABASE_ANON_KEY=            # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=    # Supabase service role key

# Scraping
APIFY_API_TOKEN=              # Apify — Reddit scraping (~$0.04/run)

# Optional
X_BEARER_TOKEN=               # X API bearer token
REDDIT_CLIENT_ID=             # Reddit OAuth (fallback)
REDDIT_CLIENT_SECRET=         # Reddit OAuth (fallback)
RESEND_API_KEY=               # Email notifications
CRON_SECRET=your-secret       # Protects /api/mine endpoint
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up database

Run `supabase/schema.sql` in the Supabase SQL editor. This creates all tables:

| Table | Purpose |
|-------|---------|
| `patterns` | Hook pattern categories with templates |
| `hooks` | Extracted hooks with engagement data |
| `mining_runs` | Mining operation logs |
| `generated_posts` | AI-generated LinkedIn drafts |
| `monte_posts` | Monte's LinkedIn posts for voice calibration |
| `monte_tweets` | Monte's tweets for voice calibration |
| `chat_threads` | Pixii Chat conversation threads |
| `chat_messages` | Per-thread message storage |

### 4. Seed demo data (optional)

```bash
pnpm seed
```

Or via API:

```bash
curl -X POST http://localhost:3000/api/seed-demo
```

Inserts 60 demo hooks across six patterns. The app also has a bundled demo fallback — the UI renders without Supabase configured.

### 5. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Pages

| Route | Description |
|-------|------------|
| `/` | Hook Library — dashboard with hero, live mining controls, hook grid |
| `/patterns` | Pattern Library — browse clustered hook patterns |
| `/write` | Post Writer — generate drafts, score voice, publish to LinkedIn |
| Pixii Chat | Full-screen AI panel accessible from the navbar on every page |

---

## API Routes

| Endpoint | Method | Description |
|----------|--------|------------|
| `/api/chat` | POST | Pixii Chat — Claude with streaming tool use |
| `/api/mine` | POST | Full mining pipeline (Reddit + X + LinkedIn) |
| `/api/mine-reddit` | POST | Reddit-only mining with NDJSON streaming |
| `/api/mine-x` | POST | X-only mining with NDJSON streaming |
| `/api/write` | POST | Generate 3 LinkedIn drafts |
| `/api/voice-score` | POST | Score a draft against Monte's voice |
| `/api/scrape-monte` | POST | Scrape Monte's LinkedIn posts |
| `/api/scrape-monte-x` | POST | Scrape Monte's X tweets |
| `/api/linkedin-post` | POST | Post/schedule to LinkedIn via n8n |
| `/api/hooks` | GET | Query stored hooks |
| `/api/patterns` | GET | Query pattern library |
| `/api/mining-runs` | GET | Query mining history |
| `/api/chat-threads` | GET/POST/DELETE | Chat thread CRUD |
| `/api/chat-messages` | GET/POST/PATCH | Chat message CRUD |
| `/api/seed-demo` | POST | Seed demo data |

---

## Deployment

1. Push to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add all environment variables in the Vercel dashboard
4. Deploy

Vercel Cron is preconfigured in `vercel.json` to run `/api/mine` every Sunday at 2:00 AM UTC, keeping hooks fresh automatically.

```bash
# Seed production data once
curl -X POST https://your-app.vercel.app/api/seed-demo

# Or trigger a manual mine
curl -X POST https://your-app.vercel.app/api/mine \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Cost

| Service | Cost |
|---------|------|
| Apify Reddit scraping | ~$0.04 per run (80 items) |
| X/LinkedIn scraping | Free (DuckDuckGo + Jina) |
| Anthropic Claude | Per-token (hook extraction + chat) |
| OpenAI GPT-4o-mini | Per-token (voice scoring) |
| Supabase | Free tier covers typical usage |
| Vercel | Free tier covers deployment + cron |

---

<div align="center">

**Built for [Pixii.ai](https://pixii.ai)**

</div>
