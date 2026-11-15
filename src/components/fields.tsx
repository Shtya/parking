'use client';

import {
  Children, forwardRef, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type InputHTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { D, EASE_OUT } from '@/lib/motion';
import { useI18n } from './providers';

/* ═══════════════════════════ shared field skin ═══════════════════════════ */

const skin =
  'w-full rounded-[8px] bg-surface-raised text-[14px] text-fg ring-1 ring-inset ring-border-strong/70 ' +
  'transition-[box-shadow,background-color] duration-[180ms] ease-out ' +
  'hover:ring-border-strong ' +
  'focus-within:ring-2 focus-within:ring-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_14%,transparent)] ' +
  'aria-[invalid=true]:ring-danger data-[disabled=true]:bg-sunken data-[disabled=true]:opacity-60';

/** Compat event so call sites written for native inputs (`e.target.value`) keep working. */
type ChangeLike = { target: { value: string } };
const changeEvent = (value: string) => ({ target: { value } }) as ChangeLike;

/* ═══════════════════════════ Input ═══════════════════════════ */

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** leading icon — always on the input's own reading side (works for dir="ltr" fields inside RTL pages) */
  icon?: ReactNode;
  /** trailing slot (unit, button) */
  end?: ReactNode;
  wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, icon, end, wrapperClassName, dir, disabled, type, ...p }, ref) => (
  <div dir={dir} data-disabled={disabled || undefined} aria-invalid={p['aria-invalid']} className={cn(skin, 'relative flex h-10 items-center', wrapperClassName, className?.match(/\b(w-\S+|min-w-\S+|max-w-\S+|flex-1|h-\S+)/g)?.join(' '))}>
    {icon && <span className="pointer-events-none flex shrink-0 ps-3 text-muted [&_svg]:size-4">{icon}</span>}
    <input
      ref={ref}
      dir={dir}
      type={type}
      disabled={disabled}
      className={cn(
        'h-full w-full min-w-0 rounded-[8px] bg-transparent px-3 outline-none placeholder:text-muted/80 disabled:cursor-not-allowed',
        icon && 'ps-2.5',
        end && 'pe-1',
        type === 'number' && 'font-sign text-[15px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className?.replace(/\b(w-\S+|min-w-\S+|max-w-\S+|flex-1|h-\S+)/g, ''),
      )}
      {...p}
    />
    {end && <span className="flex shrink-0 items-center pe-2 text-[13px] text-muted">{end}</span>}
  </div>
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea
    ref={ref}
    className={cn(skin, 'block min-h-24 resize-y px-3 py-2.5 leading-relaxed outline-none placeholder:text-muted/80 focus:ring-2 focus:ring-accent', className)}
    {...p}
  />
));
Textarea.displayName = 'Textarea';

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block text-[13px] font-semibold text-fg/85">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-[12px] font-medium text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* ═══════════════════════════ Popover (portal, flips, follows the anchor) ═══════════════════════════ */

function usePopoverPosition(anchor: React.RefObject<HTMLElement | null>, open: boolean, width?: number, maxHeight = 320) {
  const { dir } = useI18n();
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; up: boolean } | null>(null);
  const update = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(width ?? r.width, r.width);
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(maxHeight, 240) + 12 && r.top > below;
    let left = dir === 'rtl' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos(up ? { bottom: window.innerHeight - r.top + 6, left, width: w, up } : { top: r.bottom + 6, left, width: w, up });
  }, [anchor, width, maxHeight, dir]);
  useLayoutEffect(() => {
    if (!open) return;
    update();
    const on = () => update();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  }, [open, update]);
  return pos;
}

function Popover({
  anchor, open, onClose, children, width, maxHeight = 320, id, role,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  maxHeight?: number;
  id?: string;
  role?: string;
}) {
  const pos = usePopoverPosition(anchor, open, width, maxHeight);
  const panel = useRef<HTMLDivElement>(null);
  // render inside an open <dialog> (top layer) when the anchor lives in one, otherwise in <body>
  const host = typeof document !== 'undefined' ? ((anchor.current?.closest('dialog[open]') as HTMLElement | null) ?? document.body) : null;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open, onClose, anchor]);
  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={panel}
          id={id}
          role={role}
          initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
          transition={{ duration: D.micro, ease: EASE_OUT }}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, transformOrigin: pos.up ? 'bottom' : 'top' }}
          className="z-[70] overflow-hidden rounded-[10px] bg-surface-raised shadow-e3 ring-1 ring-border"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  );
}

/* ═══════════════════════════ Select (custom listbox) ═══════════════════════════ */

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
}

const textOf = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : '';

export interface SelectProps {
  value: string;
  /** native-compatible: receives { target: { value } } */
  onChange?: (e: ChangeLike) => void;
  onValueChange?: (v: string) => void;
  /** <option value=…>label</option> children — same markup as a native select */
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** show a search box (defaults to on when there are more than 8 options) */
  searchable?: boolean;
  'aria-label'?: string;
  id?: string;
}

export function Select({ value, onChange, onValueChange, children, className, disabled, placeholder, searchable, id, ...aria }: SelectProps) {
  const { t, dir } = useI18n();
  const uid = useId();
  const listId = `${uid}-list`;
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const options: Opt[] = useMemo(
    () =>
      Children.toArray(children)
        .filter((c): c is ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }> => isValidElement(c) && c.type === 'option')
        .map((c) => ({ value: String(c.props.value ?? ''), label: c.props.children, text: textOf(c.props.children), disabled: c.props.disabled })),
    [children],
  );
  const showSearch = searchable ?? options.length > 8;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.text.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const current = options.find((o) => o.value === value);
  const isPlaceholder = !current || (current.value === '' && !!placeholder);

  const close = useCallback((focus = true) => {
    setOpen(false);
    setQuery('');
    if (focus) btn.current?.focus();
  }, []);
  const choose = (o: Opt) => {
    if (o.disabled) return;
    onChange?.(changeEvent(o.value));
    onValueChange?.(o.value);
    close();
  };
  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    let tries = 0;
    const focus = () => {
      const target = showSearch ? search.current : listRef.current;
      if (!target) return void (tries++ < 10 && window.setTimeout(focus, 16));
      target.focus();
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    };
    focus();
  }, [open, showSearch]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  useEffect(() => setActive(0), [query]);

  const typeahead = useRef({ s: '', t: 0 });
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (!showSearch && e.key.length === 1) {
      const now = Date.now();
      typeahead.current.s = (now - typeahead.current.t < 600 ? typeahead.current.s : '') + e.key.toLowerCase();
      typeahead.current.t = now;
      const i = filtered.findIndex((o) => o.text.toLowerCase().startsWith(typeahead.current.s));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={aria['aria-label']}
        disabled={disabled}
        data-disabled={disabled || undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
        className={cn(
          skin,
          'flex h-10 cursor-pointer items-center justify-between gap-2 px-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed',
          open && 'ring-2 ring-accent',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', isPlaceholder && 'text-muted')}>{current?.label ?? placeholder ?? t.common.select}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-[180ms] ease-out', open && 'rotate-180 text-accent')} aria-hidden />
      </button>
      <Popover anchor={btn} open={open} onClose={() => close(false)} width={Math.max(200, btn.current?.offsetWidth ?? 0)}>
        <div dir={dir}>
          {showSearch && (
            <div className="border-b border-border p-2">
              <div className="flex h-9 items-center gap-2 rounded-[6px] bg-sunken/70 px-2.5 focus-within:ring-2 focus-within:ring-accent">
                <Search className="size-4 shrink-0 text-muted" aria-hidden />
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onListKey}
                  placeholder={t.common.search}
                  aria-label={t.common.search}
                  aria-controls={listId}
                  aria-activedescendant={filtered[active] ? `${uid}-o${active}` : undefined}
                  className="h-full w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-muted/80"
                />
              </div>
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={aria['aria-label']}
            aria-activedescendant={filtered[active] ? `${uid}-o${active}` : undefined}
            onKeyDown={onListKey}
            className="max-h-72 overflow-y-auto p-1 outline-none scrollbar-thin"
          >
            {!filtered.length && <li className="px-3 py-6 text-center text-[13px] text-muted">{t.common.noResults}</li>}
            {filtered.map((o, i) => {
              const sel = o.value === value;
              return (
                <li
                  key={o.value + i}
                  id={`${uid}-o${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={sel}
                  aria-disabled={o.disabled || undefined}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[6px] px-2.5 py-2 text-[14px] transition-colors duration-[120ms]',
                    i === active && 'bg-sunken',
                    sel && 'font-bold text-accent',
                    o.disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <Check className={cn('size-4 shrink-0', sel ? 'opacity-100' : 'opacity-0')} aria-hidden />
                </li>
              );
            })}
          </ul>
        </div>
      </Popover>
    </>
  );
}

/* ═══════════════════════════ DateInput (calendar popover) ═══════════════════════════ */

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const addDaysUtc = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export interface DateInputProps {
  value: string;
  onChange?: (e: ChangeLike) => void;
  onValueChange?: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function DateInput({ value, onChange, onValueChange, min, max, disabled, placeholder, className, ...aria }: DateInputProps) {
  const { t, locale, dir } = useI18n();
  const btn = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const todayIso = toIso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const [cursor, setCursor] = useState<Date>(() => selected ?? fromIso(todayIso)!);
  const intl = locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  const weekStart = locale === 'ar' ? 0 : 1; // Sunday in Saudi, Monday otherwise
  const minD = fromIso(min);
  const maxD = fromIso(max);

  useEffect(() => {
    if (open) setCursor(selected ?? fromIso(todayIso)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // the panel mounts a frame after `open` flips (portal + measured position) — retry briefly
    let tries = 0;
    const focus = () => {
      const el = grid.current?.querySelector('[data-cursor="true"]') as HTMLElement | null;
      if (el) el.focus();
      else if (tries++ < 10) window.setTimeout(focus, 16);
    };
    focus();
  }, [open, cursor]);

  const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const offset = (monthStart.getUTCDay() - weekStart + 7) % 7;
  const gridStart = addDaysUtc(monthStart, -offset);
  const days = Array.from({ length: 42 }, (_, i) => addDaysUtc(gridStart, i));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl, { weekday: 'narrow', timeZone: 'UTC' }).format(addDaysUtc(new Date(Date.UTC(2024, 0, 7 + weekStart)), i)),
  );
  const out = (d: Date) => (minD && d < minD) || (maxD && d > maxD);
  const pick = (d: Date) => {
    if (out(d)) return;
    const iso = toIso(d);
    onChange?.(changeEvent(iso));
    onValueChange?.(iso);
    setOpen(false);
    btn.current?.focus();
  };
  const moveMonth = (n: number) => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + n, Math.min(c.getUTCDate(), 28))));
  const onKey = (e: KeyboardEvent) => {
    const rtl = dir === 'rtl';
    const map: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 7, ArrowUp: -7 };
    if (e.key in map) {
      e.preventDefault();
      setCursor((c) => addDaysUtc(c, map[e.key]));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveMonth(1);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveMonth(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };
  // chevrons point along the reading direction: "previous" points to where the reader came from
  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        data-disabled={disabled || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria['aria-label']}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(skin, 'flex h-10 cursor-pointer items-center gap-2.5 px-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed', open && 'ring-2 ring-accent', className)}
      >
        <CalendarDays className={cn('size-4 shrink-0', open ? 'text-accent' : 'text-muted')} aria-hidden />
        <span className={cn('flex-1 truncate', !selected && 'text-muted')}>
          {selected ? new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(selected) : (placeholder ?? t.common.pickDate)}
        </span>
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} width={300} maxHeight={360} role="dialog">
        <div dir={dir} className="p-3" onKeyDown={onKey}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => moveMonth(-1)} aria-label={t.common.previous} className="grid size-8 place-items-center rounded-[6px] text-muted transition-colors hover:bg-sunken hover:text-fg">
              <Prev className="size-4" aria-hidden />
            </button>
            <p className="text-[14px] font-bold" aria-live="polite">
              {new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart)}
            </p>
            <button type="button" onClick={() => moveMonth(1)} aria-label={t.common.next} className="grid size-8 place-items-center rounded-[6px] text-muted transition-colors hover:bg-sunken hover:text-fg">
              <Next className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-bold text-muted" aria-hidden>
            {weekdays.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div ref={grid} role="grid" className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = toIso(d);
              const inMonth = d.getUTCMonth() === monthStart.getUTCMonth();
              const isSel = selected && iso === toIso(selected);
              const isToday = iso === todayIso;
              const isCursor = iso === toIso(cursor);
              const disabledDay = out(d);
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  tabIndex={isCursor ? 0 : -1}
                  data-cursor={isCursor}
                  aria-selected={isSel || undefined}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeZone: 'UTC' }).format(d)}
                  disabled={!!disabledDay}
                  onClick={() => pick(d)}
                  className={cn(
                    'font-sign relative grid h-9 place-items-center rounded-[6px] text-[14px] font-semibold transition-colors duration-[120ms] outline-none',
                    !inMonth && 'text-muted/50',
                    isSel ? 'bg-accent text-primary-fg' : 'hover:bg-sunken',
                    isCursor && !isSel && 'ring-2 ring-accent/60 ring-inset',
                    isToday && !isSel && 'text-accent',
                    disabledDay && 'pointer-events-none opacity-30',
                  )}
                >
                  {d.getUTCDate()}
                  {isToday && <span className="absolute bottom-1 size-1 rounded-full bg-current" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <button type="button" onClick={() => pick(fromIso(todayIso)!)} className="rounded-[6px] px-2.5 py-1.5 text-[13px] font-bold text-accent hover:bg-primary-soft">
              {t.common.today}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-[6px] px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-sunken">
              {t.common.close}
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ═══════════════════════════ Checkbox ═══════════════════════════ */

export function Checkbox({ label, checked, onChange, disabled, srLabel }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; srLabel?: string }) {
  return (
    <label className={cn('group inline-flex cursor-pointer items-center gap-2.5 text-[14px] select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <span className="relative inline-grid size-[18px] shrink-0 place-items-center">
        <input type="checkbox" className="peer absolute inset-0 cursor-[inherit] opacity-0" checked={checked} disabled={disabled} aria-label={srLabel} onChange={(e) => onChange(e.target.checked)} />
        <span
          aria-hidden
          className={cn(
            'grid size-[18px] place-items-center rounded-[5px] ring-1 ring-inset transition-[background-color,box-shadow] duration-[180ms] ease-out',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface',
            checked ? 'bg-accent ring-accent' : 'bg-surface-raised ring-border-strong group-hover:ring-fg/40',
          )}
        >
          <Check className={cn('size-3.5 text-primary-fg transition-[opacity,transform] duration-[180ms] ease-out', checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} strokeWidth={3} />
        </span>
      </span>
      {label}
    </label>
  );
}

/** Small search input used in list headers. */
export function SearchInput(props: Omit<InputProps, 'icon' | 'type'>) {
  return <Input type="search" icon={<Search />} {...props} />;
}
