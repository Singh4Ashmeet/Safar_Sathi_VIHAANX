import nodemailer from 'nodemailer';
import { env } from '../../../../config/env.js';
import { logger } from '../../../../lib/logger.js';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Free SMTP Email provider (using Gmail App password or Brevo free tier, TRD 8.2, FR-19).
 */
export class SmtpEmailProvider {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (env.SMTP_URL) {
      try {
        this.transporter = nodemailer.createTransport(env.SMTP_URL);
      } catch (err) {
        logger.error({ err }, 'Failed to initialize SMTP transporter');
      }
    }
  }

  async sendEmail(
    toEmail: string,
    subject: string,
    text: string
  ): Promise<EmailSendResult> {
    if (!this.transporter) {
      logger.warn('SMTP transporter not configured; skipping email alert');
      return { success: false, error: 'SMTP unconfigured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: '"SafarSaathi Safety" <noreply@safarsaathi.local>',
        to: toEmail,
        subject,
        text,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch email');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown email error',
      };
    }
  }
}

export const smtpEmailProvider = new SmtpEmailProvider();

