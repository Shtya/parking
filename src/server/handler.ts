import { logger } from './lib/logger';
import { AppError, toErrorPayload } from './lib/errors';
import { ApiResponse, parseCookies, parseQuery, type ApiRequest } from './lib/http';
import { buildOpenApiDocument } from './lib/openapi';
import { routers } from './routes';

const SWAGGER_HTML = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Parking API</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css"/></head>
<body><div id="ui"></div><script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:'/api/docs.json',dom_id:'#ui',persistAuthorization:true});</script></body></html>`;

let openapiDoc: unknown = null;

function match(method: string, path: string) {
  let pathMatched = false;
  for (const r of routers) {
    const m = r.match(method, path);
    if (m.route) return m;
    pathMatched ||= m.pathMatched;
  }
  return { route: null, params: {}, pathMatched };
}

/** Single entry point for every /api/* request (used by the Next.js catch-all route handler and the tests). */
export async function handleApi(request: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toLowerCase();

  if (method === 'get' && path === '/api/docs.json') return Response.json((openapiDoc ??= buildOpenApiDocument()));
  if (method === 'get' && path === '/api/docs') return new Response(SWAGGER_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });

  const res = new ApiResponse();
  let status = 500;
  try {
    const { route, params, pathMatched } = match(method, path);
    if (!route) throw new AppError(pathMatched ? 405 : 404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${path} not found`);

    const req: ApiRequest = {
      method: request.method,
      path,
      url,
      headers: request.headers,
      cookies: parseCookies(request.headers.get('cookie')),
      params,
      query: parseQuery(url.searchParams),
      body: undefined,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local',
    };

    const type = request.headers.get('content-type') ?? '';
    if (method !== 'get' && method !== 'delete') {
      if (type.includes('multipart/form-data')) {
        const form = await request.formData();
        for (const [, value] of form) {
          if (typeof value === 'object' && 'arrayBuffer' in value) {
            const f = value as File;
            if (f.size > 25 * 1024 * 1024) throw new AppError(413, 'UPLOAD_TOO_LARGE', 'File is larger than 25 MB');
            req.file = { buffer: Buffer.from(await f.arrayBuffer()), originalname: f.name, mimetype: f.type, size: f.size };
            break;
          }
        }
      } else {
        const text = await request.text();
        if (text) {
          try {
            req.body = JSON.parse(text);
          } catch {
            throw new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
          }
        }
      }
    }

    const { data, status: okStatus } = await route.handler(req, res);
    status = res.headersSent ? 200 : data === undefined ? 204 : okStatus;
    return res.toResponse(data, okStatus);
  } catch (err) {
    const { status: s, body } = toErrorPayload(err, path);
    status = s;
    return res.toResponse(body, s);
  } finally {
    if (path !== '/api/health') logger.info({ method: request.method, path, status, ms: Date.now() - started }, 'request');
  }
}
