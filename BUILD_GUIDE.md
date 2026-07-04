# BUILD_GUIDE.md — DEMORUN

## Timeline
- Jul 4–7 — Phase 0 (admin gaps during SOOTH crunch; SOOTH ships Jul 7)
- Jul 8 — Phase 1: service skeleton
- Jul 9–10 — Phase 2: real pipeline
- Jul 11 — Phase 3: payments
- Jul 12 — Phase 4: listing submitted for OKX review [HARD GATE]
- Jul 13–17 — Phase 5: proof, campaign, sales, form submission (Jul 17 23:59 UTC)

Note: Hook x World Cup closes Jul 12. If both are live, DEMORUN's Phase 4 submission happens Jul 12 morning and the World Cup submission takes the rest of that day. Phases 1–3 must not slip.

## Architecture

```
client (human or agent)
   │  POST /v1/jobs  (x402 402 → pay → retry)
   ▼
Hono server (Railway) ── SQLite job store
   │  enqueue
   ▼
worker loop (same process, serial queue)
   research → script → visuals → voice → assemble → deliver
   (module)   (module)  (Venice)   (Venice TTS)  (ffmpeg)  (storage)
                         └── src/lib/venice.ts: async queue, per-model clip gen
   │
   ▼
GET /v1/jobs/:id → { status, result_url }
```

Design rules:
- One process, serial job queue. No Redis, no workers-as-services. Volume during the campaign will be tens of jobs, not thousands. Small beats ambitious.
- Every pipeline stage writes its output to the job record as it completes, so a crashed job resumes from the last completed stage instead of restarting (and re-burning credits).
- Idempotent Venice calls: store queue_id + download_url on the job the moment the queue response returns; on retry, poll the existing queue_id instead of resubmitting. Never re-burn credits for a clip that is already generating.
- Hard timeout per stage; a stage that exceeds it marks the job `failed` with a reason. Failed paid jobs get flagged for manual refund/redo — protect the review score at all costs. Revenue Rocket counts positive reviews.

## Phase 1 — Service skeleton (Jul 8)
Deliverables:
- Hono server: POST /v1/jobs, GET /v1/jobs/:id, GET /v1/health
- SQLite schema: jobs(id, input, style, aspect_ratio, status, stage, stage_outputs JSON, result_url, error, paid_tx, created_at, updated_at)
- Serial worker loop with a MOCK pipeline (each stage sleeps 2s and writes a placeholder)
- x402 gate as a stub middleware (env flag `PAYMENTS_ENFORCED=false`) so the pipeline is testable without payments
- Deployed to Railway at the final domain
Exit test: submit a job via curl, poll it to completion, get a placeholder URL.

## Phase 2 — Real pipeline (Jul 9–10)
Order of implementation (riskiest first):
1. `visuals` + `assemble` — the Venice integration is the critical path. src/lib/venice.ts: clip gen through the async queue (persist queue_id + one-time download_url immediately), TTS, and image gen. Generate the 3 beat clips CONCURRENTLY (they're independent) but poll politely. Then ffmpeg stitching with burned subtitles to exact per-beat durations. Validate against the Phase 0 manual run.
2. `script` — 3-beat structure (hook / what-it-does / CTA), ~60 spoken words max, per-beat scene directions that feed `visuals` directly. Anthropic API. Output is structured JSON: `{ beats: [{ role, voiceover, scene_prompt, duration_s }] }` totaling 15–30s.
3. `research` — URL fetcher + parser. Handle three input classes: okx.ai listing URLs, GitHub repos, generic landing pages. Plus plain-text input passthrough. Extract a normalized product brief: `{ name, one_liner, audience, features[], tone }`.
Exit test: `POST /v1/jobs` with a real okx.ai listing URL produces a watchable 15–30s MP4, unattended, twice in a row.

## Phase 3 — Payments (Jul 11)
- Replace the stub with real x402 exact-scheme verification per the OKX Payment SDK / onchainos-skills dispatcher. Unpaid POST → 402 with payment requirements; paid POST → verify settlement, record tx hash on the job, enqueue.
- Price: flat 1 USDT per job (PRICE_USDT env). Locked — Phase 0 cost engineering guarantees the margin, not the price.
- Manual test: pay from a second wallet, confirm settlement on X Layer explorer, confirm the job runs.
Exit test: one real paid call, on-chain proof saved to PROOF.md (tx hash + explorer link + resulting video URL).

## Phase 4 — Listing (Jul 12, morning) [HARD GATE]
- Category: Art Creation.
- Routing description: this is craft, not filler. Enumerate the natural-language requests that should route to DEMORUN: "make a demo video", "product video", "promo video for my agent", "hackathon demo video", "turn my listing into a video", "short explainer video", "15 second promo". Study top-selling listings' description patterns first.
- Listing copy: lead with the hackathon use case ("your #OKXAI demo video, made by an agent, for 1 USDT"), turnaround time, and a sample video link. The $1 flat price IS the headline — no menu to explain.
- Attach 2–3 sample videos (made in Phase 2 testing — make the test subjects real marketplace agents; they become marketing when you tag their builders).
- Submit for internal review. Then monitor daily; respond to reviewer feedback within hours, not days.

## Phase 5 — Proof + campaign (Jul 13–17)
- The self-demo: DEMORUN's own hackathon demo video is generated BY DEMORUN from its own listing URL. This is the single strongest proof artifact — say so explicitly in the X post and the form.
- Launch thread on the dedicated X account + main account amplification. Post the sample videos tagging the agents featured.
- Direct sales: work the Phase 0 target list. Offer: first 10 entrants who DM get their video FREE (COGS ≤ 0.33 each, so ~3 USDT total buys 10 reviews and 10 posted videos carrying DEMORUN's name). Everyone after: 1 USDT.
- Every delivered video → ask the buyer to post it with #OKXAI and leave a review. Reviews are a judged Revenue Rocket input.
- README, PROOF.md (tx hashes, videos, sales count), repo cleanup.
- 4 slides + 90s video script (the video already exists — DEMORUN made it).
- Google form submitted Jul 16, not Jul 17. Never deadline-day.

## Competitive positioning (from the live marketplace scan, Jul 4)
- Art Creation category: AlphaQuill (text/covers, 3 sold), XBubbleAI (0 sold), 香蕉智投 Angel (0 sold). No video-capable agent exists on the platform.
- Proven demand patterns to copy: cheap-call/high-volume (CoinAnk 695 sold at 0.01), meta-services about the platform itself (dealer.exe), shareable identity artifacts (SoulMirror, 60 sold).
- DEMORUN combines all three: it is a meta-service (serves other agents/builders), produces a shareable artifact (the video), and at 1 USDT it IS the cheap high-frequency call — a finished video priced like a data query.

## Failure modes to design around
- Venice flakiness → per-stage resume + idempotent queue IDs (see Design rules). Model degradation → swap the clip model within Venice (Seedance ↔ Kling ↔ Wan) via config, no code change.
- Cost creep → 720p default, 3 clips max, durations capped; the child-key spend cap is the hard backstop.
- OKX review rejection → submit Jul 12 to leave a full iteration cycle; keep the listing copy conservative (no revenue promises, no "guaranteed viral").
- COGS blowout → the price never moves; cut clips (3→2), duration, or resolution until COGS ≤ 0.33 USDT. Phase 0 proves this before any listing goes live.
- Zero organic discovery in week one → the direct-sales list from Phase 0 is the real channel; the marketplace listing is the checkout, not the funnel.
