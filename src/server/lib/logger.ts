import pino from 'pino';

const test = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Plain JSON logs (works on Vercel / any host; no worker-thread transports inside the bundle).
export const logger = pino({
  level: test ? 'silent' : process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  redact: { paths: ['password', '*.password', '*.passwordHash', 'headers.authorization', 'headers.cookie'], censor: '[redacted]' },
});
