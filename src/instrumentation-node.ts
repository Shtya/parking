/**
 * Self-hosted (`next start` / Docker / VPS): starts the in-process daily reminder scheduler.
 * Vercel (serverless): skipped — Vercel Cron calls GET /api/cron/reminders instead (see vercel.json).
 */
import { startScheduler } from './server/modules/notifications/scheduler';

if (!process.env.VERCEL && process.env.SCHEDULER_ENABLED !== 'false' && process.env.NEXT_PHASE !== 'phase-production-build') {
  startScheduler().catch((err) => console.error('scheduler failed to start', err));
}
