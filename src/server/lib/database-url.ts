/**
 * Supabase session pooler (port 5432) allows only `pool_size` clients (often 15).
 * The app must use transaction mode (port 6543). Migrations need a direct session, not that pool.
 */

function query(raw: string): { base: string; params: URLSearchParams } {
  const i = raw.indexOf('?');
  return { base: i === -1 ? raw : raw.slice(0, i), params: new URLSearchParams(i === -1 ? '' : raw.slice(i + 1)) };
}

/** Runtime URL for Prisma Client. Session-mode pooler is rewritten to transaction mode. */
export function runtimeDatabaseUrl(raw: string): string {
  if (!raw.includes('pooler.supabase.com')) return raw;
  const { base, params } = query(raw.replace(/(pooler\.supabase\.com):5432\b/, '$1:6543'));
  if (!params.has('pgbouncer')) params.set('pgbouncer', 'true');
  if (!params.has('connection_limit')) params.set('connection_limit', '1');
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Migrate URL. Prefers DIRECT_URL. Pooler URLs become the project's direct host so they skip the 15-session cap. */
export function migrateDatabaseUrl(raw: string, direct = process.env.DIRECT_URL): string {
  if (direct) return direct;
  if (!raw.includes('pooler.supabase.com')) return raw;
  const match = raw.match(/^postgresql:\/\/postgres\.([a-z0-9]+):([^@]+)@[^/]+\/([^?]+)/i);
  if (!match) return raw;
  const [, ref, password, db] = match;
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '?sslmode=require';
  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/${db}${q}`;
}
