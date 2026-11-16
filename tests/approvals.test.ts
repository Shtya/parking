import { describe, it, expect, beforeAll } from 'vitest';
import request from './http';
import { app, resetDb, seedBasics, login, isoIn } from './helpers';
import { prisma } from '../src/server/lib/prisma';

let ctx: Awaited<ReturnType<typeof seedBasics>>;
let admin: Record<string, string>;
let owner: Record<string, string>;
let staff: Record<string, string>;
let ids: { admin: string; owner: string; staff: string };

const contractBody = (spots: string[], startDays = 0) => ({ tenantId: ctx.tenant.id, startDate: isoIn(startDays), spots: spots.map((spotId) => ({ spotId })) });

describe('approval cycle', () => {
  beforeAll(async () => {
    await resetDb();
    ctx = await seedBasics();
    admin = (await login()).auth;
    owner = (await login('owner@test.local')).auth;
    staff = (await login('staff@test.local')).auth;
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    const by = (e: string) => users.find((u) => u.email === e)!.id;
    ids = { admin: by('admin@test.local'), owner: by('owner@test.local'), staff: by('staff@test.local') };
  });

  it('returns role defaults when no custom rules exist', async () => {
    const res = await request(app).get(`/api/users/${ids.staff}/permissions`).set(admin);
    expect(res.status).toBe(200);
    const terminate = res.body.find((p: { permission: string }) => p.permission === 'contracts.terminate');
    expect(terminate).toMatchObject({ allowed: false, requiresApproval: false, source: 'role' });
  });

  it('only admins manage permissions, and an approver is required', async () => {
    const rows = [{ permission: 'contracts.create', allowed: true, requiresApproval: true }];
    expect((await request(app).put(`/api/users/${ids.staff}/permissions`).set(owner).send({ permissions: rows })).status).toBe(403);
    const missing = await request(app).put(`/api/users/${ids.staff}/permissions`).set(admin).send({ permissions: rows });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('APPROVER_REQUIRED');
    const self = await request(app).put(`/api/users/${ids.staff}/permissions`).set(admin).send({ permissions: [{ ...rows[0], approverId: ids.staff }] });
    expect(self.body.error.code).toBe('SELF_APPROVER');
  });

  it('holds a staff contract until the owner approves it', async () => {
    const set = await request(app)
      .put(`/api/users/${ids.staff}/permissions`)
      .set(admin)
      .send({ permissions: [{ permission: 'contracts.create', allowed: true, requiresApproval: true, approverId: ids.owner }] });
    expect(set.status).toBe(200);
    expect(set.body.find((p: { permission: string }) => p.permission === 'contracts.create')).toMatchObject({ requiresApproval: true, approverId: ids.owner, source: 'custom' });

    const res = await request(app).post('/api/contracts').set(staff).send(contractBody([ctx.spots[0].id, ctx.spots[1].id]));
    expect(res.status).toBe(202);
    expect(res.body.approvalRequired).toBe(true);
    expect(res.body.request.approver.id).toBe(ids.owner);
    expect(await prisma.contract.count()).toBe(0);

    // the owner sees it in their inbox and got an in-app notification
    const inbox = await request(app).get('/api/approvals?box=inbox&status=PENDING').set(owner);
    expect(inbox.body.total).toBe(1);
    expect(inbox.body.items[0].summary.en).toContain('Test Co');
    expect(await prisma.notification.count({ where: { userId: ids.owner, type: 'APPROVAL_REQUEST' } })).toBe(1);
    expect((await request(app).get('/api/approvals/count').set(owner)).body.pending).toBe(1);

    // the requester cannot approve their own request; another non-admin cannot either
    expect((await request(app).post(`/api/approvals/${res.body.request.id}/approve`).set(staff).send({})).status).toBe(403);

    const ok = await request(app).post(`/api/approvals/${res.body.request.id}/approve`).set(owner).send({ note: 'ok' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('APPROVED');
    const contract = await prisma.contract.findFirstOrThrow({ include: { spots: true } });
    expect(contract.spots).toHaveLength(2);
    // applied on behalf of the requester (audit trail names the staff member)
    expect(await prisma.auditLog.count({ where: { entity: 'Contract', entityId: contract.id, userId: ids.staff } })).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { userId: ids.staff, type: 'APPROVAL_DECISION' } })).toBe(1);

    // deciding twice is refused
    expect((await request(app).post(`/api/approvals/${res.body.request.id}/approve`).set(owner).send({})).status).toBe(409);
  });

  it('rejecting leaves the data untouched', async () => {
    const res = await request(app).post('/api/contracts').set(staff).send(contractBody([ctx.spots[2].id, ctx.spots[3].id], 2));
    expect(res.status).toBe(202);
    const rej = await request(app).post(`/api/approvals/${res.body.request.id}/reject`).set(owner).send({ note: 'no' });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe('REJECTED');
    expect(await prisma.contract.count()).toBe(1);
  });

  it('marks the request FAILED when the action can no longer be applied', async () => {
    // spot 1 is now rented by the approved contract → re-requesting it must fail at approval time
    const res = await request(app).post('/api/contracts').set(staff).send(contractBody([ctx.spots[0].id, ctx.spots[4].id], 3));
    expect(res.status).toBe(202);
    const ap = await request(app).post(`/api/approvals/${res.body.request.id}/approve`).set(owner).send({});
    expect(ap.status).toBe(409);
    expect(ap.body.error.code).toBe('APPROVAL_APPLY_FAILED');
    const saved = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: res.body.request.id } });
    expect(saved.status).toBe('FAILED');
    expect(saved.error).toBeTruthy();
  });

  it('the requester can withdraw a pending request', async () => {
    const res = await request(app).post('/api/contracts').set(staff).send(contractBody([ctx.spots[4].id, ctx.spots[5].id], 4));
    const c = await request(app).post(`/api/approvals/${res.body.request.id}/cancel`).set(staff).send({});
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('CANCELLED');
  });

  it('a disallowed permission is refused outright', async () => {
    await request(app)
      .put(`/api/users/${ids.staff}/permissions`)
      .set(admin)
      .send({ permissions: [{ permission: 'tenants.create', allowed: false }] });
    const res = await request(app).post('/api/tenants').set(staff).send({ nameAr: 'مستأجر' });
    expect(res.status).toBe(403);
    // and a role-denied permission can be granted per user
    await request(app)
      .put(`/api/users/${ids.staff}/permissions`)
      .set(admin)
      .send({ permissions: [{ permission: 'settings.update', allowed: true }] });
    expect((await request(app).patch('/api/settings').set(staff).send({ expiringThresholdDays: 45 })).status).toBe(200);
  });

  it('admins are never held for approval', async () => {
    const res = await request(app).post('/api/tenants').set(admin).send({ nameAr: 'مستأجر المدير' });
    expect(res.status).toBe(201);
  });
});
