import { env } from '../../lib/env';
import { logger } from '../../lib/logger';
import { runReminders } from './reminders.service';

let running = false;

export async function runRemindersSafely(trigger: string) {
  if (running) {
    logger.warn('reminder run already in progress — skipped');
    return null;
  }
  running = true;
  try {
    logger.info({ trigger }, 'reminder run started');
    return await runReminders();
  } catch (err) {
    logger.error({ err }, 'reminder run failed');
    return null;
  } finally {
    running = false;
  }
}

/**
 * In-process scheduler for self-hosted deployments (`next start`, Docker, VPS).
 * On Vercel the same job is triggered by Vercel Cron → GET /api/cron/reminders (see vercel.json).
 */
export async function startScheduler() {
  if (!env.SCHEDULER_ENABLED) {
    logger.info('scheduler disabled (SCHEDULER_ENABLED=false)');
    return null;
  }
  const cron = (await import('node-cron')).default;
  if (!cron.validate(env.REMINDER_CRON)) throw new Error(`Invalid REMINDER_CRON: ${env.REMINDER_CRON}`);
  const task = cron.schedule(env.REMINDER_CRON, () => void runRemindersSafely('cron'), { timezone: env.TZ_NAME });
  logger.info({ cron: env.REMINDER_CRON, tz: env.TZ_NAME }, 'reminder scheduler started');
  setTimeout(() => void runRemindersSafely('startup'), 15_000).unref?.();
  return task;
}
