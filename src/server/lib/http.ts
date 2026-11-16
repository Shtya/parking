import type { AuthUser } from '../middleware/auth';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Framework-agnostic request passed to route handlers (built from the Web `Request`). */
export interface ApiRequest {
  method: string;
  path: string;
  url: URL;
  headers: Headers;
  cookies: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  file?: UploadedFile;
  user?: AuthUser;
  ip: string;
  /** set when an approver approved this held request and it is being replayed */
  approved?: boolean;
}

export interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
  /** milliseconds */
  maxAge?: number;
  expires?: Date;
}

/** Collects status, headers, cookies and an optional binary payload; converted to a Web `Response` at the end. */
export class ApiResponse {
  headers = new Headers();
  private cookies: string[] = [];
  private payload: { body: BodyInit; status: number } | null = null;

  get headersSent() {
    return this.payload !== null;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  cookie(name: string, value: string, o: CookieOptions = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`];
    if (o.httpOnly) parts.push('HttpOnly');
    if (o.secure) parts.push('Secure');
    if (o.sameSite) parts.push(`SameSite=${o.sameSite[0].toUpperCase()}${o.sameSite.slice(1)}`);
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge / 1000)}`);
    if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`);
    this.cookies.push(parts.join('; '));
  }

  clearCookie(name: string, o: CookieOptions = {}) {
    this.cookie(name, '', { ...o, maxAge: 0, expires: new Date(0) });
  }

  /** Send a binary body (e.g. Excel). */
  send(body: BodyInit, contentType: string, status = 200) {
    this.headers.set('content-type', contentType);
    this.payload = { body, status };
  }

  toResponse(data: unknown, status: number): Response {
    const headers = new Headers(this.headers);
    this.cookies.forEach((c) => headers.append('set-cookie', c));
    if (this.payload) return new Response(this.payload.body, { status: this.payload.status, headers });
    if (data === undefined) return new Response(null, { status: 204, headers });
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(data), { status, headers });
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function parseQuery(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of params) {
    const cur = out[k];
    out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
  }
  return out;
}
