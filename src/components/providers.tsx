'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster, toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { LitTracker } from './motion-bits';
import { dictionaries, LOCALE_COOKIE, type Dict, type Locale } from '@/lib/i18n';
import { api, setApprovalPendingHandler } from '@/lib/api';
import type { User, Role, PermissionKey, EffectivePermission } from '@/lib/types';

// ───────── i18n ─────────
interface I18nCtx {
  locale: Locale;
  t: Dict;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
}
const I18nContext = createContext<I18nCtx | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}

// ───────── auth ─────────
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me'), staleTime: 5 * 60_000, retry: false });
}

/** False during SSR and the first client render, so client-only data never causes a hydration mismatch. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Role check. Always false until mounted so server and client markup match (no hydration mismatch). */
export function useCan() {
  const { data } = useMe();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (...roles: Role[]) => Boolean(mounted && data && roles.includes(data.role));
}

/** My effective permissions: perm(key) → allowed; needsApproval(key) → the action will be held for approval. */
export function usePerm() {
  const { data } = useQuery({ queryKey: ['me', 'permissions'], queryFn: () => api<EffectivePermission[]>('/auth/me/permissions'), staleTime: 60_000, retry: false });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const row = (k: PermissionKey) => (mounted ? data?.find((p) => p.permission === k) : undefined);
  return {
    perm: (k: PermissionKey) => Boolean(row(k)?.allowed),
    needsApproval: (k: PermissionKey) => Boolean(row(k)?.requiresApproval),
  };
}

/** Shows "sent for approval" whenever an action is held instead of applied. */
function ApprovalToasts() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    setApprovalPendingHandler((r) => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      toast.info(t.approvals.sent, {
        description: t.approvals.sentTo.replace('{name}', r.approver.name),
        action: { label: t.common.view, onClick: () => router.push('/approvals?box=mine') },
        duration: 7000,
      });
    });
    return () => setApprovalPendingHandler(null);
  }, [t, qc, router]);
  return null;
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    qc.clear();
    router.replace('/login');
  };
}

export function Providers({ children, locale: initial }: { children: ReactNode; locale: Locale }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  const [locale, setLocaleState] = useState<Locale>(initial);
  const value = useMemo<I18nCtx>(
    () => ({
      locale,
      t: dictionaries[locale],
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      setLocale: (l) => {
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = l;
        document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
        setLocaleState(l);
        api('/auth/me', { method: 'PATCH', body: { locale: l } }).catch(() => undefined);
      },
    }),
    [locale],
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">
          <I18nContext.Provider value={value}>
            {children}
            <LitTracker />
            <ApprovalToasts />
            <Toaster position={locale === 'ar' ? 'bottom-left' : 'bottom-right'} richColors closeButton dir={value.dir} />
          </I18nContext.Provider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
