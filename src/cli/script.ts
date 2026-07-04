// CLI: generate a script from a brief fixture, standalone.
// Usage:
//   npm run script -- --brief ./fixtures/brief-crypto.json
//   npm run script -- --brief ./fixtures/brief-product.json --style ugc --aspect 9:16

import { readFileSync } from 'node:fs';
import { loadEnv } from '../lib/loadEnv.js';
import { generateScript } from '../lib/script.js';
import { STYLES, ASPECT_RATIOS, type ProductBrief, type Style } from '../types.js';

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const briefPath = arg('--brief');
  if (!briefPath) {
    console.error('usage: npm run script -- --brief <path> [--style clean-tech|ugc|cinematic] [--aspect 9:16|16:9]');
    process.exit(1);
  }

  const style = (arg('--style') ?? 'clean-tech') as Style;
  const aspect = arg('--aspect') ?? '9:16';
  if (!STYLES.includes(style)) {
    console.error(`--style must be one of ${STYLES.join(', ')}`);
    process.exit(1);
  }
  if (!ASPECT_RATIOS.includes(aspect as (typeof ASPECT_RATIOS)[number])) {
    console.error(`--aspect must be one of ${ASPECT_RATIOS.join(', ')}`);
    process.exit(1);
  }

  const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as ProductBrief;

  try {
    const script = await generateScript(brief, style, aspect);
    console.log(JSON.stringify(script, null, 2));
    console.error(
      `\n[${brief.name} | ${style} | ${aspect}] ` +
        `${script.word_count} words, ${script.total_duration_s}s` +
        (script.warnings.length ? ` — WARNINGS: ${script.warnings.join('; ')}` : ' — clean')
    );
  } catch (err) {
    console.error('script failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
