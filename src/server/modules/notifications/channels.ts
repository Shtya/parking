import nodemailer, { type Transporter } from 'nodemailer';
import { Channel } from '@prisma/client';
import { env } from '../../lib/env';
import { logger } from '../../lib/logger';

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  error?: string;
}

/** A delivery channel. Add WhatsApp / SMS providers by implementing this interface. */
export interface NotificationChannel {
  channel: Channel;
  readonly enabled: boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

let transporter: Transporter | null = null;
const getTransporter = () =>
  (transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  }));

export const emailChannel: NotificationChannel = {
  channel: Channel.EMAIL,
  get enabled() {
    return env.EMAIL_ENABLED;
  },
  async send(msg) {
    if (!env.EMAIL_ENABLED) {
      logger.info({ to: msg.to, subject: msg.subject }, '[email disabled] message logged only');
      return { status: 'SKIPPED', error: 'EMAIL_ENABLED=false (logged only)' };
    }
    try {
      await getTransporter().sendMail({ from: env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return { status: 'SENT' };
    } catch (err) {
      logger.error({ err, to: msg.to }, 'email send failed');
      return { status: 'FAILED', error: (err as Error).message };
    }
  },
};

/** Placeholder — plug a provider (e.g. WhatsApp Cloud API / Twilio) here later. */
export const whatsappChannel: NotificationChannel = {
  channel: Channel.WHATSAPP,
  get enabled() {
    return env.WHATSAPP_ENABLED;
  },
  async send(msg) {
    logger.info({ to: msg.to }, '[whatsapp] provider not configured');
    return { status: 'SKIPPED', error: 'WhatsApp provider not configured yet' };
  },
};

export const smsChannel: NotificationChannel = {
  channel: Channel.SMS,
  get enabled() {
    return env.SMS_ENABLED;
  },
  async send(msg) {
    logger.info({ to: msg.to }, '[sms] provider not configured');
    return { status: 'SKIPPED', error: 'SMS provider not configured yet' };
  },
};

export const channels: Record<Exclude<Channel, 'IN_APP'>, NotificationChannel> = {
  EMAIL: emailChannel,
  WHATSAPP: whatsappChannel,
  SMS: smsChannel,
};
