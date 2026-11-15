import { z } from './zod';
import { prisma } from './prisma';

export const SettingsSchema = z.object({
  buildingName: z.object({ ar: z.string(), en: z.string() }),
  currency: z.string().length(3),
  /** default annual price per spot type (SAR) — used for PAID spots */
  pricing: z.object({ STANDARD: z.number().min(0), VIP: z.number().min(0), SHADED: z.number().min(0), OUTSIDE: z.number().min(0) }),
  /** a rented spot is shown as "expiring" when its contract ends within this many days */
  expiringThresholdDays: z.number().int().min(1).max(365),
  minSpotsPerTenant: z.number().int().min(1).max(50),
  /** extra owner e-mail addresses that receive reminders (besides OWNER users) */
  ownerEmails: z.array(z.string().email()),
  contractNumberPrefix: z.string().min(1).max(8),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  buildingName: { ar: 'مبنى ZBC التجاري', en: 'ZBC Commercial Building' },
  currency: 'SAR',
  pricing: { STANDARD: 6000, VIP: 9000, SHADED: 4500, OUTSIDE: 3000 },
  expiringThresholdDays: 60,
  minSpotsPerTenant: 2,
  ownerEmails: [],
  contractNumberPrefix: 'PK',
};

const KEY = 'general';

export async function getSettings(): Promise<Settings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = SettingsSchema.parse({ ...(await getSettings()), ...patch });
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  return next;
}
