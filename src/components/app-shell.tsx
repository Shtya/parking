'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  Bell, Building2, ChartNoAxesCombined, FileSpreadsheet, FileText, Languages, LayoutDashboard, LogOut, Map as MapIcon, Menu, Monitor, Moon, Settings, Sun, Upload, Users, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { cn, Button, Spinner } from './ui';
import { useI18n, useLogout, useMe } from './providers';

const NAV = [
  { href: '/', key: 'dashboard', icon: LayoutDashboard },
  { href: '/floors', key: 'floors', icon: MapIcon },
  { href: '/tenants', key: 'tenants', icon: Users },
  { href: '/contracts', key: 'contracts', icon: FileText },
  { href: '/imports', key: 'imports', icon: Upload },
  { href: '/reports', key: 'reports', icon: FileSpreadsheet },
  { href: '/notifications', key: 'notifications', icon: Bell },
  { href: '/settings', key: 'settings', icon: Settings },
] as const;

function Brand() {
  const { t } = useI18n();
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg shadow-sm">
        <Building2 className="size-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">{t.appName}</p>
        <p className="text-[11px] text-muted">{t.appTagline}</p>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition', active ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg')}
          >
            <Icon className="size-[18px]" />
            {t.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard() {
  const { data: me } = useMe();
  const { t } = useI18n();
  const logout = useLogout();
  if (!me) return <Spinner />;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{me.name.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{me.name}</p>
        <p className="truncate text-[11px] text-muted">{t.role[me.role]}</p>
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
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} title={`${t.common.theme}: ${mounted ? t.common[(theme ?? 'system') as 'light'] : ''}`} aria-label={t.common.theme}>
      <Icon className="size-[18px]" />
    </Button>
  );
}

function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} className="gap-1.5" aria-label="language">
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
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={t.nav.notifications}>
        <Bell className="size-[18px]" />
        {!!data?.unread && (
          <span className="absolute -top-0.5 -end-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{data.unread > 99 ? '99+' : data.unread}</span>
        )}
      </Button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">{t.notifications.title}</p>
            {!!data?.unread && (
              <button className="text-xs text-primary hover:underline" onClick={readAll}>
                {t.notifications.markAll}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.items.length && <p className="px-4 py-8 text-center text-sm text-muted">{t.notifications.empty}</p>}
            {data?.items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? '/notifications'}
                onClick={() => {
                  setOpen(false);
                  if (!n.readAt) api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
                }}
                className={cn('block border-b border-border/60 px-4 py-3 text-sm hover:bg-surface-2', !n.readAt && 'bg-primary-soft/40')}
              >
                <p className="line-clamp-2 font-medium">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{fmtDateTime(n.createdAt, locale)}</p>
              </Link>
            ))}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-surface-2">
            {t.common.view} →
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  useEffect(() => setDrawer(false), [path]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-6 border-e border-border bg-surface px-3 py-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <UserCard />
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col gap-6 bg-surface px-3 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setDrawer(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
            <UserCard />
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="menu">
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden">
            <ChartNoAxesCombined className="size-5 text-primary" />
          </div>
          <div className="flex-1" />
          <LocaleToggle />
          <ThemeToggle />
          <BellMenu />
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
