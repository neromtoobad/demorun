# PHASE_0_NOTES.md — measured facts (paste into Phase 2 Prompt 2.1)

Measured 2026-07-04 with a real end-to-end run. Venice key balance at measurement: ~$32.79.

## Decision (locked)
- **All-video** pipeline (not images). Price raised to **1.5 USDT**. COGS ~$0.54 → ~2.8× markup.
- The original CLAUDE.md anchor "10s@1080p = $0.085" was WRONG (~13×). See [[venice-cogs-reality]].

## Models chosen
- **Clips:** `longcat-distilled-text-to-video` — cheapest capable 720p model. $0.18 per 10s/720p clip.
  (Alternatives: ltx-2-19b-distilled $0.20; wan-2.5-preview $1.10 — too expensive.)
- **Voice:** `tts-kokoro`, voice `af_bella` (warm; 40+ voices available). $3.50 / 1M input chars.
- **No image model** (all-video).

## Endpoints verified (base https://api.venice.ai)
- Quote (free): `POST /api/v1/video/quote` `{model,prompt,duration,resolution,aspect_ratio}` → `{"quote": <USD>}`.
- Queue: `POST /api/v1/video/queue` `{model,prompt,duration,resolution,aspect_ratio}` → `{"queue_id": "..."}`.
- Retrieve: `POST /api/v1/video/retrieve` `{queue_id, model}` → JSON `{"status":"PROCESSING","average_execution_time":<ms>,"execution_duration":<ms>}` while running, then the **raw mp4 inline** (`Content-Type: video/mp4`) when done. **`model` is REQUIRED** (undocumented — omitting it returns "Model is required").
- TTS: `POST /api/v1/audio/speech` `{model,input,voice,response_format:"mp3"}` → `audio/mpeg`.

## Costs (this 30s video)
- 3 clips × $0.18 = **$0.54**
- TTS: 507 chars → **$0.0018**
- ffmpeg assembly: free (runs locally and in the container)
- **Total COGS ≈ $0.542 / video** (2.77× at 1.5 USDT)

## Wall-clock
- Single 10s clip: ~6.5–8.6 min (the `average_execution_time` field reads ~11.5 min but actual was faster).
- **3 clips generated CONCURRENTLY: ~7.7 min total.** Sequential would be ~24 min — clips MUST be concurrent.
- TTS + ffmpeg: seconds. End-to-end ≈ 8 min. Set `eta_seconds` ≈ 600.

## Gotchas (critical for src/lib/venice.ts)
1. `retrieve` requires `model` alongside `queue_id`.
2. **Retrieve ONCE per queue_id and persist the mp4 immediately.** Re-polling a completed id can transiently return `{"error":"Request ID is invalid."}` — never overwrite a good mp4 with a later response. (Retry is fine on transient invalid, but guard the saved file.)
3. Durations are approximate: asking `"10s"` yielded a **13.04s** clip. ffmpeg trims each clip to the beat block length.
4. `delete_media_on_completion` defaults false — media persisted and was re-fetchable minutes later.
5. **Scene prompts MUST avoid readable UI / text / code / screens** — the model renders on-screen text as gibberish. Atmospheric / product / people / environment shots look genuinely good; burned subtitles carry the actual message. This is a scene_prompt rule for the script stage, and it holds for ALL video models (even the $1.10 one), so paying more does NOT fix text.

## Assembly recipe (validated)
Per beat: block length = that beat's voiceover duration; trim clip to it; scale/crop to 720×1280; set audio to the beat voiceover. Concat the 3 blocks, then burn an SRT (sentence-level cues) with the subtitles filter. Output: 33s, H.264 + AAC, 9:16. Sample lives at ~/Downloads/demorun_sample.mp4.
