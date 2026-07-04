# EXECUTION_PLAN.md — DEMORUN
Prompt-by-prompt plan for Claude Code. Paste each prompt in order. One prompt = one working session goal. Commit at every ✅.

Before Prompt 1.1: Phase 0 checklist complete, repo cloned locally with CLAUDE.md, PHASE_0_CHECKLIST.md, BUILD_GUIDE.md, and this file at the root. Claude Code reads CLAUDE.md automatically — every prompt below assumes that context.

---

## PHASE 1 — SERVICE SKELETON (Jul 8)

### Prompt 1.1 — Project scaffold
```
Read CLAUDE.md and BUILD_GUIDE.md fully before doing anything.

Scaffold the DEMORUN service:
- TypeScript, Node 20, Hono server, better-sqlite3 for the job store
- src/server.ts (routes), src/db.ts (schema + queries), src/worker.ts (serial queue loop), src/pipeline/index.ts (stage runner), src/pipeline/stages/*.ts (research, script, visuals, voice, assemble, deliver — all MOCK implementations for now: each sleeps 2 seconds and writes a placeholder string to stage_outputs)
- Job schema exactly as specified in BUILD_GUIDE.md Phase 1
- Routes: POST /v1/jobs (validate body: exactly one of input_url or input_text, aspect_ratio ∈ [9:16, 16:9], style ∈ [clean-tech, ugc, cinematic]; create job, return { job_id, eta_seconds }), GET /v1/jobs/:id, GET /v1/health
- x402 gate as middleware stub: if env PAYMENTS_ENFORCED=true, return 402 with a placeholder payment-requirements body; else pass through
- The worker resumes from the last completed stage on restart (read job.stage on boot)
- npm scripts: dev, build, start
- .env.example with every variable from CLAUDE.md, .gitignore covering .env and /data

Write a smoke test script (scripts/smoke.sh) that POSTs a job, polls until done, and prints the result. Run it and show me the output.
```
✅ Commit: `phase1: service skeleton with mock pipeline`

### Prompt 1.2 — Deploy
```
Prepare this repo for Railway deployment: Dockerfile or nixpacks config as appropriate, PORT from env, DATABASE_PATH pointing at a mounted volume path, health check on /v1/health.

Then give me the exact Railway setup steps (service creation, volume mount, env vars, domain attach for the subdomain I specify) as a numbered list I can execute in the dashboard. Do not fake completion — after I deploy, I will run scripts/smoke.sh against the live URL and paste you the output to verify.
```
✅ Commit: `phase1: railway deploy config`
✅ Gate: smoke test passes against the live domain.

---

## PHASE 2 — REAL PIPELINE (Jul 9–10)

### Prompt 2.1 — Venice clips, voice + ffmpeg assembly (critical path first)
```
Read CLAUDE.md. We now replace the mock visuals/voice/assemble stages with the real Venice integration.

Here are the facts from my Phase 0 manual run (pasting below): models chosen for clips/stills/voice, exact endpoints verified, cost per asset, generation wall times, chosen clip duration and resolution.

[PASTE PHASE 0 NOTES HERE]

Implement:
- src/lib/venice.ts — thin client: quote(model, duration, resolution), genClip, genVoice, poll(model, queue_id), with retries and a hard timeout per generation. Video flow per Venice docs: POST /api/v1/video/queue (model, prompt, duration "5s"|"10s", resolution "720p", aspect_ratio) → poll POST /api/v1/video/retrieve every 5s. Handle BOTH completion shapes: standard models (wan-2.5) return the raw mp4 inline with Content-Type video/mp4; Grok-Private variants return a one-time download_url in the queue response instead — persist it immediately and GET it on COMPLETED. Persist queue_id on the job the moment queue returns; retries poll the existing queue_id, never resubmit (idempotency rule). Use average_execution_time from PROCESSING responses for eta. Set delete_media_on_completion: true. Handle 422 (content violation → fail the job with a clear reason), 402 (insufficient Venice balance → alert loudly), 500/503 (retry with backoff).
- Budget gate: before submitting any clips, call /video/quote for each planned clip and sum; if total exceeds MEDIA_BUDGET_USD from env, fail the job before spending anything.
- stages/visuals.ts — takes the script JSON's 3 beats, generates one clip per beat (5s default, 720p) in the job's style preset, 9:16 or 16:9 per aspect_ratio. Submit all 3 concurrently, poll politely.
- stages/voice.ts — voiceover from the full script text via Venice TTS.
- stages/assemble.ts — ffmpeg in the container: concat beat clips to exact per-beat durations, lay the voiceover, burn subtitles. Total output 15–30s.
- stages/deliver.ts — write the MP4 to the volume, expose it at GET /v1/assets/:job_id.mp4, set result_url.

Test with a hardcoded 3-beat script first. Show me the output URL and the total Venice cost for the run (from the quote calls).
```
✅ Commit: `phase2: venice integration + ffmpeg assembly`

### Prompt 2.2 — Script generation
```
Implement stages/script.ts. Input: the normalized product brief from research. Output: structured JSON { beats: [{ role, voiceover, scene_prompt, duration_s }] } totaling 15–30 seconds, ~60 spoken words max, using the 3-beat structure from CLAUDE.md (hook 0–5s, what-it-does with one concrete differentiator 5–20s, CTA 20–30s). Every beat earns its seconds — a script that lands in 18s is better than one padded to 30.

Rules for the writing: grounded human tone, short sentences, no hype words, no AI-slop constructions ("it's not X, it's Y", stacked fragments, "seamlessly", "unleash", "game-changing" are all banned). scene_prompt for each beat must be a concrete visual direction compatible with the job's style preset, not an abstract mood.

Use the Anthropic API (key from env). Add a CLI entry: npm run script -- --brief ./fixtures/brief.json. Create two fixture briefs (one crypto agent, one non-crypto product) and show me both generated scripts for my review before wiring it into the pipeline.
```
✅ Gate: I approve script quality on both fixtures. Iterate the prompt inside script.ts until I do.
✅ Commit: `phase2: script generation with 3-beat structure`

### Prompt 2.3 — Research + end-to-end
```
1. Implement stages/research.ts: fetch input_url with a sane timeout, detect page class (okx.ai agent listing / GitHub repo / generic page), parse to the normalized brief { name, one_liner, audience, features[], tone }. For input_text, map straight to a brief. Handle fetch failures with a clear job error, never a hang.
2. Wire the full pipeline order in worker.ts.
3. Run the pipeline end-to-end TWICE against two real okx.ai agent listing URLs I will paste, unattended. Both must complete. Show me both video URLs and the total Venice cost/time per job — each run must come in at or under 0.33 USDT COGS.
```
✅ Gate: two consecutive unattended successes.
✅ Commit: `phase2: full pipeline end-to-end`

---

## PHASE 3 — PAYMENTS (Jul 11)

### Prompt 3.1 — x402 integration
```
Read CLAUDE.md payments section. I have cloned okx/onchainos-skills locally at [PATH] and my OKX API credentials are in .env.

Replace the x402 middleware stub with the real OKX Payment SDK / x402 exact-scheme flow for A2MCP:
- Unpaid POST /v1/jobs → HTTP 402 with the correct payment-requirements payload (flat PRICE_USDT=1 from env)
- Paid POST → verify settlement server-side, store the tx hash on the job, enqueue
- GET endpoints stay free; POST without payment never enqueues work

Follow the dispatcher patterns in the onchainos-skills repo — read its x402 exact scheme reference before writing code. If anything in the SDK contradicts CLAUDE.md assumptions, stop and tell me instead of improvising.
```
✅ Commit: `phase3: x402 exact-scheme payment gate`

### Prompt 3.2 — Live payment proof
```
I am going to make a real paid call from a second wallet now. Walk me through it: the exact request sequence a paying client performs (402 → construct payment → retry), then verify with me: (1) settlement visible on the X Layer explorer, (2) tx hash recorded on the job row, (3) video delivered.

Then create PROOF.md at repo root and record: tx hash + explorer link, the job ID, the result video URL, timestamp. This file grows through Phase 5 with every sale.
```
✅ Gate: real on-chain settlement + delivered video.
✅ Commit: `phase3: live payment proof`

---

## PHASE 4 — LISTING (Jul 12 morning) [HARD GATE]

### Prompt 4.1 — Listing package
```
Write the DEMORUN marketplace listing package into /listing:
- routing-description.txt — the agent-routing description. Study the pattern first: I will paste the descriptions of the top 5 selling agents on okx.ai. Enumerate concrete trigger phrases (demo video, product video, promo video, hackathon demo, explainer video, turn my listing into a video, 90 second video) woven into natural prose. Target under 900 characters.
- listing-copy.md — the human-facing listing: lead with the hackathon use case and the flat 1 USDT price, turnaround time, what the buyer receives, 3 sample video links (placeholders I will fill), and honest limits (one style preset per job, no revisions in v1).
- api-docs.md — the two endpoints, request/response schemas, the 402 payment flow, one full curl walkthrough.

Writing rules: grounded, short sentences, zero hype, no banned constructions. This copy is also review material for OKX's internal team — make no claims about earnings, virality, or guarantees.
```
✅ Gate: I submit the listing for OKX review myself and log the submission time in NOTES.md.
✅ Commit: `phase4: listing package`

---

## PHASE 5 — PROOF + CAMPAIGN (Jul 13–17)

### Prompt 5.1 — The self-demo
```
POST a job to production where input_url is DEMORUN's own live okx.ai listing URL. This video is our hackathon demo — made by the product, about the product.

After it completes, review the script it generated with me. If the hook is weak we re-roll once with a style change, but we do NOT hand-edit the video: the honesty of "DEMORUN made this unassisted" is the entire point, and we say exactly that in the submission.
```
✅ Commit: PROOF.md updated with the self-demo.

### Prompt 5.2 — Launch content
```
Read my base content template rules in CLAUDE.md style notes. Write:
1. The launch thread for the DEMORUN X account: 8–10 posts. Structure: hook (the video in post 1 IS the product output), what it is, the flat 1 USDT price, the free-video offer for the first 10 hackathon entrants who DM, how to call it, close.
2. Three X-type posts for my main account, 3 versions each (clean, sharper, more relatable), structure hook → shift → tools/details → old vs new → punchy close.
3. A 15-line DM template for the target-customer list: personal, references THEIR agent by name, offers the free video (first-10 offer).
All posts include #OKXAI where required. lowercase, no bold, no emojis, no em dashes, ➠ for any listing.
```

### Prompt 5.3 — Submission package
```
Final wrap:
1. README.md — what DEMORUN is, architecture diagram (ASCII), how to call it, the self-demo link, PROOF.md summary (sales count, tx hashes, reviews).
2. Repo cleanup: no dead code, no mock stages left in the tree, .env.example current.
3. 4 slides (markdown outline): problem → what DEMORUN does + the self-demo → traction (orders, reviews, on-chain proof) → why it wins the category.
4. A filled draft of every hackathon form field from NOTES.md, ready to paste.
Submission goes in Jul 16. Nothing ships on deadline day.
```
✅ Final commits. Form submitted Jul 16.

---

## Stuck protocol (any phase)
```
We are stuck on [X]. Stop coding. Restate: what we are trying to do, what we observed instead, the exact error, and the three most likely causes ranked. Then propose the smallest possible experiment to distinguish between them. Do not attempt a fix until I approve the diagnosis.
```

## Session-start prompt (every new Claude Code session)
```
Read CLAUDE.md, BUILD_GUIDE.md, and PROOF.md. Then read git log --oneline -15. Tell me: current phase, last completed gate, and the single next action from EXECUTION_PLAN.md. Wait for my go.
```
