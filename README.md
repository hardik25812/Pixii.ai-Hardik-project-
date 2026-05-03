# Hook Mining Engine

A production-style Next.js app for Pixii.ai's founding engineer challenge.

It mines viral LinkedIn/Reddit hooks, extracts reusable hook patterns with Claude, stores them in Supabase, and generates Monte-style Pixii LinkedIn drafts.

## What it does

- **Mine**: `/api/mine` runs Apify scrapers for LinkedIn + Reddit and filters high-engagement posts.
- **Analyze**: Claude extracts hook text, pattern category, template, and reasoning.
- **Write**: `/write` generates 3 Pixii-branded LinkedIn drafts from a topic + selected hook pattern.

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Apify
- Anthropic Claude
- Vercel Cron

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill `.env.local`:

```bash
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APIFY_API_TOKEN=
RESEND_API_KEY=
CRON_SECRET=change-me-long-random-string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor. It creates:

- `patterns`
- `hooks`
- `generated_posts`

It also seeds the six required Pixii/Monte hook patterns.

## Seed demo data

After setting Supabase env vars:

```bash
pnpm seed
```

Or while the dev server is running:

```bash
curl -X POST http://localhost:3000/api/seed-demo
```

This inserts 60 demo hooks across the six patterns.

## Run locally

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Mine real hooks

```bash
curl -X POST http://localhost:3000/api/mine \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Vercel Cron is configured in `vercel.json` to hit `/api/mine` every Sunday at 2AM.

## Deployment

Deploy to Vercel and add the same environment variables in the Vercel dashboard.

Then seed data once:

```bash
curl -X POST https://your-app.vercel.app/api/seed-demo
```

And mine real data:

```bash
curl -X POST https://your-app.vercel.app/api/mine \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Screens

- `/` — Hook Library dashboard
- `/patterns` — Pattern Library
- `/write` — Pixii post generator

## Notes

The app has a bundled demo fallback, so the UI can render even before Supabase is configured. Live generation requires `ANTHROPIC_API_KEY` and Supabase tables.
