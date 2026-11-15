'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, FileSpreadsheet, FileText, Languages, LayoutDashboard, LogOut, Map as MapIcon, Menu, Monitor, Moon, Settings, Sun, Upload, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { D, EASE_OUT, SPRING } from '@/lib/motion';
import type { Settings as AppSettings } from '@/lib/types';
import { cn, Button, Spinner } from './ui';
import { useI18n, useLogout, useMe } from './providers';

const NAV = [
  [
    { href: '/', key: 'dashboard', icon: LayoutDashboard },
    { href: '/floors', key: 'floors', icon: MapIcon },
    { href: '/tenants', key: 'tenants', icon: Users },
    { href: '/contracts', key: 'contracts', icon: FileText },
  ],
  [
    { href: '/imports', key: 'imports', icon: Upload },
    { href: '/reports', key: 'reports', icon: FileSpreadsheet },
  ],
  [
    { href: '/notifications', key: 'notifications', icon: Bell },
    { href: '/settings', key: 'settings', icon: Settings },
  ],
] as const;

/** The mark: a parking sign. */
export function ParkingMark({ className }: { className?: string }) {
  return (
    <span className={cn('font-sign grid size-9 shrink-0 place-items-center rounded-[6px] bg-accent text-[22px] leading-none font-extrabold text-primary-fg shadow-e1', className)} aria-hidden>
      P
    </span>
  );
}

function Brand() {
  const { t, locale } = useI18n();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<AppSettings>('/settings'), staleTime: 10 * 60_000 });
  return (
    <Link href="/" className="flex items-center gap-3 rounded-[6px] px-2 py-1 focus-visible:outline-offset-4">
      <ParkingMark />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-extrabold">{t.appName}</span>
        <span className="block truncate text-[12px] text-muted">{data?.buildingName[locale] ?? ' '}</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate, id }: { onNavigate?: () => void; id: string }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <nav aria-label="main" className="flex flex-col gap-5">
      {NAV.map((group, gi) => (
        <ul key={gi} className="flex flex-col gap-0.5">
          {group.map(({ href, key, icon: Icon }, i) => {
            const active = href === '/' ? path === '/' : path.startsWith(href);
            return (
              <motion.li key={href} initial={false} animate={{ opacity: 1 }} transition={{ delay: (gi * 4 + i) * D.stagger * 0.5 }}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] transition-colors duration-[180ms]',
                    active ? 'font-bold text-accent' : 'text-fg/75 hover:bg-sunken/70 hover:text-fg',
                  )}
                >
                  {active && (
                    <motion.span layoutId={`nav-active-${id}`} transition={SPRING} className="absolute inset-0 rounded-[6px] bg-primary-soft" aria-hidden>
                      <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" />
                    </motion.span>
                  )}
                  <Icon className="relative size-[18px]" strokeWidth={1.9} aria-hidden />
                  <span className="relative">{t.nav[key]}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

function UserCard() {
  const { data: me } = useMe();
  const { t } = useI18n();
  const logout = useLogout();
  if (!me) return <Spinner className="mx-3" />;
  return (
    <div className="flex items-center gap-3 rounded-panel bg-sunken/60 p-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-surface text-sm font-extrabold text-accent shadow-e1" aria-hidden>
        {me.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{me.name}</p>
        <p className="truncate text-[12px] text-muted">{t.role[me.role]}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={logout} title={t.common.logout} aria-label={t.common.logout}>
        <LogOut className="size-4 rtl:rotate-180" />
      </Button>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = !mounted ? Monitor : theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const change = () => {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    setTheme(next);
    window.setTimeout(() => root.classList.remove('theme-anim'), 500);
  };
  return (
    <Button variant="ghost" size="icon" onClick={change} title={`${t.common.theme}: ${mounted ? t.common[(theme ?? 'system') as 'light'] : ''}`} aria-label={t.common.theme}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={mounted ? theme : 'x'} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 60, opacity: 0 }} transition={{ duration: D.micro, ease: EASE_OUT }}>
          <Icon className="size-[18px]" />
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} aria-label={t.common.language}>
      <Languages className="size-4" />
      <span className="hidden sm:inline">{t.common.language}</span>
    </Button>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  type: string;
}

function BellMenu() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>('/notifications', { query: { take: 8 } }),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, []);
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={t.nav.notifications} aria-expanded={open}>
        <Bell className="size-[18px]" />
        {!!data?.unread && (
          <span className="font-sign absolute -top-0.5 -end-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: D.micro, ease: EASE_OUT }}
            className="absolute end-0 z-50 mt-2 w-[min(23rem,calc(100vw-2rem))] origin-top overflow-hidden rounded-sheet bg-surface shadow-e3"
          >
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <p className="text-[15px] font-extrabold">{t.notifications.title}</p>
              {!!data?.unread && (
                <button className="text-[13px] font-semibold text-accent hover:underline" onClick={readAll}>
                  {t.notifications.markAll}
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!data?.items.length && <p className="px-4 py-10 text-center text-sm text-muted">{t.notifications.empty}</p>}
              {data?.items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? '/notifications'}
                  onClick={() => {
                    setOpen(false);
                    if (!n.readAt) api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
                  }}
                  className="flex gap-3 border-t border-border/60 px-4 py-3 text-sm hover:bg-sunken/60"
                >
                  <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : n.type === 'CONTRACT_EXPIRED' ? 'bg-danger' : 'bg-highlight')} />
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-semibold">{n.title}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">{fmtDateTime(n.createdAt, locale)}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-[13px] font-bold text-accent hover:bg-sunken/60">
              {t.common.view}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Header: glass once content scrolls under it; slides away while scrolling down, returns on scroll up. */
function useScrollHeader() {
  const [state, setState] = useState({ glass: false, hidden: false });
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const on = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setState({ glass: y > 8, hidden: y > 160 && y > last });
        last = y;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return state;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  const { t, dir } = useI18n();
  const { glass, hidden } = useScrollHeader();
  const from = dir === "rtl" ? "100%" : "-100%";
  useEffect(() => setDrawer(false), [path]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="skip-link rounded-[6px] bg-accent px-4 py-2 text-sm font-bold text-primary-fg shadow-e3">
        {t.common.skip}
      </a>

      {/* desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-8 bg-surface px-4 py-5 shadow-[inset_-1px_0_0_var(--border)] lg:flex rtl:shadow-[inset_1px_0_0_var(--border)]">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks id="desk" />
        </div>
        <UserCard />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <motion.div className="absolute inset-0 bg-[rgb(var(--shadow-tint)/0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: from }}
              animate={{ x: 0 }}
              exit={{ x: from }}
              transition={{ duration: D.std, ease: EASE_OUT }}
              className="absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col gap-8 bg-surface px-4 py-5 shadow-e4"
            >
              <div className="flex items-center justify-between">
                <Brand />
                <Button variant="ghost" size="icon" onClick={() => setDrawer(false)} aria-label={t.common.close}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavLinks id="mob" onNavigate={() => setDrawer(false)} />
              </div>
              <UserCard />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0">
        <header
          className={cn(
            'no-print sticky top-0 z-40 flex h-14 items-center gap-1 px-4 transition-[transform,background-color,box-shadow] duration-[450ms] ease-out lg:px-8',
            glass ? 'glass !rounded-none !border-x-0 !border-t-0' : 'bg-transparent',
            hidden && '-translate-y-full',
          )}
        >
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label={t.common.menu} aria-expanded={drawer}>
            <Menu className="size-5" />
          </Button>
          <Link href="/" className="lg:hidden" aria-label={t.appName}>
            <ParkingMark className="size-8 text-[18px]" />
          </Link>
          <div className="flex-1" />
          <LocaleToggle />
          <ThemeToggle />
          <BellMenu />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1520px] px-4 pt-4 pb-16 outline-none lg:px-8 lg:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
