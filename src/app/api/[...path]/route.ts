import { handleApi } from '@/server/handler';

// The whole REST API (auth, floors, spots, tenants, contracts, imports, reports, notifications, cron, docs)
// is served from this single Node.js route handler — deployable as-is on Vercel.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = handleApi;
export const POST = handleApi;
export const PUT = handleApi;
export const PATCH = handleApi;
export const DELETE = handleApi;
