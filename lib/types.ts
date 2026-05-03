export interface Pattern {
  id: string;
  name: string;
  template: string;
  description: string | null;
  example_count: number;
  avg_engagement: number;
}

export interface Hook {
  id: string;
  hook_text: string;
  raw_text: string;
  source: 'linkedin' | 'reddit' | 'twitter' | string;
  source_url: string | null;
  engagement_score: number;
  author_followers: number | null;
  virality_score: number | null;
  reasoning: string | null;
  pattern_id: string | null;
  scraped_at: string;
  patterns?: { name: string } | { name: string }[] | null;
}

export function patternName(hook: Hook): string {
  if (!hook.patterns) return 'Unclassified';
  if (Array.isArray(hook.patterns)) return hook.patterns[0]?.name ?? 'Unclassified';
  return hook.patterns.name ?? 'Unclassified';
}
