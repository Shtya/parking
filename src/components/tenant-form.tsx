'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, isApprovalPending } from '@/lib/api';
import type { Contact } from '@/lib/types';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from './ui';
import { useI18n } from './providers';

export interface TenantFormValue {
  id?: string;
  nameAr: string;
  nameEn: string | null;
  code: string | null;
  officeUnits: string | null;
  email: string | null;
  phone: string | null;
  crNumber: string | null;
  minSpots: number;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
}

const EMPTY: TenantFormValue = { nameAr: '', nameEn: '', code: '', officeUnits: '', email: '', phone: '', crNumber: '', minSpots: 2, status: 'ACTIVE', notes: '' };

const clean = (v: TenantFormValue) => ({
  nameAr: v.nameAr,
  nameEn: v.nameEn || null,
  code: v.code || null,
  officeUnits: v.officeUnits || null,
  email: v.email || null,
  phone: v.phone || null,
  crNumber: v.crNumber || null,
  minSpots: v.minSpots,
  status: v.status,
  notes: v.notes || null,
});

export function TenantFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: TenantFormValue }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const [v, setV] = useState<TenantFormValue>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV(initial ?? EMPTY);
      setErr(null);
    }
  }, [open, initial]);
  const set = <K extends keyof TenantFormValue>(k: K, val: TenantFormValue[K]) => setV((x) => ({ ...x, [k]: val }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (initial?.id) {
        await api(`/tenants/${initial.id}`, { method: 'PATCH', body: clean(v) });
        toast.success(t.common.saved);
        qc.invalidateQueries({ queryKey: ['tenant', initial.id] });
      } else {
        const created = await api<{ id: string }>('/tenants', { method: 'POST', body: clean(v) });
        toast.success(t.common.saved);
        router.push(`/tenants/${created.id}`);
      }
      qc.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    } catch (e) {
      if (isApprovalPending(e)) return onClose();
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? t.common.edit : t.tenants.new}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button form="tenant-form" type="submit" loading={saving}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t.tenants.nameAr} *`}>
          <Input required minLength={2} value={v.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
        </Field>
        <Field label={t.tenants.nameEn}>
          <Input dir="ltr" value={v.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label={t.tenants.code}>
          <Input dir="ltr" value={v.code ?? ''} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={30} />
        </Field>
        <Field label={t.tenants.units}>
          <Input value={v.officeUnits ?? ''} onChange={(e) => set('officeUnits', e.target.value)} placeholder="903/904" />
        </Field>
        <Field label={t.common.email}>
          <Input dir="ltr" type="email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t.common.phone}>
          <Input dir="ltr" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t.tenants.cr}>
          <Input dir="ltr" value={v.crNumber ?? ''} onChange={(e) => set('crNumber', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.tenants.minSpots}>
            <Input type="number" min={1} max={100} value={v.minSpots} onChange={(e) => set('minSpots', Number(e.target.value))} />
          </Field>
          <Field label={t.common.status}>
            <Select value={v.status} onChange={(e) => set('status', e.target.value as 'ACTIVE')}>
              <option value="ACTIVE">{t.tenants.active}</option>
              <option value="INACTIVE">{t.tenants.inactive}</option>
            </Select>
          </Field>
        </div>
        <Field label={t.common.notes} className="sm:col-span-2">
          <Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {err && <p className="text-sm text-red-600 sm:col-span-2">{err}</p>}
      </form>
    </Modal>
  );
}

const EMPTY_CONTACT: Omit<Contact, 'id'> = { name: '', position: '', email: '', phone: '', whatsapp: '', isPrimary: false, receiveReminders: true };

export function ContactFormModal({ open, onClose, tenantId, initial }: { open: boolean; onClose: () => void; tenantId: string; initial?: Contact }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [v, setV] = useState<Omit<Contact, 'id'>>(initial ?? EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setV(initial ?? EMPTY_CONTACT);
  }, [open, initial]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...v, position: v.position || null, email: v.email || null, phone: v.phone || null, whatsapp: v.whatsapp || null };
      if (initial) await api(`/tenants/${tenantId}/contacts/${initial.id}`, { method: 'PATCH', body });
      else await api(`/tenants/${tenantId}/contacts`, { method: 'POST', body });
      toast.success(t.common.saved);
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      onClose();
    } catch (e) {
      if (!isApprovalPending(e)) toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t.common.edit : t.tenants.addContact}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button form="contact-form" type="submit" loading={saving}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t.common.name} *`}>
          <Input required minLength={2} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label={t.tenants.position}>
          <Input value={v.position ?? ''} onChange={(e) => setV({ ...v, position: e.target.value })} />
        </Field>
        <Field label={t.common.email}>
          <Input dir="ltr" type="email" value={v.email ?? ''} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label={t.common.phone}>
          <Input dir="ltr" value={v.phone ?? ''} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label={t.tenants.whatsapp}>
          <Input dir="ltr" value={v.whatsapp ?? ''} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label={t.tenants.primary} checked={v.isPrimary} onChange={(c) => setV({ ...v, isPrimary: c })} />
          <Checkbox label={t.tenants.reminders} checked={v.receiveReminders} onChange={(c) => setV({ ...v, receiveReminders: c })} />
        </div>
      </form>
    </Modal>
  );
}
