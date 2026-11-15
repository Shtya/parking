/**
 * Idempotent seed:
 *   1. floors + spots from the DWG extraction (prisma/data/floors/*.json)
 *   2. users (ADMIN / OWNER / STAFF) from SEED_* env vars
 *   3. reminder rules 60 / 30 / 7 days + default settings
 *   4. real data: imports docs/client-assets/PARKING STATEMENT (last updated).xlsx (only when no contracts exist)
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role, FloorKind, Channel, Prisma } from '@prisma/client';
import { typeForFloor, createPreview, commitImport } from '../src/server/modules/import/import.service';
import { DEFAULT_SETTINGS } from '../src/server/lib/settings';

const prisma = new PrismaClient();
const DATA = path.join(__dirname, 'data/floors');
const STATEMENT = path.resolve(__dirname, '../docs/client-assets/PARKING STATEMENT (last updated).xlsx');

const FLOORS = [
  { code: 'B2', nameAr: 'البدروم الثاني', nameEn: 'Basement 2', level: -2, kind: FloorKind.INDOOR },
  { code: 'B1', nameAr: 'البدروم الأول', nameEn: 'Basement 1', level: -1, kind: FloorKind.INDOOR },
  { code: 'GF', nameAr: 'الدور الأرضي', nameEn: 'Ground Floor', level: 0, kind: FloorKind.INDOOR },
  { code: 'MF', nameAr: 'الميزانين', nameEn: 'Mezzanine', level: 1, kind: FloorKind.INDOOR },
  { code: '1F', nameAr: 'الدور الأول (VIP)', nameEn: 'First Floor (VIP)', level: 2, kind: FloorKind.INDOOR },
  { code: '2F', nameAr: 'الدور الثاني', nameEn: 'Second Floor', level: 3, kind: FloorKind.INDOOR },
  { code: 'YARD', nameAr: 'الساحة الخارجية', nameEn: 'Outdoor Yard', level: 10, kind: FloorKind.OUTDOOR },
  { code: 'SHADED', nameAr: 'الساحة المظللة', nameEn: 'Shaded Yard', level: 11, kind: FloorKind.OUTDOOR },
];

async function seedFloors() {
  for (const f of FLOORS) {
    const file = path.join(DATA, `${f.code}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const floor = await prisma.floor.upsert({
      where: { code: f.code },
      create: { ...f, svgPath: data ? `/floors/${f.code}.svg` : null, viewBox: data?.viewBox ?? Prisma.JsonNull, sourceFile: data?.sourceFile ?? null },
      update: { nameAr: f.nameAr, nameEn: f.nameEn, level: f.level, kind: f.kind, svgPath: data ? `/floors/${f.code}.svg` : null, viewBox: data?.viewBox ?? Prisma.JsonNull, sourceFile: data?.sourceFile ?? null },
    });
    if (!data) continue;
    const existing = new Map((await prisma.spot.findMany({ where: { floorId: floor.id }, select: { id: true, label: true, geometrySource: true } })).map((s) => [s.label, s]));
    const create: Prisma.SpotCreateManyInput[] = [];
    for (const s of data.spots as { label: string; number: number; source: string; points: [number, number][]; cx: number; cy: number }[]) {
      const geometry = { points: s.points, cx: s.cx, cy: s.cy };
      const ex = existing.get(s.label);
      if (!ex) create.push({ floorId: floor.id, label: s.label, number: s.number, type: typeForFloor(f.code), geometry, geometrySource: s.source });
      else if (ex.geometrySource !== 'manual') await prisma.spot.update({ where: { id: ex.id }, data: { geometry, geometrySource: s.source } }); // never overwrite manual edits
    }
    if (create.length) await prisma.spot.createMany({ data: create });
    console.log(`  floor ${f.code.padEnd(6)} ${data.spots.length} spots from drawing (${create.length} new)`);
  }
}

async function seedUsers() {
  const users = [
    { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, name: 'System Admin', role: Role.ADMIN },
    { email: process.env.SEED_OWNER_EMAIL, password: process.env.SEED_OWNER_PASSWORD, name: 'Building Owner', role: Role.OWNER },
    { email: process.env.SEED_STAFF_EMAIL, password: process.env.SEED_STAFF_PASSWORD, name: 'Parking Staff', role: Role.STAFF },
  ];
  for (const u of users) {
    if (!u.email || !u.password) continue;
    const exists = await prisma.user.findUnique({ where: { email: u.email.toLowerCase() } });
    if (exists) continue;
    await prisma.user.create({ data: { email: u.email.toLowerCase(), name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) } });
    console.log(`  user ${u.role.padEnd(5)} ${u.email}`);
  }
}

async function seedRules() {
  for (const daysBefore of [60, 30, 7]) {
    await prisma.reminderRule.upsert({ where: { daysBefore }, create: { daysBefore, channels: [Channel.IN_APP, Channel.EMAIL] }, update: {} });
  }
  await prisma.appSetting.upsert({ where: { key: 'general' }, create: { key: 'general', value: DEFAULT_SETTINGS }, update: {} });
}

async function seedImport() {
  if (await prisma.contract.count()) return console.log('  import skipped (contracts already exist)');
  if (!fs.existsSync(STATEMENT)) return console.log('  import skipped (statement file not found)');
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  const preview = await createPreview(fs.readFileSync(STATEMENT), path.basename(STATEMENT), admin?.id);
  const res = await commitImport(preview.id, {}, admin?.id);
  console.log(`  imported statement: ${res.tenantsCreated} tenants, ${res.contracts} contracts, ${res.spotsCreated} extra spots, ${res.units} units — ${preview.issues.length} issues (see Import page)`);
}

(async () => {
  console.log('🌱 seeding…');
  await seedFloors();
  await seedUsers();
  await seedRules();
  await seedImport();
  console.log('✅ done');
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
