'use client';

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import type { ContractStatus, SpotStatus } from '@/lib/types';
import { useI18n } from './providers';

export const cn = clsx;

// ───────── Button ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90 shadow-sm',
  secondary: 'bg-surface-2 text-fg hover:bg-border/60',
  outline: 'border border-border bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon'; loading?: boolean }>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'icon' && 'size-9',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ───────── Card ─────────
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ───────── Page header ─────────
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────── Badges ─────────
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'teal' | 'gray'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg',
    green: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    blue: 'bg-blue-500/12 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    red: 'bg-red-500/12 text-red-700 dark:text-red-300',
    teal: 'bg-primary-soft text-primary',
    gray: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export const STATUS_COLOR: Record<SpotStatus, string> = {
  AVAILABLE: 'var(--st-available)',
  RENTED: 'var(--st-rented)',
  EXPIRING: 'var(--st-expiring)',
  EXPIRED: 'var(--st-expired)',
  INACTIVE: 'var(--st-inactive)',
};

export function StatusBadge({ status }: { status: SpotStatus }) {
  const { t } = useI18n();
  const tone = { AVAILABLE: 'green', RENTED: 'blue', EXPIRING: 'amber', EXPIRED: 'red', INACTIVE: 'gray' } as const;
  return (
    <Badge tone={tone[status]}>
      <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {t.status[status]}
    </Badge>
  );
}

export function ContractStatusBadge({ status, daysLeft, threshold = 60 }: { status: ContractStatus; daysLeft?: number; threshold?: number }) {
  const { t } = useI18n();
  if (status === 'ACTIVE' && daysLeft !== undefined && daysLeft <= threshold) return <Badge tone="amber">{t.status.EXPIRING}</Badge>;
  const tone = { DRAFT: 'gray', ACTIVE: 'green', RENEWED: 'teal', EXPIRED: 'red', TERMINATED: 'gray' } as const;
  return <Badge tone={tone[status]}>{t.contractStatus[status]}</Badge>;
}

// ───────── Form controls ─────────
const field = 'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, className)} {...p} />);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'h-auto min-h-20 py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'pe-8', className)} {...p}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <input type="checkbox" className="size-4 rounded accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ───────── Modal ─────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);
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
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-[2px]',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
        size === 'xl' && 'max-w-4xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="close">
              <X className="size-4" />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ───────── Table ─────────
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn('border-b border-border bg-surface-2/60 px-4 py-2.5 text-start text-xs font-medium whitespace-nowrap text-muted', className)}>{children}</th>
);
export const Td = ({ children, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border/70 px-4 py-3 align-middle', className)} {...p}>
    {children}
  </td>
);

// ───────── States ─────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
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

// ───────── Stat ─────────
export function Stat({ label, value, sub, icon, tone = 'teal' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'teal' | 'amber' | 'blue' | 'red' | 'green' }) {
  const tones = {
    teal: 'bg-primary-soft text-primary',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
    blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-300',
    red: 'bg-red-500/12 text-red-600 dark:text-red-300',
    green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        {icon && <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function Progress({ value, color = 'var(--primary)' }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}
