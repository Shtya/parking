'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import type { Delivery } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, cn } from '@/components/ui';
import { useCan, useI18n } from '@/components/providers';

interface N {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  type: string;
}

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const list = useQuery({ queryKey: ['notifications', 'page'], queryFn: () => api<{ items: N[]; unread: number }>('/notifications', { query: { take: 200 } }) });
  const deliveries = useQuery({ queryKey: ['deliveries'], enabled: can('ADMIN', 'OWNER'), queryFn: () => api<Delivery[]>('/notifications/deliveries', { query: { take: 100 } }) });

  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const run = async () => {
    setRunning(true);
    try {
      const r = await api<{ expired: number; contractsChecked: number; deliveries: Record<string, number> }>('/notifications/run', { method: 'POST', body: {} });
      toast.success(`${t.notifications.ran}: ${r.contractsChecked} · ${JSON.stringify(r.deliveries)}`);
      ['notifications', 'deliveries', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t.notifications.title}
        subtitle={t.notifications.subtitle}
        actions={
          <>
            {!!list.data?.unread && (
              <Button variant="outline" onClick={readAll}>
                <CheckCheck className="size-4" />
                {t.notifications.markAll}
              </Button>
            )}
            {can('ADMIN', 'OWNER') && (
              <Button onClick={run} loading={running}>
                <Play className="size-4" />
                {t.notifications.runNow}
              </Button>
            )}
          </>
        }
      />
      <Card>
        {!list.data?.items.length ? (
          <EmptyState icon={<Bell className="size-5" />} title={t.notifications.empty} />
        ) : (
          <div className="divide-y divide-border/70">
            {Object.entries(
              list.data.items.reduce<Record<string, N[]>>((acc, it) => {
                const k = it.createdAt.slice(0, 10);
                (acc[k] ??= []).push(it);
                return acc;
              }, {}),
            ).map(([day, items]) => (
              <section key={day} aria-label={fmtDate(day, locale)}>
                <h2 className="sticky top-14 z-[1] bg-surface/95 px-5 pt-4 pb-2 text-[13px] font-bold text-muted backdrop-blur">{fmtDate(day, locale)}</h2>
                <ul>
                  {items.map((n) => (
                    <li key={n.id} className={cn('flex items-start gap-3 px-5 py-3.5', !n.readAt && 'bg-primary-soft/40')}>
                      <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-border-strong' : n.type === 'CONTRACT_EXPIRED' ? 'bg-danger' : 'bg-highlight')} />
                      <div className="min-w-0 flex-1">
                        <Link href={n.link ?? '#'} onClick={() => !n.readAt && api(`/notifications/${n.id}/read`, { method: 'POST', body: {} })} className="font-bold hover:text-accent">
                          {n.title}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                      </div>
                      <span className="font-sign shrink-0 text-[12px] text-muted">{new Date(n.createdAt).toLocaleTimeString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {can('ADMIN', 'OWNER') && (
        <Card className="mt-6">
          <CardHeader title={t.notifications.deliveries} />
          <Table>
            <thead>
              <tr>
                <Th>{t.common.date}</Th>
                <Th>{t.contracts.number}</Th>
                <Th>{t.notifications.channel}</Th>
                <Th>{t.notifications.recipient}</Th>
                <Th>{t.common.status}</Th>
              </tr>
            </thead>
            <tbody>
              {deliveries.data?.map((d) => (
                <tr key={d.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(d.createdAt, locale)}</Td>
                  <Td className="text-xs">
                    {d.contract?.number}
                    <p className="max-w-56 truncate text-muted">{d.contract?.tenant.nameAr}</p>
                  </Td>
                  <Td>
                    <Badge>{d.channel}</Badge> {d.daysBefore !== null && <span className="text-xs text-muted">{d.daysBefore}d</span>}
                  </Td>
                  <Td className="text-xs" dir="ltr">
                    {d.recipientType} · {d.channel === 'IN_APP' ? 'in-app' : d.recipient}
                  </Td>
                  <Td>
                    <Badge tone={d.status === 'SENT' ? 'green' : d.status === 'FAILED' ? 'red' : 'gray'}>{d.status}</Badge>
                    {d.error && <p className="text-[11px] text-muted">{d.error}</p>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
