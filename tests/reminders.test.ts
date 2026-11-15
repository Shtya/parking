import { describe, it, expect, beforeAll } from 'vitest';
import request from './http';
import { prisma } from '../src/server/lib/prisma';
import { app, resetDb, seedBasics, login, isoIn } from './helpers';

describe('reminders', () => {
  let auth: Record<string, string>;

  beforeAll(async () => {
    await resetDb();
    const ctx = await seedBasics();
    auth = (await login()).auth;
    await prisma.tenantContact.create({ data: { tenantId: ctx.tenant.id, name: 'Contact', email: 'contact@test.local', isPrimary: true } });
    // ends in 5 days → the 7-day rule applies
    const res = await request(app)
      .post('/api/contracts')
      .set(auth)
      .send({ tenantId: ctx.tenant.id, startDate: isoIn(-360), endDate: isoIn(5), spots: [{ spotId: ctx.spots[0].id }, { spotId: ctx.spots[1].id }] });
    expect(res.status).toBe(201);
    // already overdue → the job should expire it
    const overdue = await request(app)
      .post('/api/contracts')
      .set(auth)
      .send({ tenantId: ctx.tenant.id, startDate: isoIn(-400), endDate: isoIn(-2), spots: [{ spotId: ctx.spots[2].id }, { spotId: ctx.spots[3].id }] });
    expect(overdue.status).toBe(201);
  });

  it('sends owner + tenant reminders once, using the tightest rule', async () => {
    const run1 = await request(app).post('/api/notifications/run').set(auth);
    expect(run1.status).toBe(200);
    expect(run1.body.expired).toBe(1);
    const deliveries = await prisma.notificationDelivery.findMany();
    const upcoming = deliveries.filter((d) => d.daysBefore === 7);
    expect(upcoming.some((d) => d.recipientType === 'TENANT' && d.recipient === 'contact@test.local')).toBe(true);
    expect(upcoming.some((d) => d.channel === 'IN_APP')).toBe(true);
    expect(deliveries.filter((d) => d.daysBefore === 60 || d.daysBefore === 30)).toHaveLength(0);

    const before = deliveries.length;
    await request(app).post('/api/notifications/run').set(auth);
    expect(await prisma.notificationDelivery.count()).toBe(before); // idempotent
  });

  it('shows in-app notifications to owners/admins', async () => {
    const res = await request(app).get('/api/notifications').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.unread).toBeGreaterThanOrEqual(2);
    await request(app).post('/api/notifications/read-all').set(auth);
    expect((await request(app).get('/api/notifications').set(auth)).body.unread).toBe(0);
  });

  it('marks overdue contracts as EXPIRED on the spot map', async () => {
    const floor = await request(app).get('/api/floors/B1').set(auth);
    expect(floor.body.spots.find((s: { label: string }) => s.label === '3').status).toBe('EXPIRED');
    expect(floor.body.spots.find((s: { label: string }) => s.label === '1').status).toBe('EXPIRING');
  });
});
