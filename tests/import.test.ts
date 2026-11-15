import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from './http';
import { parseSpotNumbers, parseStatement } from '../src/server/modules/import/parser';
import { app, resetDb, seedBasics, login } from './helpers';

const STATEMENT = path.resolve(__dirname, '../docs/client-assets/PARKING STATEMENT (last updated).xlsx');

describe('spot number parser', () => {
  it.each([
    ['45 to 61\n246 to 251', 23],
    ['153 to 156 18', 5],
    ['106 to 108 111 to 115\n230 to 231', 10],
    ['47,48,77,80, 158,159', 6],
    ['63,64,91,|93,111,|112', 6],
    ['*', 0],
  ])('parses %j', (raw, count) => {
    expect(parseSpotNumbers(raw).numbers).toHaveLength(count);
  });

  it('splits digits glued together by a lost separator', () => {
    const r = parseSpotNumbers('130131164');
    expect(r.numbers).toEqual([130, 131, 164]);
    expect(r.merged).toEqual(['130131164']);
  });
});

describe.skipIf(!fs.existsSync(STATEMENT))('PARKING STATEMENT import', () => {
  beforeAll(async () => {
    await resetDb();
    await seedBasics();
  });

  it('parses the real client workbook without errors', async () => {
    const r = await parseStatement(fs.readFileSync(STATEMENT));
    expect(r.summary.errors).toBe(0);
    expect(r.tenants.length).toBeGreaterThan(50);
    expect(r.floorCapacities).toMatchObject({ B1: 242, B2: 278, MF: 66, GF: 70, '1F': 160 });
    expect(r.issues.some((i) => i.code === 'SPOT_CONFLICT')).toBe(true);
    expect(r.units.length).toBeGreaterThan(100);
  });

  it('previews then commits through the API', async () => {
    const { auth } = await login();
    const preview = await request(app).post('/api/imports/preview').set(auth).attach('file', STATEMENT);
    expect(preview.status).toBe(200);
    expect(preview.body.status).toBe('PREVIEW');
    expect(preview.body.summary.tenants).toBeGreaterThan(50);
    const commit = await request(app).post(`/api/imports/${preview.body.id}/commit`).set(auth).send({});
    expect(commit.status).toBe(200);
    // the test DB only has floors B1 + YARD, so tenants located elsewhere are skipped
    expect(commit.body.contracts).toBeGreaterThan(20);
    // the same batch cannot be committed twice
    expect((await request(app).post(`/api/imports/${preview.body.id}/commit`).set(auth).send({})).status).toBe(400);
  });

  it('rejects a non-xlsx file', async () => {
    const { auth } = await login();
    const res = await request(app).post('/api/imports/preview').set(auth).attach('file', Buffer.from('hello'), 'x.txt');
    expect(res.status).toBe(400);
  });
});
