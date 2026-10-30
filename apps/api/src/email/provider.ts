import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';
import type { VerificationSender } from '../auth/email-verification.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string | null }>;
}

function consoleProvider(): EmailProvider {
  return {
    name: 'console',
    async send(message) {
      process.stdout.write(`[email:console] to=${message.to} subject=${message.subject}\n${message.text}\n`);
      return { messageId: null };
    }
  };
}

function smtpProvider(config: Env): EmailProvider {
  if (!config.SMTP_HOST) throw new Error('SMTP_HOST is required for the SMTP email provider.');
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && config.SMTP_PASS ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } } : {}),
    pool: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });
  return {
    name: 'smtp',
    async send(message) {
      const info = await transporter.sendMail({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(config.EMAIL_REPLY_TO ? { replyTo: config.EMAIL_REPLY_TO } : {})
      });
      return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
    }
  };
}

export function createEmailProvider(config: Env): EmailProvider {
  if (config.EMAIL_PROVIDER === 'smtp') return smtpProvider(config);
  if (config.NODE_ENV === 'production') throw new Error('The console email provider is not available in production.');
  return consoleProvider();
}

export function createVerificationSender(provider: EmailProvider): VerificationSender {
  return {
    provider: provider.name,
    async send({ email, code, expiresAt }) {
      const expires = new Date(expiresAt).toISOString().replace('T', ' ').slice(0, 16);
      const text = [
        'Verify your email address',
        '',
        `Your verification code is: ${code}`,
        `This code expires at ${expires} UTC.`,
        '',
        'If you did not create an account, you can ignore this email.',
        'Never share this code with anyone.'
      ].join('\n');
      const html = [
        '<p>Verify your email address</p>',
        `<p>Your verification code is: <strong>${code}</strong></p>`,
        `<p>This code expires at ${expires} UTC.</p>`,
        '<p>If you did not create an account, you can ignore this email. Never share this code with anyone.</p>'
      ].join('');
      return provider.send({ to: email, subject: 'Verify your email address', text, html });
    }
  };
}
