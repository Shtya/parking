import { describe, it, expect, beforeAll } from 'vitest';
import request from './http';
import { app, resetDb, seedBasics, login, PASSWORD } from './helpers';

describe('auth', () => {
  beforeAll(async () => {
    await resetDb();
    await seedBasics();
  });

  it('logs in with valid credentials and sets cookies', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('ADMIN');
    expect(String(res.headers['set-cookie'])).toContain('pms_access');
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('protects endpoints and returns the current user', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const { auth } = await login();
    const me = await request(app).get('/api/auth/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('admin@test.local');
  });

  it('rotates refresh tokens', async () => {
    const first = await request(app).post('/api/auth/login').send({ email: 'staff@test.local', password: PASSWORD });
    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(r1.status).toBe(200);
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('enforces roles (STAFF cannot manage users)', async () => {
    const { auth } = await login('staff@test.local');
    expect((await request(app).get('/api/users').set(auth)).status).toBe(403);
    const admin = await login();
    expect((await request(app).get('/api/users').set(admin.auth)).status).toBe(200);
  });
});
