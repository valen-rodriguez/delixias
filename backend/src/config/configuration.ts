export interface AppConfiguration {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
  supabaseUrl: string;
  supabaseJwksUrl: string;
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
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseJwksUrl:
      process.env.SUPABASE_JWKS_URL ??
      `${process.env.SUPABASE_URL ?? ''}/auth/v1/.well-known/jwks.json`,
  }) satisfies AppConfiguration;
