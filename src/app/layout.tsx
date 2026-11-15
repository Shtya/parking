import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Almarai, Barlow_Semi_Condensed, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/components/providers';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';
import './globals.css';

// Three families, three jobs (adjustFontFallback off: the generated Arial fallback carries Arabic glyphs and would hide Almarai):
//  Plus Jakarta Sans — English text (also renders Latin words inside Arabic sentences)
//  Almarai           — Arabic text (clear Saudi UI face; picks up every Arabic glyph via fallback)
//  Barlow Semi Cond. — numbers, spot labels, codes, amounts
const latin = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-latin', display: 'swap', adjustFontFallback: false });
const arabic = Almarai({ subsets: ['arabic'], weight: ['300', '400', '700', '800'], variable: '--font-arabic', display: 'swap' });
const numerals = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-num', display: 'swap', adjustFontFallback: false });

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
      <body className={`${latin.variable} ${arabic.variable} ${numerals.variable} min-h-dvh font-sans`}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
