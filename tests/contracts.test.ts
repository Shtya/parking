import { describe, it, expect, beforeAll } from 'vitest';
import request from './http';
import { app, resetDb, seedBasics, login, isoIn } from './helpers';

let ctx: Awaited<ReturnType<typeof seedBasics>>;
let auth: Record<string, string>;
let staff: Record<string, string>;

describe('contracts', () => {
  beforeAll(async () => {
    await resetDb();
    ctx = await seedBasics();
    auth = (await login()).auth;
    staff = (await login('staff@test.local')).auth;
  });

  it('enforces the 2-spot minimum per office', async () => {
    const res = await request(app).post('/api/contracts').set(staff).send({ tenantId: ctx.tenant.id, startDate: isoIn(0), spots: [{ spotId: ctx.spots[0].id }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BELOW_MINIMUM');
  });

  it('only ADMIN/OWNER may approve below-minimum exceptions', async () => {
    const body = { tenantId: ctx.tenant.id, startDate: isoIn(400), spots: [{ spotId: ctx.spots[5].id }], allowBelowMinimum: true, status: 'DRAFT' };
    expect((await request(app).post('/api/contracts').set(staff).send(body)).status).toBe(403);
  });

  let contractId = '';
  it('creates an annual contract with default end date and pricing', async () => {
    const res = await request(app).post('/api/contracts').set(staff).send({
      tenantId: ctx.tenant.id,
      startDate: isoIn(-300),
      spots: [{ spotId: ctx.spots[0].id }, { spotId: ctx.spots[1].id, kind: 'INCLUDED' }],
      allocations: [{ floorCode: 'YARD', quantity: 2 }],
    });
    expect(res.status).toBe(201);
    contractId = res.body.id;
    expect(res.body.number).toMatch(/^PK-\d{4}-0001$/);
    expect(res.body.spots).toHaveLength(2);
    // 1 PAID standard (6000) + 1 INCLUDED (0) + 2 yard (3000 each)
    expect(Number(res.body.annualAmount)).toBe(12000);
    const start = new Date(res.body.startDate);
    const end = new Date(res.body.endDate);
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBeGreaterThanOrEqual(364);
  });

  it('refuses to rent the same spot twice in overlapping periods', async () => {
    const other = await request(app).post('/api/tenants').set(auth).send({ nameAr: 'مستأجر آخر' });
    const res = await request(app)
      .post('/api/contracts')
      .set(auth)
      .send({ tenantId: other.body.id, startDate: isoIn(0), spots: [{ spotId: ctx.spots[0].id }, { spotId: ctx.spots[2].id }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SPOT_UNAVAILABLE');
  });

  it('shows rented / expiring status on the floor map', async () => {
    const res = await request(app).get('/api/floors/B1').set(auth);
    expect(res.status).toBe(200);
    const s1 = res.body.spots.find((s: { label: string }) => s.label === '1');
    expect(['RENTED', 'EXPIRING']).toContain(s1.status);
    expect(s1.tenant.code).toBe('TEST');
    expect(res.body.spots.find((s: { label: string }) => s.label === '3').status).toBe('AVAILABLE');
  });

  it('renews a contract for the next year and keeps history', async () => {
    const res = await request(app).post(`/api/contracts/${contractId}/renew`).set(auth).send({ priceIncreasePercent: 10 });
    expect(res.status).toBe(201);
    expect(res.body.renewedFrom.id).toBe(contractId);
    expect(Number(res.body.annualAmount)).toBe(13200);
    const old = await request(app).get(`/api/contracts/${contractId}`).set(auth);
    expect(old.body.status).toBe('RENEWED');
    const spot = await request(app).get(`/api/spots/${ctx.spots[0].id}`).set(auth);
    expect(spot.body.history).toHaveLength(2);
    const again = await request(app).post(`/api/contracts/${contractId}/renew`).set(auth).send({});
    expect(again.status).toBe(409);
  });

  it('terminates a contract and frees its spots', async () => {
    const list = await request(app).get('/api/contracts?status=ACTIVE').set(auth);
    const active = list.body.items[0];
    expect((await request(app).post(`/api/contracts/${active.id}/terminate`).set(staff).send({ reason: 'xx' })).status).toBe(403);
    const res = await request(app).post(`/api/contracts/${active.id}/terminate`).set(auth).send({ reason: 'Tenant moved out' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('TERMINATED');
    const floor = await request(app).get('/api/floors/B1').set(auth);
    expect(floor.body.spots.find((s: { label: string }) => s.label === '1').status).toBe('AVAILABLE');
  });

  it('returns dashboard KPIs and Excel reports', async () => {
    const d = await request(app).get('/api/dashboard').set(auth);
    expect(d.status).toBe(200);
    expect(d.body.byFloor.map((f: { code: string }) => f.code)).toEqual(['B1', 'YARD']);
    const x = await request(app).get('/api/reports/contracts.xlsx?lang=en').set(auth);
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
  });
});
