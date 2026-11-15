'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtNumber, tenantName } from '@/lib/format';
import type { Paged, TenantListItem } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Table, Td, Th } from '@/components/ui';
import { useI18n } from '@/components/providers';
import { TenantFormModal } from '@/components/tenant-form';
import { Pager } from '@/components/pager';

export default function TenantsPage() {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tenants', q, status, page],
    queryFn: () => api<Paged<TenantListItem>>('/tenants', { query: { q, status, page, pageSize: 25 } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title={t.tenants.title}
        subtitle={t.tenants.subtitle}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t.tenants.new}
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <Input icon={<Search />}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t.common.search}
              className="min-w-56 flex-1"
            />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">{t.common.all}</option>
            <option value="ACTIVE">{t.tenants.active}</option>
            <option value="INACTIVE">{t.tenants.inactive}</option>
          </Select>
        </div>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Users className="size-5" />} title={t.common.noData} />
        ) : (
          <>
            {/* mobile: re-composed as name → spots → expiry */}
            <ul className="divide-y divide-border/70 md:hidden">
              {data.items.map((x) => (
                <li key={x.id}>
                  <Link href={`/tenants/${x.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{tenantName(x, locale)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                        {x.code && <span className="font-sign font-bold text-accent">{x.code}</span>}
                        {x.nextExpiry && <span>{fmtDate(x.nextExpiry, locale)}</span>}
                        {x.belowMinimum && <Badge tone="amber">{t.tenants.belowMin}</Badge>}
                      </span>
                    </span>
                    <span className="font-sign text-[1.5rem] leading-none font-bold">{fmtNumber(x.spotCount, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Table className="hidden md:block">
              <thead>
                <tr>
                  <Th>{t.common.name}</Th>
                  <Th>{t.tenants.code}</Th>
                  <Th>{t.tenants.units}</Th>
                  <Th>{t.tenants.spots}</Th>
                  <Th>{t.tenants.contacts}</Th>
                  <Th>{t.tenants.nextExpiry}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/tenants/${x.id}`} className="font-medium hover:text-primary">
                        {tenantName(x, locale)}
                      </Link>
                      {locale === 'ar' && x.nameEn && x.nameEn !== x.nameAr && (
                        <p className="text-xs text-muted" dir="ltr">
                          {x.nameEn}
                        </p>
                      )}
                    </Td>
                    <Td>{x.code ? <span className="font-sign font-bold text-accent">{x.code}</span> : '—'}</Td>
                    <Td className="max-w-40 truncate text-xs text-muted" title={x.officeUnits ?? ''}>
                      {x.officeUnits ?? '—'}
                    </Td>
                    <Td>
                      <span className="font-sign text-[17px] font-bold">{fmtNumber(x.spotCount, locale)}</span>
                      {x.unnumberedSpots > 0 && (
                        <span className="ms-1 text-xs text-muted">
                          ({fmtNumber(x.numberedSpots, locale)} + {fmtNumber(x.unnumberedSpots, locale)})
                        </span>
                      )}
                      {x.belowMinimum && (
                        <Badge tone="amber" className="ms-2">
                          <AlertTriangle className="size-3" />
                          {t.tenants.belowMin}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {x.primaryContact ? (
                        <>
                          {x.primaryContact.name}
                          <p className="text-muted" dir="ltr">
                            {x.primaryContact.phone ?? x.primaryContact.email}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {x.nextExpiry ? (
                        <>
                          {fmtDate(x.nextExpiry, locale)}{' '}
                          {x.daysToExpiry !== null && x.daysToExpiry <= 60 && (
                            <Badge tone={x.daysToExpiry <= 7 ? 'red' : 'amber'}>
                              {x.daysToExpiry} {t.common.days}
                            </Badge>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {x.needsReview && <Badge tone="amber">{t.contracts.needsReview}</Badge>}
                      {x.status === 'INACTIVE' && <Badge tone="gray">{t.tenants.inactive}</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <TenantFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
