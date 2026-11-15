// Runs a project-local PostgreSQL cluster (./.pgdata on port 5434) using an installed PostgreSQL — no Docker needed.
// Usage: node scripts/local-postgres.mjs init|start|stop|status
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = '5434';
const DATA = path.resolve('.pgdata');
const candidates = [process.env.PG_BIN, 'C:/Program Files/PostgreSQL/17/bin', 'C:/Program Files/PostgreSQL/16/bin', '/usr/lib/postgresql/17/bin', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean);
const bin = candidates.find((d) => fs.existsSync(path.join(d, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')));
if (!bin) { console.error('PostgreSQL binaries not found. Set PG_BIN or use docker compose (npm run db:up).'); process.exit(1); }
const run = (exe, args) => execFileSync(path.join(bin, exe), args, { stdio: 'inherit' });
const cmd = process.argv[2];
if (cmd === 'init') {
  if (!fs.existsSync(DATA)) run('initdb', ['-D', DATA, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C']);
  run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT}`, '-l', path.join(DATA, 'server.log'), '-w', 'start']);
  for (const db of ['parking', 'parking_test']) { try { run('createdb', ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', db]); } catch { /* exists */ } }
} else if (cmd === 'start') run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT}`, '-l', path.join(DATA, 'server.log'), '-w', 'start']);
else if (cmd === 'stop') run('pg_ctl', ['-D', DATA, 'stop']);
else run('pg_ctl', ['-D', DATA, 'status']);
