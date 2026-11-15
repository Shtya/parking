import { resolveTestDbUrl } from './test-db';

process.env.DATABASE_URL = resolveTestDbUrl();
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.EMAIL_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret-123';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret-12';
