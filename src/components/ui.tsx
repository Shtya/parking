'use client';

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Loader2, X } from 'lucide-react';
import type { ContractStatus, SpotStatus } from '@/lib/types';
import { useI18n } from './providers';

export { cn };

// ───────── Button ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'highlight';
const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--e1)] hover:bg-[color-mix(in_oklab,var(--accent)_90%,var(--text))] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--e2)]',
  highlight:
    'bg-highlight text-highlight-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35),var(--e1)] hover:bg-[color-mix(in_oklab,var(--highlight)_92%,var(--text))] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.35),var(--e2)]',
  danger: 'bg-danger text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),var(--e1)] hover:bg-[color-mix(in_oklab,var(--danger)_88%,black)]',
  outline: 'bg-surface-raised text-fg shadow-e1 ring-1 ring-inset ring-border-strong/70 hover:bg-sunken/50 hover:ring-border-strong',
  secondary: 'bg-sunken text-fg hover:bg-border/80',
  ghost: 'text-fg/80 hover:bg-sunken hover:text-fg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean }>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-[8px] font-semibold whitespace-nowrap outline-none',
        'transition-[background-color,box-shadow,transform,color] duration-[180ms] ease-out active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
        size === 'sm' && 'h-8 px-3 text-[13px] [&_svg]:size-3.5',
        size === 'md' && 'h-10 px-4 text-[14px] [&_svg]:size-4',
        size === 'lg' && 'h-11 px-5 text-[14px] [&_svg]:size-[18px]',
        size === 'icon' && 'size-9 [&_svg]:size-[18px]',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ───────── Surfaces ─────────
/** Panel surface. elevation encodes hierarchy: 0 = inline section, 1 = list/content, 2 = floating. */
export function Card({ className, children, elevation = 1, ...p }: React.HTMLAttributes<HTMLDivElement> & { elevation?: 0 | 1 | 2 }) {
  return (
    <div
      className={cn(
        'rounded-panel bg-surface',
        elevation === 0 && 'border border-border',
        elevation === 1 && 'border border-border/70 shadow-e1',
        elevation === 2 && 'shadow-e2',
        className,
      )}
      {...p}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ───────── Page header ─────────
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] leading-[1.25] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[65ch] text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ───────── Level sign (garage colour block) ─────────
export function LevelSign({ code, size = 'md', className }: { code: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  return (
    <span
      data-level={code}
      className={cn(
        'font-sign inline-grid shrink-0 place-items-center rounded-[4px] bg-[var(--lv)] font-bold text-white',
        size === 'sm' && 'h-6 min-w-9 px-1.5 text-[12px]',
        size === 'md' && 'h-8 min-w-11 px-2 text-[15px]',
        size === 'lg' && 'h-9 min-w-12 px-2.5 text-[18px]',
        size === 'xl' && 'h-11 min-w-14 px-2.5 text-[22px]',
        className,
      )}
    >
      {code}
    </span>
  );
}

// ───────── Badges ─────────
type Tone = 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'teal' | 'gray';
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-sunken text-fg',
    green: 'bg-success-soft text-success',
    blue: 'bg-primary-soft text-accent',
    teal: 'bg-primary-soft text-accent',
    amber: 'bg-warning-soft text-warning',
    red: 'bg-danger-soft text-danger',
    gray: 'bg-sunken text-muted',
  };
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export const STATUS_COLOR: Record<SpotStatus, string> = {
  AVAILABLE: 'var(--st-available)',
  RENTED: 'var(--st-rented)',
  EXPIRING: 'var(--st-expiring)',
  EXPIRED: 'var(--st-expired)',
  INACTIVE: 'var(--st-inactive)',
};

/** SVG pattern defs for spot statuses — shared by the map and the swatches (status is never colour-only). */
export function StatusPatternDefs({ prefix = 'st' }: { prefix?: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-EXPIRING`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="var(--st-expiring)" fillOpacity="0.28" />
        <rect width="3.2" height="8" fill="var(--st-expiring)" />
      </pattern>
      <pattern id={`${prefix}-EXPIRED`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="var(--st-expired)" fillOpacity="0.22" />
        <path d="M0 0L8 8M8 0L0 8" stroke="var(--st-expired)" strokeWidth="1.8" />
      </pattern>
      <pattern id={`${prefix}-INACTIVE`} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="var(--st-inactive)" fillOpacity="0.15" />
        <circle cx="3" cy="3" r="1.3" fill="var(--st-inactive)" />
      </pattern>
    </defs>
  );
}

export function statusFill(s: SpotStatus, prefix = 'st') {
  if (s === 'RENTED') return 'var(--st-rented)';
  if (s === 'AVAILABLE') return 'var(--st-available)';
  return `url(#${prefix}-${s})`;
}

export function StatusSwatch({ status, size = 14 }: { status: SpotStatus; size?: number }) {
  const p = `sw${status}`;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <StatusPatternDefs prefix={p} />
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="2"
        fill={status === 'AVAILABLE' ? 'var(--st-available)' : statusFill(status, p)}
        fillOpacity={status === 'AVAILABLE' ? 0.15 : 1}
        stroke={STATUS_COLOR[status]}
        strokeWidth={status === 'AVAILABLE' ? 2 : 1}
      />
    </svg>
  );
}

export function StatusBadge({ status }: { status: SpotStatus }) {
  const { t } = useI18n();
  const tone = { AVAILABLE: 'green', RENTED: 'blue', EXPIRING: 'amber', EXPIRED: 'red', INACTIVE: 'gray' } as const;
  return (
    <Badge tone={tone[status]}>
      <StatusSwatch status={status} size={12} />
      {t.status[status]}
    </Badge>
  );
}

export function ContractStatusBadge({ status, daysLeft, threshold = 60 }: { status: ContractStatus; daysLeft?: number; threshold?: number }) {
  const { t } = useI18n();
  if (status === 'ACTIVE' && daysLeft !== undefined && daysLeft <= threshold) return <Badge tone="amber">{t.status.EXPIRING}</Badge>;
  const tone = { DRAFT: 'gray', ACTIVE: 'green', RENEWED: 'blue', EXPIRED: 'red', TERMINATED: 'gray' } as const;
  return <Badge tone={tone[status]}>{t.contractStatus[status]}</Badge>;
}

// ───────── Form controls (custom, RTL-aware) ─────────
export { Input, Textarea, Select, Field, Checkbox, DateInput, SearchInput } from './fields';

// ───────── Modal ─────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        'dlg m-auto w-[calc(100%-2rem)] rounded-sheet bg-surface p-0 text-fg shadow-e4 backdrop:bg-[rgb(var(--shadow-tint)/0.45)] backdrop:backdrop-blur-[3px]',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
        size === 'xl' && 'max-w-4xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 className="text-lg font-extrabold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t.common.close}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="overflow-y-auto px-6 pb-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border bg-sunken/40 px-6 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ───────── Table ─────────
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn('sticky top-0 z-[1] border-b border-border bg-surface px-4 py-3 text-start text-[12px] font-bold whitespace-nowrap text-muted', className)}>
    {children}
  </th>
);
export const Td = ({ children, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border/60 px-4 py-3 align-middle', className)} {...p}>
    {children}
  </td>
);

// ───────── States ─────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-panel bg-sunken', className)} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-panel bg-sunken text-muted">{icon}</div>}
      <p className="font-bold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t.common.error}
      hint={(error as Error)?.message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t.common.refresh}
          </Button>
        )
      }
    />
  );
}

// ───────── Stat (compact metric row item) ─────────
export function Stat({ label, value, sub, icon, tone = 'teal' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'teal' | 'amber' | 'blue' | 'red' | 'green' }) {
  const tones = { teal: 'text-accent', blue: 'text-accent', amber: 'text-warning', red: 'text-danger', green: 'text-success' };
  return (
    <div className="lit rounded-panel border border-border/70 bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        {icon && <span className={tones[tone]}>{icon}</span>}
        {label}
      </div>
      <p className="font-sign mt-1 text-[22px] leading-tight font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function Progress({ value, color = 'var(--accent)', label }: { value: number; color?: string; label?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-[450ms] ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}
