# PHASE_0_CHECKLIST.md — DEMORUN

Do these before writing any code. Most are admin tasks that fit into gaps during the SOOTH crunch (Jul 4–7). Anything marked [BLOCKER] must be resolved before Phase 1 starts.

## A. Platform access + rules
- [ ] [BLOCKER] Register on okx.ai and start ASP registration. Read https://www.okx.ai/tutorial/asp fully in a browser (page is JS-rendered, tools can't scrape it). Screenshot every step of the flow.
- [ ] [BLOCKER] Get OKX API credentials from the OKX Developer Portal (API key, secret, passphrase).
- [ ] Confirm in the OKX.AI Discord/Telegram: how long does internal listing review take? This sets the hard date for Phase 4 submission. Assume 3–5 days if no answer; submit by Jul 12 regardless.
- [ ] Confirm: can one builder list multiple ASPs? (Affects whether a second entry ships later.)
- [ ] Open the hackathon Google form and copy every field into NOTES.md so nothing is discovered on deadline day.
- [ ] Read the ToS at https://www.okx.ai/help/okx-ai-agent-marketplace-user-agreement — flag anything about content services, refunds, or prohibited categories.

## B. Payments plumbing
- [ ] [BLOCKER] Clone https://github.com/okx/onchainos-skills. Read the unified payment dispatcher docs: x402 `exact` scheme is the target (pay-per-call, settle on submission).
- [ ] Identify exactly what "OKX Payment SDK integration" means for an A2MCP listing — SDK package name, server-side verification flow, settlement chain (X Layer), currency (USDT).
- [ ] Create/confirm the payout address on X Layer. Check whether the provider side needs gas (OKB) for anything; fund if so.
- [ ] Study one live x402 A2MCP agent as reference implementation. Onchain Data Explorer is the model: HTTP POST, unpaid requests get 402, GET returns 405.

## C. Media provider decision [BLOCKER]
Timebox this to ONE day. Venice is the provider. The single most important output of Phase 0: a measured COGS at or under ~0.33 USDT per video, because the price is locked at 1 USDT and does not move.
- [ ] Venice setup: create a child API key with a spend cap sized to the campaign media budget. Runaway job loop worst case = the cap, not the balance.
- [ ] Run one clip through the async queue (POST /api/v1/video/queue with model wan-2.5-preview-text-to-video, duration "5s", resolution "720p" → poll POST /api/v1/video/retrieve every 5s → mp4 comes back inline). Test one TTS call.
- [ ] Use POST /api/v1/video/quote to price every candidate config BEFORE generating — it returns exact USD. Quote 5s@480p, 5s@720p, 10s@720p on wan-2.5 and any other candidate from /models?type=video. Known anchor: 10s@1080p on wan-2.5 quotes $0.085, so the budget has room — pick on quality, confirm with quotes.
- [ ] Run ONE full 15–30s video manually end-to-end (3-beat script → 3 clips → voiceover → ffmpeg assembly with burned subtitles). Record: total cost, wall-clock time, models used.
- [ ] If COGS lands above 0.33: drop to 2 clips (hook clip + one held product shot) or shorter durations or lower resolution — in that order — and re-measure. Do NOT touch the price.
- [ ] Check credit balance vs. expected demand (assume 30–60 videos during the campaign at ~3 clips each). Budget the top-up; size the child-key cap to match.
- [ ] Lock the three style presets with concrete Venice model + prompt settings: `clean-tech`, `ugc`, `cinematic`. One test clip each.
- [ ] Confirm ffmpeg runs in the Railway container (add to the image; test a 3-clip concat with subtitle burn locally first).

## D. Infrastructure
- [ ] Railway project created. Confirm outbound network access to api.venice.ai and OKX endpoints from Railway (allowlist lesson from SKINS).
- [ ] Decide storage: Railway volume + static route vs Cloudflare R2. Default: Railway volume for v1; only reach for R2 if volume serving is flaky.
- [ ] Domain: point a subdomain (e.g. demorun.moren.xyz) at the Railway service. The listing needs a stable base URL.

## E. Repo + identity hygiene
- [ ] `git config user.name` / `user.email` set BEFORE first commit.
- [ ] Repo `demorun` created on GitHub (neromtoobad). MIT license. .gitignore includes .env and /data.
- [ ] No AI co-author attribution in any commit. Ever.

## F. Campaign prep (cheap now, expensive later)
- [ ] Create the dedicated X account (@demorunai or similar — check availability). Profile art from the NEROMTOOBAD design language, bio written, follows @XLayerOfficial and OKX accounts.
- [ ] Draft the launch thread skeleton and the "I'll make your hackathon demo video" pitch post. Final versions come in Phase 5, but the hooks get drafted now while the positioning is fresh.
- [ ] List 20 target customers: hackathon entrants visible in the OKX.AI Discord/X posting #OKXAI without a video yet. This list is the day-one sales pipeline.

## Exit criteria
Phase 0 is done when: ASP registration is in progress with the review requirements known, the Venice child key works with one manual 15–30s video produced and a hard COGS number recorded, Railway serves a hello-world at the final domain, and the repo exists with correct git identity.
