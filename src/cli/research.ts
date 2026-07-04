// CLI: run the research stage standalone (per the "every module runs via CLI"
// rule). Usage:
//   npm run research -- https://www.okx.ai/agents
//   npm run research -- --text "A tool that turns URLs into demo videos"

import { research } from '../lib/research.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: npm run research -- <url> | --text "<description>"');
    process.exit(1);
  }

  let input: string;
  let inputType: 'url' | 'text';
  if (args[0] === '--text') {
    input = args.slice(1).join(' ');
    inputType = 'text';
  } else if (/^https?:\/\//i.test(args[0])) {
    input = args[0];
    inputType = 'url';
  } else {
    input = args.join(' ');
    inputType = 'text';
  }

  try {
    const brief = await research(input, inputType);
    console.log(JSON.stringify(brief, null, 2));
  } catch (err) {
    console.error('research failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
