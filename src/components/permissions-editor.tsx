'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { EffectivePermission, PermissionKey, User } from '@/lib/types';
import { Badge, Button, Checkbox, Modal, Select, Skeleton, cn } from './ui';
import { useI18n } from './providers';

type Row = Pick<EffectivePermission, 'permission' | 'allowed' | 'requiresApproval' | 'approverId'>;

const GROUPS: { key: 'contracts' | 'tenants' | 'floors' | 'imports' | 'settings'; perms: PermissionKey[] }[] = [
  { key: 'contracts', perms: ['contracts.create', 'contracts.update', 'contracts.renew', 'contracts.terminate'] },
  { key: 'tenants', perms: ['tenants.create', 'tenants.update', 'tenants.delete'] },
  { key: 'floors', perms: ['spots.edit'] },
  { key: 'imports', perms: ['imports.commit'] },
  { key: 'settings', perms: ['settings.update'] },
];

/** Admin editor: per action → allowed · needs approval · who approves. */
export function PermissionsModal({ user, users, open, onClose }: { user: User | null; users: User[]; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['users', user?.id, 'permissions'],
    enabled: open && !!user,
    queryFn: () => api<EffectivePermission[]>(`/users/${user!.id}/permissions`),
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setRows(q.data.map(({ permission, allowed, requiresApproval, approverId }) => ({ permission, allowed, requiresApproval, approverId })));
    setErr(null);
  }, [q.data]);

  const sourceOf = useMemo(() => new Map(q.data?.map((p) => [p.permission, p.source])), [q.data]);
  const approvers = users.filter((u) => u.isActive && u.id !== user?.id);
  const locked = q.data?.[0]?.locked ?? user?.role === 'ADMIN';
  const set = (k: PermissionKey, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.permission === k ? { ...r, ...patch } : r)));
  const missing = rows.some((r) => r.allowed && r.requiresApproval && !r.approverId);
  const pending = rows.filter((r) => r.allowed && r.requiresApproval).length;

  const save = async () => {
    if (!user) return;
    if (missing) return setErr(t.permissions.approverMissing);
    setSaving(true);
    try {
      await api(`/users/${user.id}/permissions`, { method: 'PUT', body: { permissions: rows } });
      toast.success(t.common.saved);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['me', 'permissions'] });
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // an empty rule set = role defaults; send the role's own allowed values so nothing is stored
      const fresh = await api<EffectivePermission[]>(`/users/${user.id}/permissions`, { method: 'PUT', body: { permissions: [] } });
      setRows(fresh.map(({ permission, allowed, requiresApproval, approverId }) => ({ permission, allowed, requiresApproval, approverId })));
      qc.invalidateQueries({ queryKey: ['users', user.id, 'permissions'] });
      toast.success(t.common.saved);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          {t.permissions.title.replace('{name}', user?.name ?? '')}
        </span>
      }
      footer={
        locked ? (
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={resetDefaults} disabled={saving} className="me-auto">
              <RotateCcw className="size-3.5" aria-hidden />
              {t.permissions.reset}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button onClick={save} disabled={saving || !q.data}>
              {t.common.save}
            </Button>
          </>
        )
      }
    >
      {locked ? (
        <p className="rounded-input bg-sunken px-3 py-2.5 text-[13px] text-muted">{t.permissions.adminLocked}</p>
      ) : (
        <>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">{t.permissions.intro}</p>
          {!q.data ? (
            <div className="grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 rounded-input" />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-panel ring-1 ring-border/70">
              <div className="hidden grid-cols-[minmax(0,1fr)_88px_118px_200px] items-center gap-3 bg-sunken/70 px-3 py-2 text-[11px] font-bold text-muted sm:grid">
                <span>{t.permissions.action}</span>
                <span className="text-center">{t.permissions.allowed}</span>
                <span className="text-center">{t.permissions.needsApproval}</span>
                <span>{t.permissions.approver}</span>
              </div>
              {GROUPS.map((g) => (
                <section key={g.key} className="border-t border-border/70 first:border-t-0 sm:first:border-t">
                  <h3 className="bg-surface px-3 pt-2.5 pb-1 text-[11px] font-extrabold tracking-wide text-muted uppercase">{t.nav[g.key]}</h3>
                  {g.perms.map((k) => {
                    const r = rows.find((x) => x.permission === k);
                    if (!r) return null;
                    const needs = r.allowed && r.requiresApproval;
                    return (
                      <div
                        key={k}
                        className={cn(
                          'grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_88px_118px_200px]',
                          needs && 'bg-highlight/[0.07]',
                        )}
                      >
                        <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                          <span className={cn('text-[13px] leading-snug font-semibold',!r.allowed && 'text-muted line-through decoration-border-strong')}>{t.perm[k]}</span>
                          {sourceOf.get(k) === 'custom' && <Badge tone="teal">{t.permissions.custom}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 sm:justify-center">
                          <Checkbox label={<span className="text-[12px] sm:sr-only">{t.permissions.allowed}</span>} srLabel={`${t.permissions.allowed} — ${t.perm[k]}`} checked={r.allowed} onChange={(c) => set(k, { allowed: c, requiresApproval: c ? r.requiresApproval : false })} />
                        </div>
                        <div className="flex items-center gap-2 sm:justify-center">
                          <Checkbox
                            label={<span className="text-[12px] sm:sr-only">{t.permissions.needsApproval}</span>}
                            srLabel={`${t.permissions.needsApproval} — ${t.perm[k]}`}
                            checked={needs}
                            disabled={!r.allowed}
                            onChange={(c) => set(k, { requiresApproval: c })}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          {needs ? (
                            <Select
                              value={r.approverId ?? ''}
                              placeholder={t.permissions.chooseApprover}
                              onChange={(e) => set(k, { approverId: e.target.value || null })}
                              className={cn('h-8 text-[12px]', !r.approverId && 'ring-warning')}
                              aria-label={`${t.permissions.approver} — ${t.perm[k]}`}
                            >
                              {approvers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} · {t.role[u.role]}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="hidden text-[12px] text-muted/70 sm:inline">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">{pending ? t.permissions.summary.replace('{n}', String(pending)) : ''}</span>
            {err && <span className="font-semibold text-danger">{err}</span>}
          </div>
        </>
      )}
    </Modal>
  );
}
