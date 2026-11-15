import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Archivo, Cairo } from 'next/font/google';
import { Providers } from '@/components/providers';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';
import './globals.css';

// Cairo — text & Arabic display (client's choice). Archivo (width axis) — signage numerals & codes.
const cairo = Cairo({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-cairo', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Parking Management', template: '%s · Parking Management' },
  description: 'Interactive parking management: floor maps, tenants, annual contracts, reminders and reports.',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eae6' },
    { media: '(prefers-color-scheme: dark)', color: '#15181b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale: Locale = store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ar';
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body className={`${cairo.variable} ${archivo.variable} min-h-dvh font-sans`}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
