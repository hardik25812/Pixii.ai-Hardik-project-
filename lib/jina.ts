/**
 * Jina AI free web reader & search.
 * - r.jina.ai/<URL>    → clean markdown of any public page
 * - s.jina.ai/<query>  → top web search results as markdown
 *
 * Free, no API key, no cookies, rate-limited but generous.
 * Agent-Reach uses this same service for its universal web reader.
 */

const READER_BASE = 'https://r.jina.ai/';
const SEARCH_BASE = 'https://s.jina.ai/';

async function jinaFetch(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/markdown',
      'X-Return-Format': 'markdown',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Jina ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

export async function jinaRead(url: string): Promise<string> {
  return jinaFetch(`${READER_BASE}${url}`);
}

export async function jinaSearch(query: string): Promise<string> {
  return jinaFetch(`${SEARCH_BASE}${encodeURIComponent(query)}`, 25000);
}

/**
 * Free web search via DuckDuckGo HTML → Jina Reader.
 * Returns markdown of DuckDuckGo results page.
 * Works where Google blocks (CAPTCHA) and Jina Search (paid).
 */
export async function duckDuckSearch(query: string): Promise<string> {
  const ddg = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  return jinaFetch(`${READER_BASE}${ddg}`, 25000);
}
