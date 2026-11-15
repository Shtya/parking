import type { Locale } from './i18n';

const intlLocale = (l: Locale) => (l === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');

export const fmtNumber = (n: number | string | null | undefined, l: Locale, digits = 0) =>
  n === null || n === undefined || n === ''
    ? '—'
    : new Intl.NumberFormat(intlLocale(l), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(n));

export const fmtMoney = (n: number | string | null | undefined, l: Locale) => (n === null || n === undefined ? '—' : `${fmtNumber(n, l)} ${l === 'ar' ? 'ر.س' : 'SAR'}`);

export const fmtDate = (d: string | Date | null | undefined, l: Locale) =>
  d ? new Intl.DateTimeFormat(intlLocale(l), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(d)) : '—';

export const fmtDateTime = (d: string | Date | null | undefined, l: Locale) =>
  d ? new Intl.DateTimeFormat(intlLocale(l), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—';

export const fmtMonth = (ym: string, l: Locale) =>
  new Intl.DateTimeFormat(intlLocale(l), { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));

export const isoToday = () => new Date().toISOString().slice(0, 10);

export const tenantName = (t: { nameAr: string; nameEn: string | null } | null | undefined, l: Locale) => (t ? (l === 'en' ? t.nameEn || t.nameAr : t.nameAr) : '—');
export const floorName = (f: { nameAr: string; nameEn: string } | null | undefined, l: Locale) => (f ? (l === 'en' ? f.nameEn : f.nameAr) : '—');
