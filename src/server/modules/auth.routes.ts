import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { env, isProd } from '../lib/env';
import { createRouter, route } from '../lib/route';
import { unauthorized, badRequest } from '../lib/errors';
import { audit } from '../lib/audit';
import { rateLimit } from '../lib/rate-limit';
import type { ApiResponse } from '../lib/http';
import { ACCESS_COOKIE, REFRESH_COOKIE, signAccessToken, type AuthUser } from '../middleware/auth';

export const authRouter = createRouter();
const BASE = '/api/auth';

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function sessionCookieBase() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: isProd(), path: '/' };
}

/** Same attributes as when the cookies were set, so the browser actually drops them (including Secure on Vercel). */
function clearSession(res: ApiResponse) {
  const base = sessionCookieBase();
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

async function issueTokens(res: ApiResponse, user: AuthUser) {
  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hash(refreshToken), expiresAt } });
  const base = sessionCookieBase();
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, expires: expiresAt });
  return { accessToken, refreshToken, expiresAt };
}

const publicUser = (u: { id: string; email: string; name: string; role: AuthUser['role']; locale: string; phone: string | null; receiveReminders: boolean }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, phone: u.phone, receiveReminders: u.receiveReminders,
});

route(
  authRouter, BASE,
  {
    method: 'post', path: '/login', tag: 'Auth', summary: 'Login with email & password', auth: false, status: 200,
    body: z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }).openapi('LoginRequest'),
  },
  async ({ body, req, res }) => {
    rateLimit(`login:${req.ip}`, 20, 15 * 60 * 1000);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive || !(await bcrypt.compare(body.password, user.passwordHash))) throw unauthorized('Invalid email or password');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueTokens(res, user);
    await audit(user.id, 'LOGIN', 'User', user.id);
    return { user: publicUser(user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
);

route(
  authRouter, BASE,
  {
    method: 'post', path: '/refresh', tag: 'Auth', summary: 'Rotate refresh token and get a new access token', auth: false, status: 200,
    body: z.object({ refreshToken: z.string().optional() }),
  },
  async ({ body, req, res }) => {
    const token = body.refreshToken ?? req.cookies[REFRESH_COOKIE];
    if (!token) {
      clearSession(res);
      throw unauthorized('Missing refresh token');
    }
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      clearSession(res);
      throw unauthorized('Invalid refresh token');
    }
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens(res, stored.user);
    return { user: publicUser(stored.user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
);

route(
  authRouter, BASE,
  { method: 'post', path: '/logout', tag: 'Auth', summary: 'Logout (revokes refresh token, clears cookies)', auth: false, status: 200 },
  async ({ req, res }) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await prisma.refreshToken.updateMany({ where: { tokenHash: hash(token) }, data: { revokedAt: new Date() } });
    clearSession(res);
    return { ok: true };
  },
);

route(authRouter, BASE, { method: 'get', path: '/me', tag: 'Auth', summary: 'Current user profile' }, async ({ user }) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return publicUser(u);
});

route(
  authRouter, BASE,
  {
    method: 'patch', path: '/me', tag: 'Auth', summary: 'Update own profile / password',
    body: z.object({
      name: z.string().min(2).optional(),
      phone: z.string().max(30).nullable().optional(),
      locale: z.enum(['ar', 'en']).optional(),
      receiveReminders: z.boolean().optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).optional(),
    }),
  },
  async ({ user, body }) => {
    const { currentPassword, newPassword, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (newPassword) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!currentPassword || !(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest('Current password is incorrect');
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    const u = await prisma.user.update({ where: { id: user.id }, data });
    return publicUser(u);
  },
);
