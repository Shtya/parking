import { Channel, ContractStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { today, addDays, daysBetween, isoDate } from '../../lib/dates';
import { getSettings } from '../../lib/settings';
import { expireOverdueContracts } from '../contracts.service';
import { channels, type OutboundMessage } from './channels';

interface Recipient {
  type: 'OWNER' | 'TENANT';
  channel: Channel;
  address: string; // email / phone / userId (in-app)
}

type ContractWithTenant = Prisma.ContractGetPayload<{
  include: { tenant: { include: { contacts: true } }; spots: { include: { spot: { include: { floor: true } } } }; allocations: { include: { floor: true } } };
}>;

function describeSpots(c: ContractWithTenant) {
  const byFloor = new Map<string, string[]>();
  c.spots.forEach((s) => byFloor.set(s.spot.floor.code, [...(byFloor.get(s.spot.floor.code) ?? []), s.spot.label]));
  const parts = [...byFloor.entries()].map(([f, l]) => `${f}: ${l.join(', ')}`);
  c.allocations.forEach((a) => parts.push(`${a.floor.code}: ${a.quantity}`));
  return parts.join(' | ');
}

function buildMessage(c: ContractWithTenant, daysLeft: number, buildingAr: string, buildingEn: string, expired = false) {
  const end = isoDate(c.endDate);
  const subject = expired
    ? `انتهى عقد الباركينج ${c.number} — Parking contract ${c.number} expired`
    : `تذكير: عقد الباركينج ${c.number} ينتهي خلال ${daysLeft} يوم — Parking contract expires in ${daysLeft} days`;
  const spots = describeSpots(c);
  const text = [
    expired
      ? `انتهى عقد الباركينج رقم ${c.number} للمستأجر ${c.tenant.nameAr} بتاريخ ${end}.`
      : `نود تذكيركم بأن عقد الباركينج رقم ${c.number} للمستأجر ${c.tenant.nameAr} ينتهي بتاريخ ${end} (بعد ${daysLeft} يوم).`,
    `الأماكن: ${spots}`,
    `يرجى التواصل مع إدارة ${buildingAr} للتجديد.`,
    '',
    expired
      ? `Parking contract ${c.number} for ${c.tenant.nameEn ?? c.tenant.nameAr} expired on ${end}.`
      : `Parking contract ${c.number} for ${c.tenant.nameEn ?? c.tenant.nameAr} ends on ${end} (${daysLeft} days left).`,
    `Spots: ${spots}`,
    `Please contact ${buildingEn} management to renew.`,
  ].join('\n');
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;max-width:560px">
  <div dir="rtl" style="text-align:right;border-bottom:1px solid #e5e7eb;padding-bottom:12px">
    <h2 style="margin:0 0 8px;color:${expired ? '#b91c1c' : '#b45309'}">${expired ? 'انتهاء عقد باركينج' : 'تذكير بانتهاء عقد باركينج'}</h2>
    <p>${expired ? `انتهى عقد الباركينج رقم <b>${c.number}</b> للمستأجر <b>${c.tenant.nameAr}</b> بتاريخ <b>${end}</b>.` : `عقد الباركينج رقم <b>${c.number}</b> للمستأجر <b>${c.tenant.nameAr}</b> ينتهي بتاريخ <b>${end}</b> — متبقي <b>${daysLeft}</b> يوم.`}</p>
    <p style="color:#4b5563">الأماكن: ${spots}</p>
  </div>
  <div dir="ltr" style="padding-top:12px">
    <p>${expired ? `Parking contract <b>${c.number}</b> expired on <b>${end}</b>.` : `Parking contract <b>${c.number}</b> ends on <b>${end}</b> — <b>${daysLeft}</b> days left.`}</p>
    <p style="color:#4b5563">Spots: ${spots}</p>
  </div>
  <p style="color:#9ca3af;font-size:12px">${buildingAr} · ${buildingEn}</p></div>`;
  return { subject, text, html };
}

async function ownerRecipients(rule: { channels: Channel[] }, extraEmails: string[]): Promise<Recipient[]> {
  const owners = await prisma.user.findMany({ where: { isActive: true, receiveReminders: true, role: { in: [Role.OWNER, Role.ADMIN] } } });
  const out: Recipient[] = [];
  for (const u of owners) {
    if (rule.channels.includes(Channel.IN_APP)) out.push({ type: 'OWNER', channel: Channel.IN_APP, address: u.id });
    if (rule.channels.includes(Channel.EMAIL)) out.push({ type: 'OWNER', channel: Channel.EMAIL, address: u.email });
    if (rule.channels.includes(Channel.WHATSAPP) && u.phone) out.push({ type: 'OWNER', channel: Channel.WHATSAPP, address: u.phone });
    if (rule.channels.includes(Channel.SMS) && u.phone) out.push({ type: 'OWNER', channel: Channel.SMS, address: u.phone });
  }
  if (rule.channels.includes(Channel.EMAIL)) extraEmails.forEach((e) => out.push({ type: 'OWNER', channel: Channel.EMAIL, address: e }));
  return out;
}

function tenantRecipients(rule: { channels: Channel[] }, c: ContractWithTenant): Recipient[] {
  const out: Recipient[] = [];
  const contacts = c.tenant.contacts.filter((x) => x.receiveReminders);
  const emails = new Set(contacts.map((x) => x.email).filter(Boolean) as string[]);
  if (c.tenant.email) emails.add(c.tenant.email);
  if (rule.channels.includes(Channel.EMAIL)) emails.forEach((e) => out.push({ type: 'TENANT', channel: Channel.EMAIL, address: e }));
  for (const x of contacts) {
    if (rule.channels.includes(Channel.WHATSAPP) && (x.whatsapp || x.phone)) out.push({ type: 'TENANT', channel: Channel.WHATSAPP, address: (x.whatsapp || x.phone)! });
    if (rule.channels.includes(Channel.SMS) && x.phone) out.push({ type: 'TENANT', channel: Channel.SMS, address: x.phone });
  }
  return out;
}

/** Sends once per dedupeKey — safe to run any number of times per day. */
async function deliver(dedupeKey: string, r: Recipient, c: ContractWithTenant, daysBefore: number | null, msg: Omit<OutboundMessage, 'to'> & { type: string }) {
  try {
    await prisma.notificationDelivery.create({
      data: { dedupeKey, channel: r.channel, recipient: r.address, recipientType: r.type, subject: msg.subject, contractId: c.id, daysBefore },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
    throw err;
  }
  let status: 'SENT' | 'SKIPPED' | 'FAILED' = 'SENT';
  let error: string | undefined;
  if (r.channel === Channel.IN_APP) {
    await prisma.notification.create({
      data: { userId: r.address, type: msg.type, title: msg.subject, body: msg.text.split('\n')[0], link: `/contracts/${c.id}`, contractId: c.id },
    });
  } else {
    const res = await channels[r.channel].send({ to: r.address, subject: msg.subject, text: msg.text, html: msg.html });
    status = res.status;
    error = res.error;
  }
  await prisma.notificationDelivery.update({ where: { dedupeKey }, data: { status, error, sentAt: status === 'SENT' ? new Date() : null } });
  return status;
}

export interface ReminderRunResult {
  expired: number;
  contractsChecked: number;
  deliveries: Record<string, number>;
}

export async function runReminders(): Promise<ReminderRunResult> {
  const settings = await getSettings();
  const deliveries: Record<string, number> = {};
  const count = (k: string) => (deliveries[k] = (deliveries[k] ?? 0) + 1);
  const include = { tenant: { include: { contacts: true } }, spots: { include: { spot: { include: { floor: true } } } }, allocations: { include: { floor: true } } } as const;

  // 1) expire overdue contracts and notify
  const expiredIds = await expireOverdueContracts();
  const allChannels = { channels: [Channel.IN_APP, Channel.EMAIL] };
  for (const id of expiredIds) {
    const c = await prisma.contract.findUniqueOrThrow({ where: { id }, include });
    const msg = { ...buildMessage(c, 0, settings.buildingName.ar, settings.buildingName.en, true), type: 'CONTRACT_EXPIRED' };
    for (const r of [...(await ownerRecipients(allChannels, settings.ownerEmails)), ...tenantRecipients(allChannels, c)])
      count(await deliver(`expired:${c.id}:${r.channel}:${r.address}`, r, c, 0, msg));
  }

  // 2) upcoming expiries
  const rules = await prisma.reminderRule.findMany({ where: { isActive: true }, orderBy: { daysBefore: 'asc' } });
  if (!rules.length) return { expired: expiredIds.length, contractsChecked: 0, deliveries };
  const maxDays = rules[rules.length - 1].daysBefore;
  const now = today();
  const contracts = await prisma.contract.findMany({
    where: { status: ContractStatus.ACTIVE, endDate: { gte: now, lte: addDays(now, maxDays) }, renewedBy: null },
    include,
  });
  for (const c of contracts) {
    const daysLeft = daysBetween(now, c.endDate);
    // tightest rule that applies (avoids sending 60 + 30 + 7 at once for a short contract)
    const rule = rules.find((r) => daysLeft <= r.daysBefore);
    if (!rule) continue;
    const msg = { ...buildMessage(c, daysLeft, settings.buildingName.ar, settings.buildingName.en), type: 'CONTRACT_EXPIRING' };
    const recipients = [...(rule.notifyOwner ? await ownerRecipients(rule, settings.ownerEmails) : []), ...(rule.notifyTenant ? tenantRecipients(rule, c) : [])];
    for (const r of recipients) count(await deliver(`rule:${c.id}:${rule.daysBefore}:${r.channel}:${r.address}`, r, c, rule.daysBefore, msg));
  }
  logger.info({ expired: expiredIds.length, checked: contracts.length, deliveries }, 'reminder run finished');
  return { expired: expiredIds.length, contractsChecked: contracts.length, deliveries };
}
