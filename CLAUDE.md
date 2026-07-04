# CLAUDE.md — DEMORUN

## What this is
DEMORUN is an Agent Service Provider (ASP) on OKX.AI. It turns any product, agent listing, or project into a finished 30-second demo video. Input: a URL or product description. Output: a tight vertical/landscape video with script, AI visuals, voiceover, and subtitles. Short by design: cheaper to produce, punchier on X, and well inside the hackathon's 90-second demo cap.

Built for the OKX.AI Genesis Hackathon (deadline Jul 17, 2026, 23:59 UTC). Target awards: Artistic Excellence, Revenue Rocket, Social Buzz, Best Product.

Primary launch market: other hackathon entrants. Every submission requires a demo video under 90 seconds posted on X with #OKXAI. DEMORUN sells that video.

## Core loop (never lose sight of this)
Client calls DEMORUN → pays per call (A2MCP, x402) → pipeline produces the video autonomously → client retrieves the video URL → client posts it with #OKXAI → the video itself advertises DEMORUN.

Close the loop. No manual steps in the happy path.

## Registration mode
A2MCP (Agent-to-MCP): standardized pay-per-call service, no negotiation, requires OKX Payment SDK integration before going live. NOT A2A escrow for v1 — negotiation friction kills order velocity, and Revenue Rocket counts orders and reviews, not just revenue.

## Pricing (one price, one product)
- 1.5 USDT per video. Pay-per-call. No tiers, no preview, no upsells, no negotiation. (Raised from 1 USDT after Phase 0 measured real Venice pricing — see PHASE_0_NOTES.md. The original "10s@1080p=$0.085" anchor was wrong by ~13×.)
- Measured COGS ≈ 0.54 USDT/video: 3 clips × $0.18 (longcat-distilled 10s/720p) + ~$0.002 TTS → ~2.8× markup. The clip model IS the cost driver — only the cheapest tier keeps the price sane (longcat-distilled $0.18, ltx-distilled $0.20; wan-2.5 at $1.10/clip is out).
- Hard COGS guard: sum POST /video/quote for all 3 clips before generating; reject the job if the total exceeds MEDIA_BUDGET_USD (0.60). If a model swap pushes COGS up, drop resolution (720p→480p) before shortening the 30s length.
- The economics are a volume play: 1.5 USDT is still an impulse buy, and Revenue Rocket counts orders and reviews, not margin.

## API shape (async job pattern — video gen takes minutes)
- `POST /v1/jobs` — x402-gated, 1.5 USDT. Body: `{ input_url | input_text, aspect_ratio, style }`. Returns `{ job_id, eta_seconds }` (eta ≈ 600s — clip gen dominates). Payment settles on submission.
- `GET /v1/jobs/:job_id` — free. Returns `{ status, result_url?, script?, error? }`.
- `GET /v1/health` — free.

Unpaid POST returns HTTP 402 with x402 payment requirements (same pattern as Onchain Data Explorer on the marketplace).

## Pipeline stages (each a separate module, each testable via CLI)
1. `research` — fetch and parse the input URL (okx.ai listing, GitHub repo, landing page) or use provided text. Extract: name, what it does, who it's for, key features, tone.
2. `script` — generate the ~30s script using the 3-beat structure: hook (0–10s), what-it-does with two or three concrete differentiators (10–20s), CTA (20–30s). Word budget ~90–100 spoken words (brisk but intelligible). Per-beat durations are 5s or 10s only (they map 1:1 to Venice clips); 30s = 10/10/10. Detail over padding.
3. `visuals` — generate 3 clips via Venice (one per beat, 10s each; Venice supports 5s or 10s). Generate all 3 CONCURRENTLY (~8 min each; sequential would be ~24 min). Style presets: `clean-tech`, `ugc`, `cinematic`. CRITICAL scene-prompt rule: keep scene directions to atmospheric / product / people / environment shots — NEVER readable UI, text, code, or screens. The model renders on-screen text as gibberish (true of every video model, so paying more doesn't fix it); the burned subtitles carry the actual message.
4. `voice` — TTS voiceover from the script via Venice.
5. `assemble` — ffmpeg: stitch clips + voiceover + burned subtitles into final MP4. Exact-duration blocks per beat.
6. `deliver` — upload to storage, return public URL, mark job complete.

## Stack
- TypeScript, Node 20, Hono (or Express) server
- SQLite for job store (no external DB dependency)
- Hosting: Railway (prior art: SKINS runs there)
- Payments: OKX Payment SDK / x402 exact scheme via okx/onchainos-skills patterns
- Media: Venice API only. src/lib/venice.ts — thin client: quote, genClip, genVoice, poll. Video is async queue: POST /api/v1/video/queue `{model,prompt,duration,resolution,aspect_ratio}` → `{queue_id}`; poll POST /api/v1/video/retrieve `{queue_id, model}` (BOTH required — model is easy to forget). Retrieve returns JSON {status: PROCESSING, average_execution_time, execution_duration} while running, then the raw mp4 inline (Content-Type video/mp4) for standard models; Grok-Private variants instead return a one-time download_url at queue time — handle both shapes. IMPORTANT: retrieve ONCE and persist the mp4 immediately — re-polling a finished id can transiently return `{"error":"Request ID is invalid."}`, so never clobber a good file. Params: duration "5s"|"10s" (approximate — "10s" yields ~13s; ffmpeg trims per beat), resolution "480p"|"720p", aspect_ratio per model (check /models?type=video). ALWAYS call POST /api/v1/video/quote first and reject any job whose summed quotes exceed MEDIA_BUDGET_USD — hard programmatic COGS guarantee. Clip model: **longcat-distilled-text-to-video** (measured $0.18/clip at 10s/720p; VIDEO_MODEL env swaps it). Voice: Venice TTS via POST /api/v1/audio/speech `{model,input,voice,response_format:"mp3"}` (tts-kokoro, ~$0.002/script). Cleanup: delete_media_on_completion defaults false — set true on retrieve once the mp4 is saved.
- Assembly: ffmpeg in the container (per-beat exact-duration blocks + burned subtitles). No external assembly service.
- Storage: Railway volume + public route, or Cloudflare R2 if needed

## Non-negotiables
- Configure git identity BEFORE the first commit. No AI co-author attribution in any commit.
- Small beats ambitious. v1 is ONE product at ONE price: 1.5 USDT → one ~30s video. Three style presets, two aspect ratios. No tiers, no previews, no custom branding, no revisions endpoint, no A2A mode.
- Real on-chain action wins: every paid call must be a real x402 settlement on X Layer, verifiable.
- Ship the listing for OKX internal review by Jul 12. Review approval is a hard eligibility gate — if it doesn't go live, the submission is invalid.
- Every module runs standalone via CLI (`npm run research -- <url>`, etc.) so failures are isolated fast.

## Environment variables
```
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
VENICE_API_KEY=              # child key with spend cap sized to campaign media budget
MEDIA_BUDGET_USD=0.60        # per-job hard cap, enforced via /video/quote before any generation
VIDEO_MODEL=longcat-distilled-text-to-video  # cheapest capable 720p clip model ($0.18/10s)
VOICE_MODEL=tts-kokoro
VOICE=af_bella
ANTHROPIC_API_KEY=           # script stage (3-beat generation)
PRICE_USDT=1.5
PAYOUT_ADDRESS=        # X Layer address receiving USDT
DATABASE_PATH=./data/demorun.db
PUBLIC_BASE_URL=
```
Never commit .env. Never print credentials in logs.

## Definition of done (per phase — see BUILD_GUIDE.md)
- P1: server up, job lifecycle works end-to-end with a mock pipeline
- P2: real pipeline produces a watchable video from a URL, unattended
- P3: a real paid call settles on X Layer and returns a video
- P4: listing submitted for OKX review with engineered routing description
- P5: DEMORUN's own hackathon demo video exists — made by DEMORUN — and the form is submitted

## Key references
- ASP tutorial: https://www.okx.ai/tutorial/asp (JS-rendered — read in browser)
- Payments/skills: https://github.com/okx/onchainos-skills
- OKX.AI overview: https://www.okx.com/en-us/learn/okx-ai
- Marketplace (competitor scan + routing description patterns): https://www.okx.ai/agents
