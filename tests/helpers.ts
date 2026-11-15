import bcrypt from 'bcryptjs';
import request from './http';
import { Role, Channel, SpotType } from '@prisma/client';
import { prisma } from '../src/server/lib/prisma';
import { handleApi } from '../src/server/handler';

/** kept for supertest-style call sites: request(app) */
export const app = handleApi;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export const PASSWORD = 'Passw0rd!test';

export async function seedBasics() {
  const hash = await bcrypt.hash(PASSWORD, 4);
  await prisma.user.createMany({
    data: [
      { email: 'admin@test.local', name: 'Admin', role: Role.ADMIN, passwordHash: hash },
      { email: 'owner@test.local', name: 'Owner', role: Role.OWNER, passwordHash: hash },
      { email: 'staff@test.local', name: 'Staff', role: Role.STAFF, passwordHash: hash },
    ],
  });
  const floor = await prisma.floor.create({ data: { code: 'B1', nameAr: 'البدروم الأول', nameEn: 'Basement 1', level: -1, officialCapacity: 6 } });
  await prisma.floor.create({ data: { code: 'YARD', nameAr: 'الساحة', nameEn: 'Yard', level: 10, kind: 'OUTDOOR', officialCapacity: 100 } });
  await prisma.spot.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({ floorId: floor.id, label: String(i + 1), number: i + 1, type: SpotType.STANDARD, geometry: { points: [[0, 0], [1, 0], [1, 1]], cx: 0.5, cy: 0.5 } })),
  });
  await prisma.reminderRule.createMany({ data: [60, 30, 7].map((d) => ({ daysBefore: d, channels: [Channel.IN_APP, Channel.EMAIL] })) });
  const tenant = await prisma.tenant.create({ data: { nameAr: 'شركة الاختبار', nameEn: 'Test Co', code: 'TEST', email: 'tenant@test.local' } });
  const spots = await prisma.spot.findMany({ where: { floorId: floor.id }, orderBy: { number: 'asc' } });
  return { floor, tenant, spots };
}

export async function login(email = 'admin@test.local') {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: res.body.accessToken as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
