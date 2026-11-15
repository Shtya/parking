// Applies migrations through the direct database host. The Vercel build must not do this:
// Supabase session mode rejects the connection once 15 clients are open (EMAXCONNSESSION).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { migrateDatabaseUrl } from '../src/server/lib/database-url.ts';

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!fs.existsSync('.env')) return '';
  const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) return '';
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}

const raw = readDatabaseUrl();
if (!raw) {
  console.error('DATABASE_URL is missing');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: migrateDatabaseUrl(raw, process.env.DIRECT_URL) };
const npm = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npm, ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
