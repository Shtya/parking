import { Role, ImportStatus } from '@prisma/client';
import { z } from '../../lib/zod';
import { prisma } from '../../lib/prisma';
import { createRouter, route, IdParams } from '../../lib/route';
import { badRequest, notFound } from '../../lib/errors';
import { createPreview, commitImport } from './import.service';

export const importRouter = createRouter();
const BASE = '/api/imports';
const ROLES = [Role.ADMIN, Role.OWNER, Role.STAFF];

route(
  importRouter, BASE,
  {
    method: 'post', path: '/preview', tag: 'Import', summary: 'Upload PARKING STATEMENT .xlsx → preview with errors/warnings (nothing saved yet)',
    auth: ROLES, upload: 'file', status: 200,
  },
  async ({ req, user }) => {
    const file = req.file!;
    if (!/\.xlsx$/i.test(file.originalname)) throw badRequest('Only .xlsx files are supported');
    return createPreview(file.buffer, file.originalname, user.id);
  },
);

route(
  importRouter, BASE,
  {
    method: 'post', path: '/:id/commit', tag: 'Import', summary: 'Commit a previewed import', auth: ROLES, permission: 'imports.commit', params: IdParams, status: 200,
    body: z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), replaceExisting: z.boolean().default(false) }),
  },
  async ({ params, body, user }) => {
    if (body.replaceExisting && user.role === Role.STAFF) throw badRequest('Only ADMIN/OWNER can replace existing contracts');
    return commitImport(params.id, body, user.id);
  },
);

route(importRouter, BASE, { method: 'post', path: '/:id/discard', tag: 'Import', summary: 'Discard a preview', auth: ROLES, params: IdParams, status: 200 }, async ({ params }) => {
  const b = await prisma.importBatch.update({ where: { id: params.id, status: ImportStatus.PREVIEW }, data: { status: ImportStatus.DISCARDED } });
  return { id: b.id, status: b.status };
});

route(importRouter, BASE, { method: 'get', path: '/', tag: 'Import', summary: 'Import history', auth: ROLES }, async () =>
  prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, fileName: true, status: true, summary: true, createdAt: true, committedAt: true, createdBy: { select: { name: true } } },
  }),
);

route(importRouter, BASE, { method: 'get', path: '/:id', tag: 'Import', summary: 'Import batch details (issues report)', auth: ROLES, params: IdParams }, async ({ params }) => {
  const b = await prisma.importBatch.findUnique({ where: { id: params.id } });
  if (!b) throw notFound('Import batch');
  const payload = b.payload as { tenants?: unknown[] };
  return { ...b, payload: undefined, tenants: payload.tenants ?? [] };
});
