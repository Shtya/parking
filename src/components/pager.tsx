'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import { useI18n } from './providers';
import { fmtNumber } from '@/lib/format';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t, locale } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted">
      <span>
        {fmtNumber(total, locale)} · {t.common.page} {fmtNumber(page, locale)} {t.common.of} {fmtNumber(pages, locale)}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t.common.previous}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t.common.next}>
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
