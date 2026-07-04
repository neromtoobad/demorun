// Research: turn an input URL (or plain text) into a normalized ProductBrief.
//
// Three URL classes, each with a strategy that degrades gracefully:
//   - okx.ai agent listing → HTML structured-data + visible text (SSR content)
//   - GitHub repo          → GitHub REST API (description, topics, README)
//   - generic landing page → HTML structured-data (og/meta/title/headings)
// Plain text maps straight to a brief.
//
// audience/tone are best-effort heuristics for now; they're the natural place
// to add LLM enrichment once an Anthropic key is available (see script stage).

import type { ProductBrief } from '../types.js';

const DEFAULT_TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (compatible; DEMORUN-research/1.0)';

// okx.ai occasionally serves a minimal shell (~a few hundred bytes of visible
// text) instead of the real SSR page. Below this threshold we retry.
const MIN_VISIBLE_TEXT = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- fetch helpers ---------------------------------------------------------

async function fetchText(
  url: string,
  accept: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms fetching ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- tiny HTML extractors (no DOM dependency) ------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

// Parse every <meta> tag into an attribute bag so we can look up og:/name.
function parseMetas(html: string): Array<Record<string, string>> {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.map((tag) => {
    const attrs: Record<string, string> = {};
    const re = /([a-zA-Z:_-]+)\s*=\s*"([^"]*)"|([a-zA-Z:_-]+)\s*=\s*'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tag))) {
      const key = (m[1] ?? m[3]).toLowerCase();
      attrs[key] = decodeEntities(m[2] ?? m[4] ?? '');
    }
    return attrs;
  });
}

function metaContent(
  metas: Array<Record<string, string>>,
  key: string
): string | undefined {
  const hit = metas.find((a) => a.property === key || a.name === key);
  return hit?.content?.trim() || undefined;
}

function titleOf(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const t = stripTags(m[1]);
  return t.length ? t : undefined;
}

// Nav/section labels that show up as headings but aren't product features.
const CHROME = new Set([
  'services', 'reviews', 'explore more', 'explore', 'home', 'agents', 'tasks',
  'sign in', 'log in', 'login', 'menu', 'about', 'contact', 'faq', 'pricing',
  'docs', 'documentation', 'get started', 'try now', 'overview',
]);

// Fetch HTML, retrying past okx.ai's occasional minimal-shell responses.
async function fetchSolidHtml(url: string, attempts = 3): Promise<string> {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    const html = await fetchText(url, 'text/html');
    if (visibleText(html).length >= MIN_VISIBLE_TEXT) return html;
    last = html;
    if (i < attempts - 1) await sleep(400);
  }
  return last; // best effort — parse whatever we got
}

function headings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = stripTags(m[1]);
    if (text.length >= 3 && text.length <= 80) out.push(text);
  }
  return out;
}

function visibleText(html: string): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return stripTags(body);
}

function firstSentence(text: string, max = 200): string {
  const trimmed = text.trim();
  const dot = trimmed.search(/[.!?](\s|$)/);
  const cut = dot > 20 ? trimmed.slice(0, dot + 1) : trimmed.slice(0, max);
  return cut.trim();
}

// Strip a trailing site name like "Foo — OKX.AI" / "Foo | Acme".
function cleanName(raw: string): string {
  return raw.split(/\s+[|—–-]\s+/)[0].trim() || raw.trim();
}

function dedupe(items: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
      if (out.length >= cap) break;
    }
  }
  return out;
}

// Heuristic audience read from the text; honest default when nothing matches.
function inferAudience(text: string): string {
  const t = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(developer|dev tools|sdk|api)\b/, 'developers'],
    [/\b(trader|trading|traders)\b/, 'crypto traders'],
    [/\b(agent|agents|autonomous)\b/, 'AI agents and their builders'],
    [/\b(founder|startup|hackathon)\b/, 'founders and hackathon builders'],
    [/\b(team|teams|enterprise|business)\b/, 'teams'],
    [/\b(creator|marketer|content)\b/, 'creators and marketers'],
  ];
  for (const [re, who] of rules) if (re.test(t)) return who;
  return 'general audience';
}

// ---- strategies ------------------------------------------------------------

function briefFromHtml(
  html: string,
  url: string,
  type: 'okx' | 'web'
): ProductBrief {
  const metas = parseMetas(html);
  const rawName = metaContent(metas, 'og:title') ?? titleOf(html);
  const name = (rawName ? cleanName(rawName) : '') || 'Untitled';
  const desc =
    metaContent(metas, 'og:description') ??
    metaContent(metas, 'description') ??
    firstSentence(visibleText(html));
  const features = dedupe(
    headings(html).filter((h) => {
      const l = h.toLowerCase();
      return l !== name.toLowerCase() && !CHROME.has(l);
    }),
    5
  );
  const text = `${name} ${desc} ${features.join(' ')}`;
  return {
    name,
    one_liner: firstSentence(desc, 160),
    audience: inferAudience(text),
    features,
    tone: type === 'okx' ? 'energetic, marketplace-native' : 'clear, direct',
    source: { type, url },
  };
}

async function briefFromGithub(url: string): Promise<ProductBrief> {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) throw new Error(`not a github repo URL: ${url}`);
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, '');
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const json = JSON.parse(await fetchText(api, 'application/vnd.github+json'));

  const features: string[] = Array.isArray(json.topics) ? json.topics : [];
  const one_liner = (json.description ?? '').trim() || `${repo} on GitHub`;
  const text = `${repo} ${one_liner} ${features.join(' ')} ${json.language ?? ''}`;
  return {
    name: repo,
    one_liner: firstSentence(one_liner, 160),
    audience: inferAudience(text),
    features: dedupe(features, 6),
    tone: 'technical, developer-facing',
    source: { type: 'github', url },
  };
}

function briefFromText(text: string): ProductBrief {
  const clean = text.trim().replace(/\s+/g, ' ');
  const name = cleanName(clean.split(/[.!?\n]/)[0]).slice(0, 60) || 'Product';
  return {
    name,
    one_liner: firstSentence(clean, 160),
    audience: inferAudience(clean),
    features: [],
    tone: 'clear, direct',
    source: { type: 'text' },
  };
}

// ---- entry point -----------------------------------------------------------

function classify(url: string): 'okx' | 'github' | 'web' {
  const host = new URL(url).hostname.toLowerCase();
  if (host.endsWith('github.com')) return 'github';
  if (host.endsWith('okx.ai')) return 'okx';
  return 'web';
}

export async function research(
  input: string,
  inputType: 'url' | 'text'
): Promise<ProductBrief> {
  if (inputType === 'text') return briefFromText(input);

  let url: string;
  try {
    url = new URL(input).toString();
  } catch {
    throw new Error(`invalid input_url: ${input}`);
  }

  switch (classify(url)) {
    case 'github':
      return briefFromGithub(url);
    case 'okx':
      return briefFromHtml(await fetchSolidHtml(url), url, 'okx');
    default:
      return briefFromHtml(await fetchSolidHtml(url), url, 'web');
  }
}
