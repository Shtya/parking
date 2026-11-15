'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Languages, Lock, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/providers';
import type { User } from '@/lib/types';

function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } });
      qc.setQueryData(['me'], res.user);
      if (res.user.locale !== locale && (res.user.locale === 'ar' || res.user.locale === 'en')) setLocale(res.user.locale);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t.login.invalid : (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.login.email}>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ps-9" dir="ltr" />
        </div>
      </Field>
      <Field label={t.login.password}>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="ps-9" dir="ltr" />
        </div>
      </Field>
      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {t.login.submit}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#0b3b37] lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 8 }).map((_, r) =>
            Array.from({ length: 12 }).map((__, c) => (
              <rect key={`${r}-${c}`} x={c * 34 + (r % 2 ? 0 : 17)} y={r * 52 + 6} width="26" height="40" rx="3" fill="none" stroke="#5eead4" strokeWidth="1.2" />
            )),
          )}
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/10 backdrop-blur">
              <Building2 className="size-6" />
            </div>
            <span className="text-lg font-semibold">{t.appName}</span>
          </div>
          <div className="max-w-md">
            <p className="text-3xl leading-snug font-semibold">
              {locale === 'ar' ? 'كل مكان في الباركينج، بحالته وعقده، على خريطة واحدة.' : 'Every parking spot — its status and contract — on one live map.'}
            </p>
            <p className="mt-4 text-white/70">{t.appTagline}</p>
          </div>
          <p className="text-xs text-white/50">© {new Date().getFullYear()}</p>
        </div>
      </div>
      <div className="flex flex-col p-6">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            <Languages className="size-4" />
            {t.common.language}
          </Button>
        </div>
        <div className="m-auto w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary text-primary-fg lg:hidden">
              <Building2 className="size-6" />
            </div>
            <h1 className="text-2xl font-semibold">{t.login.title}</h1>
            <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
