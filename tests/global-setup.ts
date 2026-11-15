import { execSync } from 'node:child_process';
import { resolveTestDbUrl } from './test-db';

export default function setup() {
  const url = resolveTestDbUrl();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
