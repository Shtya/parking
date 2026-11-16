'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface PendingApproval {
  id: string;
  status: 'PENDING';
  summary: { ar: string; en: string };
  approver: { id: string; name: string };
}

/**
 * Thrown when the action was not applied because the user's permission requires approval.
 * Callers' success paths are skipped; the global handler shows "sent for approval".
 */
export class ApprovalPendingError extends Error {
  constructor(public request: PendingApproval) {
    super('approval-pending');
  }
}

let onApprovalPending: ((r: PendingApproval) => void) | null = null;
export const setApprovalPendingHandler = (fn: typeof onApprovalPending) => {
  onApprovalPending = fn;
};
export const isApprovalPending = (e: unknown): e is ApprovalPendingError => e instanceof ApprovalPendingError;

let refreshing: Promise<boolean> | null = null;
async function refresh() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type Opts = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | undefined | null> };

/** Same-origin fetch to the API (/api/* route handlers). Retries once after refreshing the session. */
export async function api<T = unknown>(path: string, opts: Opts = {}, retry = true): Promise<T> {
  const { body, query, headers, ...rest } = opts;
  const qs = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api${path}${qs}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, opts, false);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; details?: unknown } }).error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.details);
  }
  if (res.status === 202 && (data as { approvalRequired?: boolean }).approvalRequired) {
    const request = (data as { request: PendingApproval }).request;
    onApprovalPending?.(request);
    throw new ApprovalPendingError(request);
  }
  return data as T;
}

/** Downloads a binary endpoint (Excel reports) with the session cookie. */
export async function download(path: string, query?: Record<string, string>) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  let res = await fetch(`/api${path}${qs}`, { credentials: 'include' });
  if (res.status === 401 && (await refresh())) res = await fetch(`/api${path}${qs}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'report.xlsx';
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
