import { z } from './zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().optional(),
  TZ_NAME: z.string().default('Asia/Riyadh'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` */
  CRON_SECRET: z.string().optional(),
  REMINDER_CRON: z.string().default('0 8 * * *'),
  SCHEDULER_ENABLED: bool.default(true),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Parking Management <no-reply@parking.local>'),
  EMAIL_ENABLED: bool.default(false),
  WHATSAPP_ENABLED: bool.default(false),
  SMS_ENABLED: bool.default(false),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed lazily (first access) so `next build` never needs runtime secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see .env.example');
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, { get: (_t, key) => getEnv()[key as keyof Env] });

export const isProd = () => process.env.NODE_ENV === 'production';
export const isTest = () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
