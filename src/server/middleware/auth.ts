import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../lib/env';
import { forbidden, unauthorized } from '../lib/errors';
import type { ApiRequest } from '../lib/http';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const ACCESS_COOKIE = 'pms_access';
export const REFRESH_COOKIE = 'pms_refresh';

export function signAccessToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/** Reads the Bearer token (Swagger / API clients) or the httpOnly cookie (browser). */
export function authenticate(req: ApiRequest): AuthUser {
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies[ACCESS_COOKIE];
  if (!token) throw unauthorized();
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    req.user = { id: String(p.sub), email: p.email, name: p.name, role: p.role };
    return req.user;
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export function requireRole(req: ApiRequest, roles: Role[]) {
  if (!req.user) throw unauthorized();
  if (!roles.includes(req.user.role)) throw forbidden();
}
