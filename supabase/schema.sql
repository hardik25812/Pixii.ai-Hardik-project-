-- Hook Mining Engine — Supabase schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------
-- patterns
-- -------------------------------------------------------------------
create table if not exists patterns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  template text not null,
  description text,
  example_count int default 0,
  avg_engagement numeric default 0,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------
-- hooks
-- -------------------------------------------------------------------
create table if not exists hooks (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  hook_text text not null,
  pattern_id uuid references patterns(id) on delete set null,
  source text,
  source_url text,
  engagement_score int default 0,
  author_followers int default 0,
  virality_score numeric generated always as
    (engagement_score::numeric /
     nullif(author_followers, 0)) stored,
  reasoning text,
  scraped_at timestamptz default now()
);

create index if not exists hooks_pattern_id_idx on hooks(pattern_id);
create index if not exists hooks_engagement_idx on hooks(engagement_score desc);

-- -------------------------------------------------------------------
-- generated_posts
-- -------------------------------------------------------------------
create table if not exists generated_posts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  pattern_id uuid references patterns(id) on delete set null,
  draft_1 text,
  draft_2 text,
  draft_3 text,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------
-- Seed patterns (idempotent)
-- -------------------------------------------------------------------
insert into patterns (name, template, description) values
('The Rejection List',
 'I [verb]ed [X] [things].\nRejected [Y]% for these [N] reasons.',
 'Monte''s signature format. Works for any audit/review.'),
('The Screenshot Reveal',
 '[Specific metric] on [task].\n[Absurd outcome].',
 'Show the receipts. Specific numbers only.'),
('The Contrarian Take',
 '[Common belief]?\n[Stronger counter-claim].',
 'Pick a fight with conventional wisdom.'),
('The Personal Story Arc',
 '[Surprising statistic].\nHere''s how I [did the hard thing].',
 'Vulnerability + data + outcome.'),
('The Data Drop',
 'We got [specific number] [things] in [timeframe].\n[N] [stood out / failed] for [reason].',
 'Raw numbers, no fluff.'),
('The Bold Claim + Evidence',
 '[Counterintuitive statement].\n[Evidence 1]\n[Evidence 2]\n[Evidence 3]',
 'Make the claim first. Prove it after.')
on conflict (name) do nothing;

-- -------------------------------------------------------------------
-- monte_posts — Monte's actual LinkedIn posts for voice calibration
-- -------------------------------------------------------------------
create table if not exists monte_posts (
  id uuid primary key default gen_random_uuid(),
  post_text text not null,
  post_url text unique,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  posted_at timestamptz,
  scraped_at timestamptz default now()
);

create index if not exists monte_posts_scraped_idx on monte_posts(scraped_at desc);

-- -------------------------------------------------------------------
-- monte_tweets — Monte's actual X/Twitter posts for voice calibration
-- -------------------------------------------------------------------
create table if not exists monte_tweets (
  id uuid primary key default gen_random_uuid(),
  tweet_text text not null,
  tweet_url text unique,
  likes int default 0,
  retweets int default 0,
  replies int default 0,
  tweeted_at timestamptz,
  scraped_at timestamptz default now()
);

create index if not exists monte_tweets_scraped_idx on monte_tweets(scraped_at desc);
