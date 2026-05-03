/**
 * Voice-match scoring types.
 * Scoring powered by OpenAI — calibrated against Monte Desai's
 * actual LinkedIn writing fingerprint via /api/voice-score.
 */

export interface VoiceScore {
  total: number;
  sentenceLength: number;
  numberDensity: number;
  hookStrength: number;
  fillerWords: number;
  parentheticals: number;
  lineBreakRhythm: number;
  feedback?: string;
  _source?: string;
}

export async function fetchVoiceScore(draft: string): Promise<VoiceScore> {
  const res = await fetch('/api/voice-score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draft }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Voice scoring failed');
  }
  return res.json();
}
