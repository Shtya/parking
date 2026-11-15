/**
 * Resolves the database used by tests. Tests TRUNCATE every table, so a remote/shared database
 * is refused unless ALLOW_REMOTE_TEST_DB=true is set explicitly.
 */
export const LOCAL_TEST_DB = 'postgresql://postgres@127.0.0.1:5434/parking_test?schema=public';

export function resolveTestDbUrl() {
  try { process.loadEnvFile('.env'); } catch { /* optional */ }
  const candidate = process.env.TEST_DATABASE_URL;
  if (!candidate) return LOCAL_TEST_DB;
  const host = new URL(candidate).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
  const sameAsMain = candidate === process.env.DATABASE_URL;
  if ((isLocal && !sameAsMain) || process.env.ALLOW_REMOTE_TEST_DB === 'true') return candidate;
  console.warn(`⚠ TEST_DATABASE_URL points to ${isLocal ? 'the main database' : `remote host ${host}`} — using local ${LOCAL_TEST_DB} instead (tests wipe data).`);
  return LOCAL_TEST_DB;
}
