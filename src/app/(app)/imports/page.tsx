'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Info, UploadCloud } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime, fmtNumber, isoToday } from '@/lib/format';
import type { ImportIssue } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Stat, Table, Td, Th, cn } from '@/components/ui';
import { useCan, useI18n } from '@/components/providers';

interface Preview {
  id: string;
  status: string;
  fileName: string;
  summary: {
    tenants: number; rows: number; numberedSpots: number; unnumberedSpots: number; units: number; conflicts: number; errors: number; warnings: number; info: number;
    existingActiveContracts: number; byFloor: Record<string, number>;
  };
  issues: ImportIssue[];
  tenants: {
    nameAr: string; code: string | null; officeUnits: string | null; rows: number[];
    spots: { floorCode: string; label: string; kind: string }[]; allocations: { floorCode: string; quantity: number; kind: string }[];
  }[];
}
interface Batch { id: string; fileName: string; status: string; createdAt: string; committedAt: string | null; summary: Preview['summary']; createdBy: { name: string } | null }

const SEV_ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };
const SEV_TONE = { error: 'red', warning: 'amber', info: 'blue' } as const;

export default function ImportsPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sev, setSev] = useState<'' | 'error' | 'warning' | 'info'>('');
  const [startDate, setStartDate] = useState(isoToday());
  const [replace, setReplace] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<Record<string, number | string> | null>(null);
  const history = useQuery({ queryKey: ['imports'], queryFn: () => api<Batch[]>('/imports') });

  const upload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const p = await api<Preview>('/imports/preview', { method: 'POST', body: fd });
      setPreview(p);
      setReplace(p.summary.existingActiveContracts > 0 && can('ADMIN', 'OWNER'));
      qc.invalidateQueries({ queryKey: ['imports'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const r = await api<Record<string, number | string>>(`/imports/${preview.id}/commit`, { method: 'POST', body: { startDate, replaceExisting: replace } });
      setResult(r);
      setPreview(null);
      toast.success(t.imports.success);
      ['imports', 'dashboard', 'floors', 'floor', 'tenants', 'contracts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  const discard = async () => {
    if (preview) await api(`/imports/${preview.id}/discard`, { method: 'POST', body: {} }).catch(() => undefined);
    setPreview(null);
    qc.invalidateQueries({ queryKey: ['imports'] });
  };

  const issues = useMemo(() => preview?.issues.filter((i) => !sev || i.severity === sev) ?? [], [preview, sev]);

  return (
    <>
      <PageHeader title={t.imports.title} subtitle={t.imports.subtitle} />

      {!preview && (
        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
          className={cn('grid cursor-pointer place-items-center border-2 border-dashed p-12 text-center transition', drag ? 'border-primary bg-primary-soft' : 'hover:border-primary/50')}
          onClick={() => input.current?.click()}
        >
          <input
            ref={input}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
          <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <UploadCloud className="size-7" />
          </div>
          <p className="mt-4 font-medium">{uploading ? t.common.loading : t.imports.drop}</p>
          <p className="mt-1 text-xs text-muted">PARKING STATEMENT (…).xlsx</p>
        </Card>
      )}

      {result && (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5" />
            {t.imports.success}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {Object.entries(result).map(([k, v]) => (
              <Badge key={k}>
                {k}: {String(v)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {preview && (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
            <FileSpreadsheet className="size-5 text-primary" />
            <span className="font-medium">{preview.fileName}</span>
            <Badge tone={preview.status === 'FAILED' ? 'red' : 'teal'}>{preview.status}</Badge>
            <div className="flex-1" />
            <Field label={t.imports.startDate} className="w-44">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            {preview.summary.existingActiveContracts > 0 && (
              <div className="w-full sm:w-auto">
                <Checkbox
                  label={`${t.imports.replace} (${preview.summary.existingActiveContracts} ${t.imports.existing})`}
                  checked={replace}
                  disabled={!can('ADMIN', 'OWNER')}
                  onChange={setReplace}
                />
              </div>
            )}
            <Button variant="ghost" onClick={discard}>
              {t.imports.discard}
            </Button>
            <Button onClick={commit} loading={committing} disabled={preview.status !== 'PREVIEW' || (preview.summary.existingActiveContracts > 0 && !replace)}>
              {t.imports.commit}
            </Button>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label={t.imports.tenantsFound} value={fmtNumber(preview.summary.tenants, locale)} />
            <Stat label={t.imports.numbered} value={fmtNumber(preview.summary.numberedSpots, locale)} />
            <Stat label={t.imports.unnumbered} value={fmtNumber(preview.summary.unnumberedSpots, locale)} />
            <Stat label={t.imports.units} value={fmtNumber(preview.summary.units, locale)} />
            <Stat label={t.imports.conflicts} value={fmtNumber(preview.summary.conflicts, locale)} tone="amber" />
            <Stat label={t.imports.warnings} value={fmtNumber(preview.summary.warnings, locale)} tone="amber" />
            <Stat label={t.imports.errors} value={fmtNumber(preview.summary.errors, locale)} tone="red" />
          </div>

          <Card className="mt-4 p-4">
            <p className="mb-2 text-sm font-semibold">{t.imports.byFloor}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.summary.byFloor).map(([f, n]) => (
                <Badge key={f} tone="teal">
                  {f}: {n}
                </Badge>
              ))}
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title={`${t.imports.issues} (${preview.issues.length})`}
              action={
                <Select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} className="h-9 w-40">
                  <option value="">{t.common.all}</option>
                  <option value="error">{t.imports.errors}</option>
                  <option value="warning">{t.imports.warnings}</option>
                  <option value="info">{t.imports.info}</option>
                </Select>
              }
            />
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <thead className="sticky top-0">
                  <tr>
                    <Th>{t.imports.severity}</Th>
                    <Th>{t.imports.row}</Th>
                    <Th>{t.contracts.tenant}</Th>
                    <Th>{t.imports.message}</Th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((i, k) => {
                    const Icon = SEV_ICON[i.severity];
                    return (
                      <tr key={k}>
                        <Td>
                          <Badge tone={SEV_TONE[i.severity]}>
                            <Icon className="size-3" />
                            {i.code}
                          </Badge>
                        </Td>
                        <Td className="tabular-nums">
                          {i.row ?? '—'}
                          {i.column ? ` · ${i.column}` : ''}
                        </Td>
                        <Td className="max-w-56 truncate text-xs">{i.tenant ?? '—'}</Td>
                        <Td className="text-xs" dir="ltr">
                          {i.message}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title={`${t.imports.tenantsFound} (${preview.tenants.length})`} />
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <thead className="sticky top-0">
                  <tr>
                    <Th>{t.imports.row}</Th>
                    <Th>{t.common.name}</Th>
                    <Th>{t.tenants.units}</Th>
                    <Th>{t.contracts.spots}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tenants.map((x) => {
                    const byF = new Map<string, string[]>();
                    x.spots.forEach((s) => byF.set(s.floorCode, [...(byF.get(s.floorCode) ?? []), s.label]));
                    return (
                      <tr key={x.nameAr}>
                        <Td className="tabular-nums">{x.rows.join(', ')}</Td>
                        <Td>
                          {x.nameAr}
                          {x.code && (
                            <Badge tone="teal" className="ms-2">
                              {x.code}
                            </Badge>
                          )}
                        </Td>
                        <Td className="text-xs text-muted">{x.officeUnits ?? '—'}</Td>
                        <Td className="text-xs">
                          {[...byF.entries()].map(([f, l]) => (
                            <div key={f}>
                              <b>{f}</b> ({l.length}): {l.join(', ')}
                            </div>
                          ))}
                          {x.allocations.map((a, k) => (
                            <div key={k}>
                              <b>{a.floorCode}</b>: ×{a.quantity} ({t.kind[a.kind as 'PAID']})
                            </div>
                          ))}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-6">
        <CardHeader title={t.imports.history} />
        <Table>
          <thead>
            <tr>
              <Th>{t.imports.file}</Th>
              <Th>{t.common.status}</Th>
              <Th>{t.common.date}</Th>
              <Th>{t.imports.tenantsFound}</Th>
              <Th>{t.imports.warnings}</Th>
            </tr>
          </thead>
          <tbody>
            {history.data?.map((b) => (
              <tr key={b.id}>
                <Td className="max-w-72 truncate">{b.fileName}</Td>
                <Td>
                  <Badge tone={b.status === 'COMMITTED' ? 'green' : b.status === 'FAILED' ? 'red' : 'gray'}>{b.status}</Badge>
                </Td>
                <Td className="text-xs">
                  {fmtDateTime(b.committedAt ?? b.createdAt, locale)} · {b.createdBy?.name ?? '—'}
                </Td>
                <Td className="tabular-nums">{b.summary.tenants}</Td>
                <Td className="tabular-nums">{b.summary.warnings}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
