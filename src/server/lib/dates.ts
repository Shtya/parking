import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { env } from './env';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Calendar dates are stored as UTC midnight (Postgres DATE). */
export const toDateOnly = (d: string | Date) => new Date(`${dayjs(d).format('YYYY-MM-DD')}T00:00:00.000Z`);
export const isoDate = (d: Date | string) => dayjs.utc(d).format('YYYY-MM-DD');

/** "Today" in the building's time zone, as a UTC-midnight Date. */
export const today = (now: Date = new Date()) => new Date(`${dayjs(now).tz(env.TZ_NAME).format('YYYY-MM-DD')}T00:00:00.000Z`);

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/** Annual contract: end = start + 1 year − 1 day */
export const annualEnd = (start: Date) => toDateOnly(dayjs.utc(start).add(1, 'year').subtract(1, 'day').toDate());
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
