// Script generation: ProductBrief -> 3-beat VideoScript via the Anthropic API.
//
// The 3-beat structure (from CLAUDE.md): hook (0-5s), what-it-does with ONE
// concrete differentiator (5-20s), CTA (20-30s). ~60 spoken words max, total
// 15-30s. Every beat earns its seconds — a script that lands in 18s beats one
// padded to 30.

import type { ProductBrief, Style, VideoScript, ScriptBeat } from '../types.js';
import { callClaudeTool, type ToolDef } from './anthropic.js';

const DEFAULT_MODEL = process.env.SCRIPT_MODEL || 'claude-sonnet-5';

// What each style preset should look like on screen — fed to the model so
// scene_prompt lines are concrete and filmable, not abstract moods.
const STYLE_GUIDE: Record<Style, string> = {
  'clean-tech':
    'crisp product UI and screen recordings, minimal sets, cool neutral tones, subtle motion graphics, confident and modern',
  ugc: 'handheld phone footage, a real person talking to camera, casual authentic lighting, everyday settings, unpolished and genuine',
  cinematic:
    'film-grade lighting, shallow depth of field, dramatic composition, sweeping b-roll, rich color grade',
};

const SYSTEM = `You write scripts for product demo videos that run about 30 seconds. You return exactly three beats via the emit_script tool. One video clip per beat.

Structure (mandatory):
1. role "hook" (~10s): open with the core promise, with enough context to land it. Punchy but not thin.
2. role "what-it-does" (~10s): explain how it works and give TWO or THREE concrete, specific product details or differentiators. Real specifics, not a vague feature list.
3. role "cta" (~10s): reinforce the concrete payoff, then one clear call to action.

Hard limits:
- Each beat's duration_s is EITHER 5 or 10 — these are the only clip lengths available. The three durations sum to 25-30; prefer 30 (i.e. 10/10/10).
- Total spoken words across all three voiceover lines: 90-100. Pack in real, specific detail — this should feel full, not thin. A 10s beat carries ~30 words at a brisk but clear pace (~3.2 words/second). Keep sentences short so it stays intelligible at that pace.

Voice:
- Grounded and human. Short sentences. Sound like a person, not a brochure.
- BANNED words/constructions: "seamlessly", "unleash", "game-changing", "revolutionary", "supercharge", "effortlessly", "the future of", "say goodbye to". No "it's not X, it's Y" constructions. No stacked sentence fragments. No hype. No emojis.

scene_prompt (for each beat): a concrete, filmable visual direction that matches the requested style preset. Describe a specific shot — subject, action, framing — not an abstract mood.`;

const TOOL: ToolDef = {
  name: 'emit_script',
  description: 'Return the finished 3-beat video script.',
  input_schema: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['hook', 'what-it-does', 'cta'] },
            voiceover: { type: 'string', description: 'the spoken line' },
            scene_prompt: {
              type: 'string',
              description: 'concrete filmable visual direction for this beat',
            },
            duration_s: {
              type: 'number',
              enum: [5, 10],
              description: 'clip length in seconds — 5 or 10 only',
            },
          },
          required: ['role', 'voiceover', 'scene_prompt', 'duration_s'],
        },
      },
    },
    required: ['beats'],
  },
};

const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

export interface ScriptResult extends VideoScript {
  warnings: string[];
}

export async function generateScript(
  brief: ProductBrief,
  style: Style,
  aspectRatio: string,
  model = DEFAULT_MODEL
): Promise<ScriptResult> {
  const user = [
    `Product brief (JSON):`,
    JSON.stringify(brief, null, 2),
    ``,
    `Style preset: ${style} — ${STYLE_GUIDE[style]}`,
    `Aspect ratio: ${aspectRatio}`,
    ``,
    `Write the 3-beat script now via emit_script.`,
  ].join('\n');

  const out = await callClaudeTool<{ beats: ScriptBeat[] }>({
    model,
    system: SYSTEM,
    user,
    tool: TOOL,
    maxTokens: 1024,
  });

  const beats = out.beats ?? [];
  const word_count = beats.reduce((n, b) => n + wordCount(b.voiceover), 0);
  const total_duration_s = beats.reduce((n, b) => n + (b.duration_s || 0), 0);

  // Soft validation — surfaced as warnings for the human review gate rather
  // than hard-failing, so we can see and iterate on near-misses.
  const warnings: string[] = [];
  if (beats.length !== 3) warnings.push(`expected 3 beats, got ${beats.length}`);
  const roles = beats.map((b) => b.role).join(',');
  if (roles !== 'hook,what-it-does,cta') warnings.push(`unexpected beat order: ${roles}`);
  const badDur = beats.filter((b) => b.duration_s !== 5 && b.duration_s !== 10);
  if (badDur.length) warnings.push(`beat durations must be 5 or 10 (got ${beats.map((b) => b.duration_s).join('/')})`);
  if (word_count < 80 || word_count > 105) warnings.push(`word count ${word_count} outside 90-100 target`);
  if (total_duration_s < 25 || total_duration_s > 30)
    warnings.push(`total duration ${total_duration_s}s outside 25-30s`);

  return { beats, total_duration_s, word_count, warnings };
}
