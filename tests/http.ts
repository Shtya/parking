/**
 * Tiny supertest-compatible client that calls the Next.js API handler in-process
 * (no server needed):  await request(app).post('/api/x').set(headers).send(body)
 */
import fs from 'node:fs';
import path from 'node:path';
import { handleApi } from '../src/server/handler';

export interface TestResponse {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Record<string, string | string[]>;
  text: string;
}

class TestRequest implements PromiseLike<TestResponse> {
  private headers: Record<string, string> = {};
  private body: unknown;
  private file?: { field: string; data: Buffer; name: string };

  constructor(
    private method: string,
    private url: string,
  ) {}

  set(h: Record<string, string>) {
    Object.assign(this.headers, h);
    return this;
  }

  send(body: unknown) {
    this.body = body;
    return this;
  }

  attach(field: string, src: string | Buffer, name?: string) {
    const data = typeof src === 'string' ? fs.readFileSync(src) : src;
    this.file = { field, data, name: name ?? (typeof src === 'string' ? path.basename(src) : 'file') };
    return this;
  }

  private async exec(): Promise<TestResponse> {
    let body: BodyInit | undefined;
    const headers = new Headers(this.headers);
    if (this.file) {
      const fd = new FormData();
      fd.append(this.file.field, new Blob([new Uint8Array(this.file.data)]), this.file.name);
      body = fd;
    } else if (this.body !== undefined) {
      body = JSON.stringify(this.body);
      headers.set('content-type', 'application/json');
    }
    const res = await handleApi(new Request(`http://localhost${this.url}`, { method: this.method, headers, body }));
    const text = await res.text();
    const out: Record<string, string | string[]> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    const cookies = res.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    let parsed: unknown = text;
    if ((res.headers.get('content-type') ?? '').includes('json')) {
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep text */
      }
    }
    return { status: res.status, body: parsed, headers: out, text };
  }

  then<A = TestResponse, B = never>(onfulfilled?: ((v: TestResponse) => A | PromiseLike<A>) | null, onrejected?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export default function request(_app?: unknown) {
  return {
    get: (url: string) => new TestRequest('GET', url),
    post: (url: string) => new TestRequest('POST', url),
    put: (url: string) => new TestRequest('PUT', url),
    patch: (url: string) => new TestRequest('PATCH', url),
    delete: (url: string) => new TestRequest('DELETE', url),
  };
}
