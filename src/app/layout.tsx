import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Cairo } from 'next/font/google';
import { Providers } from '@/components/providers';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';
import './globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-cairo', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Parking Management', template: '%s · Parking Management' },
  description: 'Interactive parking management: floor maps, tenants, annual contracts, reminders and reports.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1017' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale: Locale = store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ar';
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body className={`${cairo.variable} font-sans min-h-dvh`}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
