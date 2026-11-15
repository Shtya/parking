import { isTest } from './env';
import { tooMany } from './errors';

const hits = new Map<string, { count: number; reset: number }>();

/**
 * Best-effort in-memory limiter (per server instance). On serverless it limits per warm instance —
 * enough to slow brute force; put Vercel Firewall / Upstash in front for strict global limits.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  if (isTest()) return;
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return;
  }
  cur.count++;
  if (cur.count > limit) throw tooMany();
}
