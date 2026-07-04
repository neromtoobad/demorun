# DEPLOY.md — Railway setup for DEMORUN

The repo ships a `Dockerfile` and `railway.json`. Railway auto-detects both:
it builds from the Dockerfile and reads the health check / restart policy from
`railway.json`. Follow these steps in the Railway dashboard.

Prereqs: the repo is pushed to GitHub (`neromtoobad/demorun`), and you have a
Railway account.

## 1. Create the project + service
1. Railway dashboard → **New Project** → **Deploy from GitHub repo**.
2. Select `neromtoobad/demorun`. Railway detects the `Dockerfile` and starts a
   build. Let this first build run; you'll configure the volume and env next.

## 2. Attach a persistent volume (SQLite lives here)
3. Open the service → **Settings** → **Volumes** → **New Volume**.
4. Set the **Mount path** to `/data`. Name it anything (e.g. `demorun-data`).
   - This is the single most important step: without it, every redeploy wipes
     the job database and any in-flight paid jobs.

## 3. Set environment variables
5. Service → **Variables** → add these (do NOT set `PORT`; Railway injects it):

   ```
   DATABASE_PATH=/data/demorun.db
   PUBLIC_BASE_URL=https://<your-subdomain>      # fill after step 5, then redeploy
   PAYMENTS_ENFORCED=false
   PRICE_USDT=1
   PAYOUT_ADDRESS=<your X Layer address>          # can wait until Phase 3
   ```

   Leave the Venice + OKX keys unset for now — the Phase 1 mock pipeline doesn't
   touch them. They get added in Phase 2/3.

## 4. Attach the domain / subdomain
6. Service → **Settings** → **Networking** → **Public Networking**.
   - Quick option: **Generate Domain** to get a `*.up.railway.app` URL.
   - Custom subdomain (e.g. `demorun.moren.xyz`): **Custom Domain** → enter it →
     Railway shows a `CNAME` target. Add that CNAME at your DNS provider and wait
     for it to verify.
7. Copy the final public URL into the `PUBLIC_BASE_URL` variable (step 5) and
   redeploy so `result_url` values are built with the real base URL.

## 5. Confirm the deploy
8. **Deployments** tab → watch the build. Railway will only mark the deploy
   healthy once `GET /v1/health` returns 200 (configured in `railway.json`).

## 6. Verify against the live domain  [Phase 1 gate]
Run the smoke test from your machine against the live URL:

```
bash scripts/smoke.sh https://<your-domain>
```

Expected: health ok → job submitted → polls `processing` → `completed` with a
`result_url` on your domain. Paste that output back to verify the gate.

---

## Notes
- **Container verified locally**: the image builds, runs, serves, completes a
  job, and persists the DB across a container restart on a mounted volume. The
  only thing not yet exercised is Railway's platform wiring (volume + domain),
  which is what steps 2–6 cover.
- **ffmpeg is already in the image** (v5.1.9) — no extra work needed when the
  Phase 2 assembly stage lands.
- `PAYMENTS_ENFORCED=false` for now. Flipping it to `true` before Phase 3's real
  x402 verification exists would 402 every caller with a placeholder body — keep
  it false until the payment gate is real.
