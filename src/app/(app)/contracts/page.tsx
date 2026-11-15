'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtNumber, tenantName } from '@/lib/format';
import type { Contract, ContractStatus, Paged } from '@/lib/types';
import { Badge, Button, Card, ContractStatusBadge, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Table, Td, Th } from '@/components/ui';
import { useI18n } from '@/components/providers';
import { Pager } from '@/components/pager';

const STATUSES: ContractStatus[] = ['ACTIVE', 'DRAFT', 'EXPIRED', 'RENEWED', 'TERMINATED'];

function ContractsList() {
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [expiring, setExpiring] = useState(sp.get('expiring') ?? '');
  const [review, setReview] = useState(sp.get('needsReview') ?? '');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contracts', q, status, expiring, review, page],
    queryFn: () => api<Paged<Contract>>('/contracts', { query: { q, status, expiringWithinDays: expiring, needsReview: review, page, pageSize: 25 } }),
    placeholderData: (p) => p,
  });
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader
        title={t.contracts.title}
        subtitle={t.contracts.subtitle}
        actions={
          <Link href="/contracts/new">
            <Button>
              <Plus className="size-4" />
              {t.contracts.new}
            </Button>
          </Link>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
              placeholder={t.common.search}
              className="ps-9"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reset();
            }}
            className="w-40"
          >
            <option value="">
              {t.common.status}: {t.common.all}
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.contractStatus[s]}
              </option>
            ))}
          </Select>
          <Select
            value={expiring}
            onChange={(e) => {
              setExpiring(e.target.value);
              reset();
            }}
            className="w-48"
          >
            <option value="">{t.contracts.expiringFilter} —</option>
            {[7, 30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {t.contracts.expiringFilter} {d} {t.common.days}
              </option>
            ))}
          </Select>
          <Select
            value={review}
            onChange={(e) => {
              setReview(e.target.value);
              reset();
            }}
            className="w-44"
          >
            <option value="">
              {t.contracts.needsReview}: {t.common.all}
            </option>
            <option value="true">{t.contracts.needsReview}</option>
            <option value="false">✓</option>
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
          <EmptyState icon={<FileText className="size-5" />} title={t.common.noData} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t.contracts.number}</Th>
                  <Th>{t.contracts.tenant}</Th>
                  <Th>{t.common.status}</Th>
                  <Th>{t.contracts.start}</Th>
                  <Th>{t.contracts.end}</Th>
                  <Th>{t.contracts.spots}</Th>
                  <Th>{t.contracts.annual}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.number}
                      </Link>
                      {c.needsReview && (
                        <Badge tone="amber" className="ms-2">
                          {t.contracts.needsReview}
                        </Badge>
                      )}
                    </Td>
                    <Td className="max-w-72 truncate">
                      <Link href={`/tenants/${c.tenant.id}`} className="hover:text-primary">
                        {tenantName(c.tenant, locale)}
                      </Link>
                    </Td>
                    <Td>
                      <ContractStatusBadge status={c.status} daysLeft={c.daysLeft} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(c.startDate, locale)}</Td>
                    <Td className="whitespace-nowrap">
                      {fmtDate(c.endDate, locale)}
                      {c.status === 'ACTIVE' && (
                        <p className={c.daysLeft <= 30 ? 'text-xs text-red-600' : 'text-xs text-muted'}>
                          {fmtNumber(c.daysLeft, locale)} {t.common.days}
                        </p>
                      )}
                    </Td>
                    <Td className="tabular-nums">{fmtNumber(c.spotCount, locale)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{fmtMoney(c.annualAmount, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function ContractsPage() {
  return (
    <Suspense>
      <ContractsList />
    </Suspense>
  );
}
