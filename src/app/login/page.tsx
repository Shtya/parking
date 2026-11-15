'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Languages, Lock, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { D, EASE_OUT } from '@/lib/motion';
import { Button, Field, Input } from '@/components/ui';
import { ParkingMark } from '@/components/app-shell';
import { useI18n } from '@/components/providers';
import type { User } from '@/lib/types';

function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    api<User>('/auth/me')
      .then((user) => {
        if (cancelled) return;
        qc.setQueryData(['me'], user);
        router.replace(next && next.startsWith('/') && !next.startsWith('/login') ? next : '/');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [qc, router, next]);
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
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <Field label={t.login.email}>
        <Input type="email" icon={<Mail />} autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" dir="ltr" aria-invalid={!!error} />
      </Field>
      <Field label={t.login.password}>
        <Input type="password" icon={<Lock />} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" dir="ltr" aria-invalid={!!error} />
      </Field>
      {error && (
        <motion.p role="alert" initial={{ x: 0 }} animate={{ x: [0, -6, 6, -3, 0] }} transition={{ duration: 0.35 }} className="rounded-input bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">
          {error}
        </motion.p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {t.login.submit}
      </Button>
    </form>
  );
}

/** The real B1 drawing, swept once by a pair of headlights. */
function PlanHero() {
  const { t, dir } = useI18n();
  const reduce = useReducedMotion();
  const [svg, setSvg] = useState<string | null>(null);
  const [sweep, setSweep] = useState(false);
  useEffect(() => {
    fetch('/floors/B1.svg')
      .then((r) => r.text())
      .then(setSvg)
      .catch(() => undefined);
    try {
      if (!sessionStorage.getItem('pms_intro')) {
        setSweep(true);
        sessionStorage.setItem('pms_intro', '1');
      }
    } catch {
      /* storage blocked — skip the intro */
    }
  }, []);
  const words = t.login.hero.split(' ');
  const from = dir === 'rtl' ? '130%' : '-60%';
  const to = dir === 'rtl' ? '-60%' : '130%';
  return (
    <div
      className="relative hidden overflow-hidden bg-[#0e1114] text-[#e7e9ea] lg:flex lg:flex-col"
      style={{ ['--plan-wall' as string]: '#c9d0d6', ['--plan-park' as string]: '#4d555c', ['--plan-misc' as string]: '#262c31' }}
    >
      {svg && (
        <motion.div
          className="absolute inset-[-8%] [&>svg]:h-full [&>svg]:w-full"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 0.55, scale: 1 }}
          transition={{ duration: D.cine * 1.5, ease: EASE_OUT }}
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-hidden
        />
      )}
      {sweep && !reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[-20%] h-[140%] w-[55%] mix-blend-screen"
          style={{ background: 'radial-gradient(ellipse 45% 40% at 50% 50%, rgba(255,236,190,0.30), transparent 70%)', filter: 'blur(8px)' }}
          initial={{ x: from }}
          animate={{ x: to }}
          transition={{ duration: D.cine * 1.3, ease: EASE_OUT, delay: 0.3 }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#0e1114_8%,transparent_55%)]" aria-hidden />
      <div className="relative mt-auto p-12 xl:p-16">
        <h2 className="max-w-[16ch] text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-[1.15] font-extrabold tracking-tight">
          {words.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
              <motion.span
                className="inline-block"
                initial={reduce ? false : { y: '105%' }}
                animate={{ y: 0 }}
                transition={{ duration: D.std + 0.2, ease: EASE_OUT, delay: 0.5 + i * D.stagger }}
              >
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </motion.span>
            </span>
          ))}
        </h2>
        <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 1.1, duration: D.std }} className="mt-4 max-w-[46ch] text-[15px]">
          {t.login.heroSub}
        </motion.p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.2fr_1fr]">
      <PlanHero />
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ParkingMark />
            <span className="text-[15px] font-extrabold">{t.appName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            <Languages className="size-4" />
            {t.common.language}
          </Button>
        </div>
        <div className="m-auto w-full max-w-[380px] py-12">
          <h1 className="text-[24px] leading-tight font-extrabold tracking-tight">{t.login.title}</h1>
          <p className="mt-2 mb-8 text-[15px] text-muted">{t.login.subtitle}</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
