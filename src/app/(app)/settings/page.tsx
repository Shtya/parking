'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { Channel, Role, Settings, SpotType, User } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Modal, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { useCan, useI18n, useMe } from '@/components/providers';

interface Rule {
  id: string;
  daysBefore: number;
  channels: Channel[];
  notifyOwner: boolean;
  notifyTenant: boolean;
  isActive: boolean;
}
const CHANNELS: Channel[] = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS'];
const TYPES: SpotType[] = ['STANDARD', 'VIP', 'SHADED', 'OUTSIDE'];
const ROLES: Role[] = ['ADMIN', 'OWNER', 'STAFF'];

function GeneralSettings() {
  const { t } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [v, setV] = useState<Settings | null>(null);
  const [emails, setEmails] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) {
      setV(data);
      setEmails(data.ownerEmails.join(', '));
    }
  }, [data]);
  if (!v) return null;
  const editable = can('ADMIN', 'OWNER');
  const save = async () => {
    setSaving(true);
    try {
      await api('/settings', { method: 'PATCH', body: { ...v, ownerEmails: emails.split(',').map((e) => e.trim()).filter(Boolean) } });
      toast.success(t.common.saved);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title={t.settings.general}
        action={
          editable && (
            <Button size="sm" loading={saving} onClick={save}>
              {t.common.save}
            </Button>
          )
        }
      />
      <fieldset disabled={!editable} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label={`${t.settings.building} (AR)`}>
          <Input value={v.buildingName.ar} onChange={(e) => setV({ ...v, buildingName: { ...v.buildingName, ar: e.target.value } })} />
        </Field>
        <Field label={`${t.settings.building} (EN)`}>
          <Input dir="ltr" value={v.buildingName.en} onChange={(e) => setV({ ...v, buildingName: { ...v.buildingName, en: e.target.value } })} />
        </Field>
        <Field label={t.settings.threshold}>
          <Input type="number" min={1} max={365} value={v.expiringThresholdDays} onChange={(e) => setV({ ...v, expiringThresholdDays: Number(e.target.value) })} />
        </Field>
        <Field label={t.settings.minSpots}>
          <Input type="number" min={1} value={v.minSpotsPerTenant} onChange={(e) => setV({ ...v, minSpotsPerTenant: Number(e.target.value) })} />
        </Field>
        <Field label={t.settings.prefix}>
          <Input dir="ltr" value={v.contractNumberPrefix} onChange={(e) => setV({ ...v, contractNumberPrefix: e.target.value })} />
        </Field>
        <Field label={t.settings.ownerEmails}>
          <Input dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="owner@company.com" />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-medium text-muted">
            {t.settings.pricing} ({v.currency})
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TYPES.map((k) => (
              <Field key={k} label={t.spotType[k]}>
                <Input type="number" min={0} value={v.pricing[k]} onChange={(e) => setV({ ...v, pricing: { ...v.pricing, [k]: Number(e.target.value) } })} />
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
    </Card>
  );
}

function Rules() {
  const { t } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['rules'], queryFn: () => api<Rule[]>('/notifications/rules') });
  const editable = can('ADMIN', 'OWNER');
  const update = async (r: Rule, patch: Partial<Rule>) => {
    try {
      await api(`/notifications/rules/${r.id}`, { method: 'PATCH', body: patch });
      qc.invalidateQueries({ queryKey: ['rules'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const add = async () => {
    const d = Number(prompt(t.settings.daysBefore, '14'));
    if (!d) return;
    try {
      await api('/notifications/rules', { method: 'POST', body: { daysBefore: d, channels: ['IN_APP', 'EMAIL'] } });
      qc.invalidateQueries({ queryKey: ['rules'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async (r: Rule) => {
    if (!confirm(`${t.common.delete} ${r.daysBefore}?`)) return;
    await api(`/notifications/rules/${r.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['rules'] });
  };
  return (
    <Card>
      <CardHeader
        title={t.settings.rules}
        action={
          editable && (
            <Button size="sm" variant="outline" onClick={add}>
              <Plus className="size-3.5" />
              {t.settings.addRule}
            </Button>
          )
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>{t.settings.daysBefore}</Th>
            <Th>{t.settings.channels}</Th>
            <Th>{t.settings.notifyOwner}</Th>
            <Th>{t.settings.notifyTenant}</Th>
            <Th>{t.settings.active}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r.id}>
              <Td className="font-semibold">{r.daysBefore}</Td>
              <Td>
                <div className="flex flex-wrap gap-3">
                  {CHANNELS.map((c) => (
                    <Checkbox
                      key={c}
                      label={c}
                      disabled={!editable}
                      checked={r.channels.includes(c)}
                      onChange={(on) => {
                        const next = on ? [...r.channels, c] : r.channels.filter((x) => x !== c);
                        if (next.length) update(r, { channels: next });
                      }}
                    />
                  ))}
                </div>
              </Td>
              <Td>
                <Checkbox label="" disabled={!editable} checked={r.notifyOwner} onChange={(v) => update(r, { notifyOwner: v })} />
              </Td>
              <Td>
                <Checkbox label="" disabled={!editable} checked={r.notifyTenant} onChange={(v) => update(r, { notifyTenant: v })} />
              </Td>
              <Td>
                <Checkbox label="" disabled={!editable} checked={r.isActive} onChange={(v) => update(r, { isActive: v })} />
              </Td>
              <Td>
                {editable && (
                  <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Users() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users') });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', email: '', role: 'STAFF' as Role, password: '' });
  const create = async () => {
    try {
      await api('/users', { method: 'POST', body: { ...v, locale } });
      toast.success(t.common.saved);
      setOpen(false);
      setV({ name: '', email: '', role: 'STAFF', password: '' });
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const patch = async (u: User, body: Record<string, unknown>) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader
        title={t.settings.users}
        action={
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            {t.settings.addUser}
          </Button>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>{t.common.name}</Th>
            <Th>{t.common.email}</Th>
            <Th>{t.settings.role}</Th>
            <Th>{t.settings.active}</Th>
            <Th>{t.settings.lastLogin}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {data?.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">
                {u.name}
                {u.id === me?.id && (
                  <Badge tone="teal" className="ms-2">
                    you
                  </Badge>
                )}
              </Td>
              <Td className="text-xs" dir="ltr">
                {u.email}
              </Td>
              <Td>
                <Select value={u.role} disabled={u.id === me?.id} onChange={(e) => patch(u, { role: e.target.value })} className="h-8 w-36 text-xs">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t.role[r]}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                <Checkbox label="" disabled={u.id === me?.id} checked={Boolean(u.isActive)} onChange={(c) => patch(u, { isActive: c })} />
              </Td>
              <Td className="text-xs text-muted">{fmtDateTime(u.lastLoginAt, locale)}</Td>
              <Td>
                {u.id !== me?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const p = prompt(t.settings.newPassword);
                      if (p && p.length >= 8) patch(u, { password: p }).then(() => toast.success(t.common.saved));
                    }}
                  >
                    {t.settings.changePassword}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.settings.addUser}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={create} disabled={!v.name || !v.email || v.password.length < 8}>
              {t.common.create}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.name}>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label={t.common.email}>
            <Input dir="ltr" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label={t.settings.role}>
            <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.role[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.password} hint="≥ 8">
            <Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function Profile() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rem, setRem] = useState(true);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone ?? '');
      setRem(me.receiveReminders);
    }
  }, [me]);
  const save = async () => {
    try {
      await api('/auth/me', { method: 'PATCH', body: { name, phone: phone || null, receiveReminders: rem, ...(pw.newPassword ? pw : {}) } });
      toast.success(t.common.saved);
      setPw({ currentPassword: '', newPassword: '' });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader
        title={t.settings.myProfile}
        action={
          <Button size="sm" onClick={save}>
            {t.common.save}
          </Button>
        }
      />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.common.phone}>
          <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t.settings.currentPassword}>
          <Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        </Field>
        <Field label={t.settings.newPassword}>
          <Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        </Field>
        <Checkbox label={t.tenants.reminders} checked={rem} onChange={setRem} />
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const can = useCan();
  return (
    <>
      <PageHeader
        title={t.settings.title}
        subtitle={t.settings.subtitle}
        actions={
          <a href="/api/docs" target="_blank" rel="noreferrer">
            <Button variant="outline">
              <BookOpen className="size-4" />
              {t.settings.apiDocs}
            </Button>
          </a>
        }
      />
      <div className="space-y-4">
        <GeneralSettings />
        <Rules />
        {can('ADMIN') && <Users />}
        <Profile />
      </div>
    </>
  );
}
