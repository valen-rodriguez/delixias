export interface AppConfiguration {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  supabaseUrl: string;
  supabaseJwksUrl: string;
  trackingSkewToleranceSec: number;
  trackingDedupWindowSec: number;
  inactivityJobIntervalMs: number;
  anonymizeIntervalMs: number;
  anonymizeHours: number;
  inactivityTimeoutHours: number;
}

export default () =>
  ({
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseJwksUrl:
      process.env.SUPABASE_JWKS_URL ??
      `${process.env.SUPABASE_URL ?? ''}/auth/v1/.well-known/jwks.json`,
    trackingSkewToleranceSec: parseInt(process.env.APP_TRACKING_SKEW_TOLERANCE_SEC ?? '60', 10),
    trackingDedupWindowSec: parseInt(process.env.APP_TRACKING_DEDUP_WINDOW_SEC ?? '120', 10),
    inactivityJobIntervalMs: parseInt(process.env.APP_INACTIVITY_JOB_INTERVAL_MS ?? '300000', 10),
    anonymizeIntervalMs: parseInt(process.env.APP_ANONYMIZE_INTERVAL_MS ?? '3600000', 10),
    anonymizeHours: parseInt(process.env.APP_ANONYMIZE_HOURS ?? '72', 10),
    inactivityTimeoutHours: parseInt(process.env.APP_INACTIVITY_TIMEOUT_HOURS ?? '3', 10),
  }) satisfies AppConfiguration;
