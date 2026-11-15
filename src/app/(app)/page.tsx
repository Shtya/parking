'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowUpRight, CalendarClock, CircleDollarSign, FileText, ParkingSquare, PieChart } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtMonth, fmtNumber, tenantName } from '@/lib/format';
import { Badge, Card, CardHeader, ErrorState, PageHeader, Progress, Skeleton, Stat, STATUS_COLOR, Table, Td, Th } from '@/components/ui';
import { useI18n } from '@/components/providers';
import type { TenantRef } from '@/lib/types';

interface Dashboard {
  currency: string;
  expiringThresholdDays: number;
  totals: {
    capacity: number; occupied: number; occupancyRate: number; vacant: number; tenants: number; activeContracts: number; expiringContracts: number; expiredContracts: number;
    needsReview: number; belowMinimum: number; annualRevenue: number; monthlyRevenue: number; revenueAtRisk: number;
  };
  byFloor: {
    code: string; nameAr: string; nameEn: string; capacity: number; AVAILABLE: number; RENTED: number; EXPIRING: number; EXPIRED: number; INACTIVE: number;
    unnumberedAllocated: number; occupancyRate: number; overbooked: number; revenue: number; vacant: number; total: number;
  }[];
  expiring: { id: string; number: string; tenant: TenantRef; endDate: string; daysLeft: number; spots: number; annualAmount: number }[];
  timeline: { month: string; contracts: number; amount: number }[];
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 120_000 });

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const floorChart = data?.byFloor.map((f) => ({
    name: f.code,
    [t.status.RENTED]: f.RENTED + f.unnumberedAllocated,
    [t.status.EXPIRING]: f.EXPIRING,
    [t.status.EXPIRED]: f.EXPIRED,
    [t.status.AVAILABLE]: f.vacant,
  }));

  return (
    <>
      <PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)
        ) : (
          <>
            <Stat label={t.dashboard.occupancy} value={`${fmtNumber(data.totals.occupancyRate, locale, 1)}%`} sub={`${fmtNumber(data.totals.occupied, locale)} / ${fmtNumber(data.totals.capacity, locale)}`} icon={<PieChart className="size-5" />} />
            <Stat label={t.dashboard.vacant} value={fmtNumber(data.totals.vacant, locale)} sub={`${fmtNumber(data.totals.tenants, locale)} ${t.dashboard.tenants}`} icon={<ParkingSquare className="size-5" />} tone="green" />
            <Stat
              label={t.dashboard.expiring}
              value={fmtNumber(data.totals.expiringContracts, locale)}
              sub={`${t.dashboard.within} ${data.expiringThresholdDays} ${t.common.days} · ${fmtNumber(data.totals.activeContracts, locale)} ${t.dashboard.activeContracts}`}
              icon={<CalendarClock className="size-5" />}
              tone="amber"
            />
            <Stat label={t.dashboard.revenue} value={fmtMoney(data.totals.annualRevenue, locale)} sub={`${fmtMoney(data.totals.monthlyRevenue, locale)} ${t.dashboard.monthly}`} icon={<CircleDollarSign className="size-5" />} tone="blue" />
          </>
        )}
      </div>

      {data && (data.totals.needsReview > 0 || data.totals.belowMinimum > 0 || data.byFloor.some((f) => f.overbooked > 0) || data.totals.expiredContracts > 0) && (
        <Card className="mt-4 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
              <span className="font-semibold">{t.dashboard.alerts}:</span>
              {data.totals.needsReview > 0 && (
                <Link href="/contracts?needsReview=true" className="hover:underline">
                  {fmtNumber(data.totals.needsReview, locale)} {t.dashboard.reviewHint}
                </Link>
              )}
              {data.totals.belowMinimum > 0 && (
                <Link href="/tenants" className="hover:underline">
                  {fmtNumber(data.totals.belowMinimum, locale)} {t.dashboard.belowMin}
                </Link>
              )}
              {data.totals.expiredContracts > 0 && (
                <Link href="/contracts?status=EXPIRED" className="hover:underline">
                  {fmtNumber(data.totals.expiredContracts, locale)} {t.contractStatus.EXPIRED}
                </Link>
              )}
              {data.byFloor
                .filter((f) => f.overbooked > 0)
                .map((f) => (
                  <Link key={f.code} href={`/floors/${f.code}`} className="hover:underline">
                    {locale === 'ar' ? f.nameAr : f.nameEn}: +{fmtNumber(f.overbooked, locale)} {t.dashboard.overbooked}
                  </Link>
                ))}
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={t.dashboard.byFloor} subtitle={`${t.dashboard.capacity}: ${fmtNumber(data?.totals.capacity, locale)}`} />
          <div className="h-72 px-2 pb-4" dir="ltr">
            {floorChart ? (
              <ResponsiveContainer>
                <BarChart data={floorChart} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey={t.status.RENTED} stackId="a" fill={STATUS_COLOR.RENTED} />
                  <Bar dataKey={t.status.EXPIRING} stackId="a" fill={STATUS_COLOR.EXPIRING} />
                  <Bar dataKey={t.status.EXPIRED} stackId="a" fill={STATUS_COLOR.EXPIRED} />
                  <Bar dataKey={t.status.AVAILABLE} stackId="a" fill={STATUS_COLOR.AVAILABLE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full" />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title={t.dashboard.byFloor}
            subtitle={t.floors.floorsOverview}
            action={
              <Link href="/floors" className="text-xs text-primary hover:underline">
                {t.common.view}
              </Link>
            }
          />
          <div className="space-y-3 px-5 pb-5">
            {data?.byFloor.map((f) => (
              <Link key={f.code} href={`/floors/${f.code}`} className="group block">
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 min-w-10 place-items-center rounded-md bg-surface-2 px-1.5 text-[11px] font-semibold">{f.code}</span>
                    <span className="truncate group-hover:text-primary">{locale === 'ar' ? f.nameAr : f.nameEn}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {fmtNumber(f.capacity - f.vacant, locale)}/{fmtNumber(f.capacity, locale)} · <b className={f.occupancyRate > 100 ? 'text-red-600' : 'text-fg'}>{fmtNumber(f.occupancyRate, locale, 1)}%</b>
                  </span>
                </div>
                <Progress value={f.occupancyRate} color={f.occupancyRate > 100 ? 'var(--st-expired)' : f.occupancyRate > 90 ? 'var(--st-expiring)' : 'var(--primary)'} />
              </Link>
            )) ?? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={t.dashboard.expiringList}
            subtitle={`${t.dashboard.within} ${data?.expiringThresholdDays ?? 60} ${t.common.days}`}
            action={
              <Link href="/contracts?expiring=60" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                {t.common.view}
                <ArrowUpRight className="size-3 rtl:-scale-x-100" />
              </Link>
            }
          />
          {data && !data.expiring.length ? (
            <p className="px-5 pb-8 pt-2 text-sm text-muted">{t.dashboard.noExpiring}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t.contracts.number}</Th>
                  <Th>{t.contracts.tenant}</Th>
                  <Th>{t.contracts.end}</Th>
                  <Th>{t.contracts.spots}</Th>
                  <Th>{t.contracts.annual}</Th>
                </tr>
              </thead>
              <tbody>
                {data?.expiring.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.number}
                      </Link>
                    </Td>
                    <Td className="max-w-64 truncate">{tenantName(c.tenant, locale)}</Td>
                    <Td>
                      <span className="whitespace-nowrap">{fmtDate(c.endDate, locale)}</span>{' '}
                      <Badge tone={c.daysLeft <= 7 ? 'red' : 'amber'}>
                        {c.daysLeft} {t.common.days}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums">{c.spots}</Td>
                    <Td className="tabular-nums whitespace-nowrap">{fmtMoney(c.annualAmount, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={t.dashboard.timeline} subtitle={`${t.dashboard.atRisk}: ${fmtMoney(data?.totals.revenueAtRisk ?? 0, locale)}`} />
          <div className="h-64 px-2 pb-4" dir="ltr">
            {data ? (
              <ResponsiveContainer>
                <BarChart data={data.timeline.map((m) => ({ ...m, label: fmtMonth(m.month, locale) }))} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={44} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                    formatter={(v, _n, p) => [`${v} · ${fmtMoney((p.payload as { amount: number }).amount, locale)}`, t.dashboard.contractsCount]}
                  />
                  <Bar dataKey="contracts" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full" />
            )}
          </div>
        </Card>
      </div>

      {data && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/contracts?needsReview=true">
            <Stat label={t.dashboard.needsReview} value={fmtNumber(data.totals.needsReview, locale)} icon={<FileText className="size-5" />} tone="amber" />
          </Link>
          <Link href="/contracts?status=EXPIRED">
            <Stat label={t.contractStatus.EXPIRED} value={fmtNumber(data.totals.expiredContracts, locale)} icon={<CalendarClock className="size-5" />} tone="red" />
          </Link>
          <Link href="/tenants">
            <Stat label={t.tenants.belowMin} value={fmtNumber(data.totals.belowMinimum, locale)} icon={<AlertTriangle className="size-5" />} tone="amber" />
          </Link>
          <Stat label={t.dashboard.atRisk} value={fmtMoney(data.totals.revenueAtRisk, locale)} icon={<CircleDollarSign className="size-5" />} tone="blue" />
        </div>
      )}
    </>
  );
}
