import { z } from 'zod';

// Only VITE_-prefixed variables exist in the browser. Validate once at startup so a
// misconfigured deploy fails loudly instead of producing half-working screens.
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_DEFAULT_LOCALE: z.enum(['sw', 'en']).default('sw'),
  VITE_TIMEZONE: z.string().default('Africa/Dar_es_Salaam'),
});

export type AppEnv = z.infer<typeof envSchema>;

function readEnv(): AppEnv {
  const parsed = envSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}. See .env.example.`);
  }
  return parsed.data;
}

export const env: AppEnv = readEnv();

/** True outside production. Mock adapters and the Sandbox badge are only allowed when this is true. */
export const isSandbox = env.VITE_APP_ENV !== 'production';
