'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import { dictionaries, LOCALE_COOKIE, type Dict, type Locale } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { User, Role } from '@/lib/types';

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

/** Role check. Always false until mounted so server and client markup match (no hydration mismatch). */
export function useCan() {
  const { data } = useMe();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (...roles: Role[]) => Boolean(mounted && data && roles.includes(data.role));
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
        <I18nContext.Provider value={value}>
          {children}
          <Toaster position={locale === 'ar' ? 'top-left' : 'top-right'} richColors closeButton dir={value.dir} />
        </I18nContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
