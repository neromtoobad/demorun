// Central config, read from the environment once at startup.

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
  databasePath: process.env.DATABASE_PATH ?? './data/demorun.db',

  paymentsEnforced: process.env.PAYMENTS_ENFORCED === 'true',
  priceUsdt: Number(process.env.PRICE_USDT ?? 1),
  payoutAddress: process.env.PAYOUT_ADDRESS ?? '',
};
