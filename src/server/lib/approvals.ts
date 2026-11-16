import { Prisma, Role } from '@prisma/client';
import { prisma } from './prisma';
import { forbidden } from './errors';
import { logger } from './logger';
import type { PermissionKey } from './permissions';
import type { AuthUser } from '../middleware/auth';
import { emailChannel } from '../modules/notifications/channels';

export interface Summary {
  ar: string;
  en: string;
}

const LABELS: Record<PermissionKey, Summary> = {
  'contracts.create': { ar: 'إنشاء عقد', en: 'Create contract' },
  'contracts.update': { ar: 'تعديل عقد', en: 'Edit contract' },
  'contracts.renew': { ar: 'تجديد عقد', en: 'Renew contract' },
  'contracts.terminate': { ar: 'إنهاء عقد', en: 'Terminate contract' },
  'tenants.create': { ar: 'إضافة مستأجر', en: 'Add tenant' },
  'tenants.update': { ar: 'تعديل بيانات مستأجر', en: 'Edit tenant' },
  'tenants.delete': { ar: 'حذف مستأجر', en: 'Delete tenant' },
  'spots.edit': { ar: 'تعديل الأماكن / المخطط', en: 'Edit spots / layout' },
  'imports.commit': { ar: 'اعتماد استيراد Excel', en: 'Commit Excel import' },
  'settings.update': { ar: 'تعديل الإعدادات', en: 'Change settings' },
};
export const permissionLabel = (p: PermissionKey) => LABELS[p];

type Bag = Record<string, unknown>;

/** Unicode first-strong isolate: keeps Latin names, numbers and dates from reordering inside Arabic text. */
const iso = (v: unknown) => `⁨${String(v ?? '')}⁩`;

/** Human description of the held action, so the approver knows exactly what they approve. */
async function describe(permission: PermissionKey, params: Bag, body: Bag): Promise<Summary> {
  const base = LABELS[permission];
  const join = (detail?: Summary | null): Summary => (detail ? { ar: `${base.ar}: ${detail.ar}`, en: `${base.en}: ${detail.en}` } : base);
  try {
    if (permission === 'contracts.create') {
      const tenant = await prisma.tenant.findUnique({ where: { id: String(body.tenantId) }, select: { nameAr: true, nameEn: true } });
      const spots = Array.isArray(body.spots) ? body.spots.length : 0;
      const alloc = Array.isArray(body.allocations) ? (body.allocations as { quantity?: number }[]).reduce((a, x) => a + (x.quantity ?? 0), 0) : 0;
      const n = spots + alloc;
      return join({
        ar: `${iso(tenant?.nameAr ?? '—')} — ${iso(n)} مكان، من ${iso(body.startDate)}`,
        en: `${tenant?.nameEn ?? tenant?.nameAr ?? '—'} — ${n} spot(s), from ${body.startDate ?? ''}`,
      });
    }
    if (permission.startsWith('contracts.') && params.id) {
      const c = await prisma.contract.findUnique({ where: { id: String(params.id) }, select: { number: true, tenant: { select: { nameAr: true, nameEn: true } } } });
      const reason = permission === 'contracts.terminate' && body.reason ? ` — ${String(body.reason)}` : '';
      const pct = permission === 'contracts.renew' && body.priceIncreasePercent ? ` (${body.priceIncreasePercent}%)` : '';
      return join(c ? { ar: `${iso(c.number)} — ${iso(c.tenant.nameAr)}${pct && ` ${iso(pct.trim())}`}${reason}`, en: `${c.number} — ${c.tenant.nameEn ?? c.tenant.nameAr}${pct}${reason}` } : null);
    }
    if (permission === 'tenants.create') return join({ ar: String(body.nameAr ?? ''), en: String(body.nameEn ?? body.nameAr ?? '') });
    if (permission.startsWith('tenants.') && params.id) {
      const tn = await prisma.tenant.findUnique({ where: { id: String(params.id) }, select: { nameAr: true, nameEn: true } });
      const what = params.contactId ? { ar: ' (جهة اتصال)', en: ' (contact)' } : { ar: '', en: '' };
      return join(tn ? { ar: tn.nameAr + what.ar, en: (tn.nameEn ?? tn.nameAr) + what.en } : null);
    }
    if (permission === 'spots.edit') {
      if (Array.isArray(body.items)) return join({ ar: `حفظ مواضع ${iso(body.items.length)} مكان على المخطط`, en: `save ${body.items.length} spot position(s) on the plan` });
      if (params.id) {
        const sp = await prisma.spot.findUnique({ where: { id: String(params.id) }, select: { label: true, floor: { select: { code: true } } } });
        const flag = body.isActive === false ? { ar: ' — إيقاف عن الخدمة', en: ' — out of service' } : body.isActive === true ? { ar: ' — إعادة للخدمة', en: ' — back in service' } : { ar: '', en: '' };
        return join(sp ? { ar: `${iso(`${sp.floor.code}-${sp.label}`)}${flag.ar}`, en: `${sp.floor.code}-${sp.label}${flag.en}` } : null);
      }
      return join({ ar: `${body.floorCode ?? ''}-${body.label ?? ''}`, en: `${body.floorCode ?? ''}-${body.label ?? ''}` });
    }
    if (permission === 'imports.commit' && params.id) {
      const b = await prisma.importBatch.findUnique({ where: { id: String(params.id) }, select: { fileName: true } });
      return join(b ? { ar: iso(b.fileName), en: b.fileName } : null);
    }
  } catch (err) {
    logger.warn({ err }, 'approval summary failed');
  }
  return base;
}

/** Stores the action as a pending request for the approver instead of running it. */
export async function holdForApproval(input: {
  permission: PermissionKey;
  method: string;
  routePath: string;
  params: unknown;
  query: unknown;
  body: unknown;
  user: AuthUser;
  approverId: string | null;
}) {
  let approverId = input.approverId;
  if (!approverId || approverId === input.user.id) {
    // rule without a valid approver → first active admin (never the requester)
    const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true, id: { not: input.user.id } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!admin) throw forbidden('This action needs approval, but no approver is configured');
    approverId = admin.id;
  }
  const approver = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true, name: true, email: true, isActive: true, locale: true } });
  if (!approver?.isActive) throw forbidden('The configured approver is not active — ask an administrator to update your permissions');

  const params = (input.params ?? {}) as Bag;
  const body = (input.body ?? {}) as Bag;
  const summary = await describe(input.permission, params, body);
  const request = await prisma.approvalRequest.create({
    data: {
      permission: input.permission,
      method: input.method,
      routePath: input.routePath,
      params: params as Prisma.InputJsonValue,
      query: (input.query ?? {}) as Prisma.InputJsonValue,
      body: body as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      requesterId: input.user.id,
      approverId: approver.id,
    },
  });

  // tell the approver (in-app + e-mail when enabled)
  const ar = approver.locale !== 'en';
  const title = ar ? `طلب موافقة من ${iso(input.user.name)}: ${summary.ar}` : `Approval needed from ${input.user.name}: ${summary.en}`;
  await prisma.notification.create({ data: { userId: approver.id, type: 'APPROVAL_REQUEST', title, body: ar ? 'افتح صفحة الموافقات للمراجعة.' : 'Open Approvals to review.', link: '/approvals' } });
  void emailChannel.send({ to: approver.email, subject: title, text: `${summary.ar}\n${summary.en}\n\n/approvals` }).catch(() => undefined);

  return { id: request.id, status: request.status, summary, approver: { id: approver.id, name: approver.name } };
}
