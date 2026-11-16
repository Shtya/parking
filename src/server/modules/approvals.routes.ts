import { ApprovalStatus, Prisma, Role } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams, Pagination, paginate, getReplayHandler } from '../lib/route';
import { AppError, badRequest, conflict, forbidden, notFound, toErrorPayload } from '../lib/errors';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';
import { ApiResponse, type ApiRequest } from '../lib/http';
import type { AuthUser } from '../middleware/auth';

export const approvalsRouter = createRouter();
const BASE = '/api/approvals';

const person = { select: { id: true, name: true, email: true, role: true } } as const;
const include = { requester: person, approver: person } as const;

const ListQuery = Pagination.extend({
  box: z.enum(['inbox', 'mine', 'all']).default('inbox'),
  status: z.nativeEnum(ApprovalStatus).optional(),
});

route(
  approvalsRouter, BASE,
  { method: 'get', path: '/', tag: 'Approvals', summary: 'Approval requests: inbox (waiting for me), mine (I asked), all (admin)', query: ListQuery },
  async ({ query, user }) => {
    if (query.box === 'all' && user.role !== Role.ADMIN) throw forbidden();
    const where: Prisma.ApprovalRequestWhereInput = {
      ...(query.box === 'inbox' ? { approverId: user.id } : query.box === 'mine' ? { requesterId: user.id } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.approvalRequest.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], ...paginate(query.page, query.pageSize) }),
      prisma.approvalRequest.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);

route(approvalsRouter, BASE, { method: 'get', path: '/count', tag: 'Approvals', summary: 'Pending requests waiting for me (sidebar badge)' }, async ({ user }) => ({
  pending: await prisma.approvalRequest.count({ where: { approverId: user.id, status: ApprovalStatus.PENDING } }),
  mine: await prisma.approvalRequest.count({ where: { requesterId: user.id, status: ApprovalStatus.PENDING } }),
}));

/** Loads a pending request the current user may decide (its approver, or any admin). */
async function decidable(id: string, user: AuthUser) {
  const r = await prisma.approvalRequest.findUnique({ where: { id }, include });
  if (!r) throw notFound('Approval request');
  if (r.approverId !== user.id && user.role !== Role.ADMIN) throw forbidden('This request is assigned to another approver');
  if (r.requesterId === user.id) throw forbidden('You cannot approve your own request');
  if (r.status !== ApprovalStatus.PENDING) throw conflict('This request was already decided', { status: r.status }, 'ALREADY_DECIDED');
  return r;
}

async function notifyRequester(r: { requesterId: string; summary: Prisma.JsonValue }, approved: boolean, by: AuthUser, note?: string | null, failed?: string) {
  const s = r.summary as { ar: string; en: string };
  const requester = await prisma.user.findUnique({ where: { id: r.requesterId }, select: { locale: true } });
  const ar = requester?.locale !== 'en';
  const title = failed
    ? ar ? `تمت الموافقة لكن التنفيذ فشل: ${s.ar}` : `Approved but could not be applied: ${s.en}`
    : approved
      ? ar ? `تمت الموافقة على: ${s.ar}` : `Approved: ${s.en}`
      : ar ? `تم رفض: ${s.ar}` : `Rejected: ${s.en}`;
  const body = [ar ? `بواسطة ${by.name}` : `by ${by.name}`, note, failed].filter(Boolean).join(' — ');
  await prisma.notification.create({ data: { userId: r.requesterId, type: 'APPROVAL_DECISION', title, body, link: '/approvals?box=mine' } });
}

route(
  approvalsRouter, BASE,
  { method: 'post', path: '/:id/approve', tag: 'Approvals', summary: 'Approve and apply the held action', params: IdParams, body: z.object({ note: z.string().max(500).optional() }), status: 200 },
  async ({ params, body, user }) => {
    const r = await decidable(params.id, user);
    // claim it first so a double click cannot apply the action twice
    const claimed = await prisma.approvalRequest.updateMany({ where: { id: r.id, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.APPROVED, decidedAt: new Date(), decisionNote: body.note ?? null } });
    if (!claimed.count) throw conflict('This request was already decided', undefined, 'ALREADY_DECIDED');

    const handler = getReplayHandler(r.method, r.routePath);
    const requester = r.requester;
    try {
      if (!handler) throw new AppError(500, 'UNKNOWN_ACTION', 'This action is no longer supported');
      const url = new URL(`http://approval.local${r.routePath}`);
      const req: ApiRequest = {
        method: r.method.toUpperCase(), path: url.pathname, url, headers: new Headers(), cookies: {},
        params: r.params as Record<string, string>, query: r.query as Record<string, string>, body: r.body,
        user: { id: requester.id, email: requester.email, name: requester.name, role: requester.role },
        ip: 'approval', approved: true,
      };
      const out = await handler(req, new ApiResponse());
      const result = (out.data ?? null) as Prisma.InputJsonValue;
      const saved = await prisma.approvalRequest.update({ where: { id: r.id }, data: { result: result ?? Prisma.DbNull }, include });
      await audit(user.id, 'APPROVE', 'ApprovalRequest', r.id, { permission: r.permission, requesterId: r.requesterId });
      await notifyRequester(r, true, user, body.note);
      return saved;
    } catch (err) {
      const { body: { error: e } } = toErrorPayload(err);
      logger.warn({ err, approvalId: r.id }, 'approved action failed');
      await prisma.approvalRequest.update({ where: { id: r.id }, data: { status: ApprovalStatus.FAILED, error: e.message } });
      await audit(user.id, 'APPROVE_FAILED', 'ApprovalRequest', r.id, { permission: r.permission, error: e.message });
      await notifyRequester(r, true, user, body.note, e.message);
      throw conflict(`Approved, but the action could not be applied: ${e.message}`, e.details, 'APPROVAL_APPLY_FAILED');
    }
  },
);

route(
  approvalsRouter, BASE,
  { method: 'post', path: '/:id/reject', tag: 'Approvals', summary: 'Reject the held action', params: IdParams, body: z.object({ note: z.string().max(500).optional() }), status: 200 },
  async ({ params, body, user }) => {
    const r = await decidable(params.id, user);
    const saved = await prisma.approvalRequest.update({ where: { id: r.id }, data: { status: ApprovalStatus.REJECTED, decidedAt: new Date(), decisionNote: body.note ?? null }, include });
    await audit(user.id, 'REJECT', 'ApprovalRequest', r.id, { permission: r.permission, note: body.note });
    await notifyRequester(r, false, user, body.note);
    return saved;
  },
);

route(approvalsRouter, BASE, { method: 'post', path: '/:id/cancel', tag: 'Approvals', summary: 'Withdraw my pending request', params: IdParams, status: 200 }, async ({ params, user }) => {
  const r = await prisma.approvalRequest.findUnique({ where: { id: params.id } });
  if (!r) throw notFound('Approval request');
  if (r.requesterId !== user.id) throw forbidden();
  if (r.status !== ApprovalStatus.PENDING) throw badRequest('Only pending requests can be withdrawn');
  const saved = await prisma.approvalRequest.update({ where: { id: r.id }, data: { status: ApprovalStatus.CANCELLED, decidedAt: new Date() }, include });
  await audit(user.id, 'CANCEL', 'ApprovalRequest', r.id);
  return saved;
});
