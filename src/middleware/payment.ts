// x402 payment gate — STUB for Phase 1.
//
// When PAYMENTS_ENFORCED=false (Phase 1/2), every request passes through so the
// pipeline is testable without on-chain settlement. When true, an unpaid POST
// gets HTTP 402 with a placeholder payment-requirements body shaped like the
// real x402 'exact' scheme response. Phase 3 replaces the placeholder with real
// OKX Payment SDK verification and records the settled tx hash on the job.

import type { Context, Next } from 'hono';
import { config } from '../config.js';

// Header a paying client echoes back with proof of settlement. In Phase 3 this
// carries the real x402 payment payload that we verify server-side.
const PAYMENT_HEADER = 'x-payment';

export function paymentRequirements() {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'x-layer',
        asset: 'USDT',
        amount: String(config.priceUsdt),
        payTo: config.payoutAddress,
        resource: '/v1/jobs',
        description: 'DEMORUN — one 15–30s demo video',
        mimeType: 'application/json',
      },
    ],
  };
}

export async function paymentGate(c: Context, next: Next) {
  if (!config.paymentsEnforced) {
    return next();
  }

  const proof = c.req.header(PAYMENT_HEADER);
  if (!proof) {
    return c.json(paymentRequirements(), 402);
  }

  // Phase 3: verify `proof` settles on X Layer, then stash the tx hash for the
  // route to persist on the job. For now, presence is treated as paid.
  c.set('paidTx', proof);
  return next();
}
