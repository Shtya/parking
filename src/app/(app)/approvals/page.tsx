'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, ExternalLink, Undo2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import type { ApprovalRequest, ApprovalStatus } from '@/lib/types';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Skeleton, cn } from '@/components/ui';
import { Pager } from '@/components/pager';
import { useI18n, useMe, useMounted } from '@/components/providers';

type Box = 'inbox' | 'mine' | 'all';
const TONE: Record<ApprovalStatus, 'amber' | 'green' | 'red' | 'gray'> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'gray', FAILED: 'red' };
const PAGE = 20;

/** Where the approved action's result lives, when it is something you can open. */
function resultHref(r: ApprovalRequest & { result?: { id?: string } | null }) {
  const id = r.result?.id;
  if (r.permission.startsWith('contracts.')) return id ? `/contracts/${id}` : r.params.id ? `/contracts/${r.params.id}` : null;
  if (r.permission.startsWith('tenants.') && r.permission !== 'tenants.delete') return id && r.permission === 'tenants.create' ? `/tenants/${id}` : r.params.id ? `/tenants/${r.params.id}` : null;
  return null;
}

function RequestCard({ r, box, onDecide }: { r: ApprovalRequest; box: Box; onDecide: (r: ApprovalRequest, kind: 'approve' | 'reject' | 'cancel') => void }) {
  const { t, locale, dir } = useI18n();
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const pending = r.status === 'PENDING';
  const href = r.status === 'APPROVED' ? resultHref(r) : null;
  return (
    <li className={cn('rounded-panel bg-surface p-4 shadow-e1 ring-1 ring-border/60', pending && box === 'inbox' && 'ring-highlight/60')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{t.perm[r.permission]}</Badge>
            <Badge tone={TONE[r.status]}>{t.approvals.status[r.status]}</Badge>
          </div>
          <p className="mt-2 text-[14px] leading-snug font-bold">{r.summary[locale] ?? r.summary.ar}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span className="font-semibold text-fg">{r.requester.name}</span>
            <Arrow className="size-3" aria-hidden />
            <span className="font-semibold text-fg">{r.approver.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={r.createdAt}>{fmtDateTime(r.createdAt, locale)}</time>
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 empty:hidden">
          {/* on phones the actions sit on their own row so the summary keeps the full width */}
          {pending && box === 'inbox' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onDecide(r, 'reject')}>
                <X className="size-3.5" aria-hidden />
                {t.approvals.reject}
              </Button>
              <Button size="sm" onClick={() => onDecide(r, 'approve')}>
                <Check className="size-3.5" aria-hidden />
                {t.approvals.approve}
              </Button>
            </>
          )}
          {pending && box === 'mine' && (
            <Button size="sm" variant="ghost" onClick={() => onDecide(r, 'cancel')}>
              <Undo2 className="size-3.5" aria-hidden />
              {t.approvals.withdraw}
            </Button>
          )}
          {href && (
            <Link href={href}>
              <Button size="sm" variant="ghost">
                <ExternalLink className="size-3.5" aria-hidden />
                {t.common.open}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {(r.decisionNote || r.error || r.decidedAt) && !pending && (
        <div className="mt-3 rounded-input bg-sunken/70 px-3 py-2 text-[12px] leading-relaxed">
          {r.decidedAt && (
            <span className="text-muted">
              {t.approvals.decidedAt}: <time dateTime={r.decidedAt}>{fmtDateTime(r.decidedAt, locale)}</time>
            </span>
          )}
          {r.decisionNote && <p className="mt-0.5">“{r.decisionNote}”</p>}
          {r.error && (
            <p className="mt-0.5 font-semibold text-danger">
              {t.approvals.failedHint} {r.error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Approvals() {
  const { t, locale } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const isAdmin = mounted && me?.role === 'ADMIN';
  const box = (['inbox', 'mine', 'all'].includes(sp.get('box') ?? '') ? sp.get('box') : 'inbox') as Box;
  const [status, setStatus] = useState<ApprovalStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState<{ r: ApprovalRequest; kind: 'approve' | 'reject' | 'cancel' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api<{ pending: number; mine: number }>('/approvals/count') });
  const list = useQuery({
    queryKey: ['approvals', box, status, page],
    queryFn: () => api<{ items: ApprovalRequest[]; total: number }>('/approvals', { query: { box, status: status || undefined, page, pageSize: PAGE } }),
  });

  const setBox = (b: Box) => {
    setPage(1);
    router.replace(`${pathname}?box=${b}`, { scroll: false });
  };

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    const { r, kind } = deciding;
    try {
      await api(`/approvals/${r.id}/${kind}`, { method: 'POST', body: kind === 'cancel' ? {} : { note: note.trim() || undefined } });
      toast.success(kind === 'approve' ? t.approvals.approved : kind === 'reject' ? t.approvals.rejected : t.approvals.withdrawn);
      // an approval changes real data: refresh everything it may have touched
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
      qc.invalidateQueries({ queryKey: ['approvals'] });
    } finally {
      setBusy(false);
      setDeciding(null);
      setNote('');
    }
  };

  const tabs: { key: Box; label: string; count?: number }[] = [
    { key: 'inbox', label: t.approvals.inbox, count: mounted ? counts.data?.pending : undefined },
    { key: 'mine', label: t.approvals.mine, count: mounted ? counts.data?.mine : undefined },
    ...(isAdmin ? [{ key: 'all' as Box, label: t.approvals.all }] : []),
  ];
  const statuses: (ApprovalStatus | '')[] = ['PENDING', 'APPROVED', 'REJECTED', 'FAILED', 'CANCELLED', ''];

  return (
    <>
      <PageHeader title={t.approvals.title} subtitle={t.approvals.subtitle} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t.approvals.title} className="inline-flex rounded-input bg-sunken p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              role="tab"
              type="button"
              aria-selected={box === tb.key}
              onClick={() => setBox(tb.key)}
              className={cn(
                'flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-[180ms]',
                box === tb.key ? 'bg-surface text-fg shadow-e1' : 'text-muted hover:text-fg',
              )}
            >
              {tb.label}
              {!!tb.count && <span className="font-sign grid h-5 min-w-5 place-items-center rounded-full bg-highlight px-1.5 text-[11px] font-bold text-highlight-ink">{fmtNumber(tb.count, locale)}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label={t.common.status}>
          {statuses.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-semibold ring-1 transition-colors duration-[180ms]',
                status === s ? 'bg-accent text-primary-fg ring-accent' : 'bg-surface text-muted ring-border hover:text-fg',
              )}
            >
              {s ? t.approvals.status[s] : t.common.all}
            </button>
          ))}
        </div>
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : !list.data ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-panel" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-6" />} title={box === 'inbox' && status === 'PENDING' ? t.approvals.emptyInbox : t.approvals.empty} />
      ) : (
        <>
          <ul className="grid gap-3">
            {list.data.items.map((r) => (
              <RequestCard key={r.id} r={r} box={box} onDecide={(r, kind) => setDeciding({ r, kind })} />
            ))}
          </ul>
          {list.data.total > PAGE && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
        </>
      )}

      <Modal
        open={!!deciding}
        onClose={() => !busy && setDeciding(null)}
        title={deciding?.kind === 'approve' ? t.approvals.approve : deciding?.kind === 'reject' ? t.approvals.reject : t.approvals.withdraw}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button variant={deciding?.kind === 'reject' ? 'danger' : 'primary'} onClick={decide} disabled={busy}>
              {deciding?.kind === 'approve' ? t.approvals.approve : deciding?.kind === 'reject' ? t.approvals.reject : t.approvals.withdraw}
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="grid gap-4">
            <div className="rounded-input bg-sunken/70 px-3 py-2.5">
              <p className="text-[11px] font-bold text-muted">{t.perm[deciding.r.permission]}</p>
              <p className="mt-1 text-[14px] font-bold">{deciding.r.summary[locale] ?? deciding.r.summary.ar}</p>
              <p className="mt-1 text-[12px] text-muted">
                {t.approvals.requestedBy}: <span className="font-semibold text-fg">{deciding.r.requester.name}</span>
              </p>
            </div>
            {deciding.kind !== 'cancel' && (
              <Field label={t.approvals.note}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense>
      <Approvals />
    </Suspense>
  );
}
