import type { Role } from '@prisma/client';
import { z } from './zod';
import { registry, ErrorSchema } from './openapi';
import { authenticate, requireRole, type AuthUser } from '../middleware/auth';
import { badRequest, forbidden } from './errors';
import type { ApiRequest, ApiResponse } from './http';
import { resolvePermission, type PermissionKey } from './permissions';
import { holdForApproval } from './approvals';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Infer<T> = T extends z.ZodTypeAny ? z.infer<T> : undefined;

export interface RouteSpec<B, Q, P> {
  method: Method;
  path: string; // e.g. "/:id"
  tag: string;
  summary: string;
  description?: string;
  /** false = public, true = any authenticated user, Role[] = only these roles */
  auth?: boolean | Role[];
  body?: B;
  query?: Q;
  params?: P;
  status?: number;
  /** multipart upload field name */
  upload?: string;
  /** binary response */
  produces?: 'xlsx';
  /**
   * Per-user permission guarding this action. Admins configure per user whether it is
   * allowed and whether it must first be approved (and by whom). When approval is needed
   * the validated request is stored and the API answers 202 { approvalRequired, request }.
   */
  permission?: PermissionKey;
}

export interface RouteCtx<B, Q, P> {
  req: ApiRequest;
  res: ApiResponse;
  body: Infer<B>;
  query: Infer<Q>;
  params: Infer<P>;
  user: AuthUser;
}

export type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<{ data: unknown; status: number }>;

interface RouteDef {
  method: Method;
  path: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

/** Minimal router: matches method + path pattern (":param" segments). */
export class Router {
  routes: RouteDef[] = [];

  add(method: Method, path: string, handler: RouteHandler) {
    const keys: string[] = [];
    const src = path
      .replace(/\/$/, '')
      .split('/')
      .map((seg) => (seg.startsWith(':') ? (keys.push(seg.slice(1)), '([^/]+)') : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    this.routes.push({ method, path, pattern: new RegExp(`^${src || ''}/?$`), keys, handler });
  }

  match(method: string, path: string) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params, pathMatched };
    }
    return { route: null, params: {}, pathMatched };
  }
}

export const createRouter = () => new Router();

/** Every guarded handler, keyed "method /full/path", so an approved request can be replayed. */
const replayable = new Map<string, RouteHandler>();
const replayKey = (method: string, routePath: string) => `${method.toLowerCase()} ${routePath}`;
export const getReplayHandler = (method: string, routePath: string) => replayable.get(replayKey(method, routePath));

/**
 * Registers a route AND its OpenAPI documentation from one definition.
 * Auth/roles run first, then zod validation of params, query and body.
 */
export function route<B extends z.ZodTypeAny | undefined = undefined, Q extends z.ZodTypeAny | undefined = undefined, P extends z.ZodTypeAny | undefined = undefined>(
  router: Router,
  basePath: string,
  spec: RouteSpec<B, Q, P>,
  handler: (ctx: RouteCtx<B, Q, P>) => Promise<unknown>,
) {
  const auth = spec.auth ?? true;
  const full = (basePath + spec.path).replace(/\/$/, '') || '/';
  const okStatus = spec.status ?? (spec.method === 'post' ? 201 : 200);

  const handle: RouteHandler = async (req, res) => {
    // a replayed (approved) request carries its requester already; skip token & role checks
    if (!req.approved) {
      if (auth !== false) authenticate(req);
      if (Array.isArray(auth)) requireRole(req, auth);
    }
    if (spec.upload && !req.file) throw badRequest(`Attach the file in the "${spec.upload}" field`);
    const params = spec.params ? (spec.params as z.ZodTypeAny).parse(req.params) : undefined;
    const query = spec.query ? (spec.query as z.ZodTypeAny).parse(req.query) : undefined;
    const body = spec.body ? (spec.body as z.ZodTypeAny).parse(req.body ?? {}) : undefined;
    if (spec.permission && req.user) {
      const decision = await resolvePermission(req.user, spec.permission);
      if (!decision.allowed) throw forbidden('You do not have permission for this action');
      if (decision.requiresApproval && !req.approved) {
        const request = await holdForApproval({
          permission: spec.permission, method: spec.method, routePath: full,
          params: req.params, query: req.query, body: req.body ?? {}, user: req.user, approverId: decision.approverId,
        });
        return { data: { approvalRequired: true, request }, status: 202 };
      }
    }
    const data = await handler({ req, res, body, query, params, user: req.user as AuthUser } as RouteCtx<B, Q, P>);
    return { data, status: okStatus };
  };
  router.add(spec.method, full, handle);
  if (spec.permission) replayable.set(replayKey(spec.method, full), handle);

  // ── OpenAPI ──
  const roles =
    (Array.isArray(auth) ? ` _(roles: ${auth.join(', ')})_` : '') +
    (spec.permission ? ` _(permission: ${spec.permission}; answers 202 when the user's permission requires approval)_` : '');
  registry.registerPath({
    method: spec.method,
    path: full.replace(/:(\w+)/g, '{$1}'),
    tags: [spec.tag],
    summary: spec.summary,
    description: (spec.description ?? '') + roles,
    security: auth === false ? [] : [{ bearerAuth: [] }],
    request: {
      params: spec.params as never,
      query: spec.query as never,
      body: spec.upload
        ? { content: { 'multipart/form-data': { schema: z.object({ [spec.upload]: z.any().openapi({ type: 'string', format: 'binary' }) }) } } }
        : spec.body
          ? { content: { 'application/json': { schema: spec.body as never } } }
          : undefined,
    },
    responses: {
      [okStatus]: spec.produces
        ? { description: 'Excel file', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: z.any().openapi({ type: 'string', format: 'binary' }) } } }
        : { description: 'Success' },
      400: { description: 'Bad request', content: { 'application/json': { schema: ErrorSchema } } },
      ...(auth !== false ? { 401: { description: 'Unauthenticated' }, 403: { description: 'Forbidden' } } : {}),
      422: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    },
  });
}

export const IdParams = z.object({ id: z.string().min(1) });
export const Pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  q: z.string().trim().optional(),
});
export const paginate = (page: number, pageSize: number) => ({ skip: (page - 1) * pageSize, take: pageSize });
