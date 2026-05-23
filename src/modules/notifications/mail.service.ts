import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '@config/env.validation';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  status: 'sent' | 'skipped';
  providerId: string | null;
}

// MailService desacopla NotificationsService del proveedor concreto.
// Hoy soporta Resend; si no hay `RESEND_API_KEY` (entorno de dev sin
// credenciales) cae a "skipped" y el log queda con status=skipped.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private clientPromise: Promise<{ emails: { send: SendFn } } | null> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    if (!apiKey) {
      this.logger.warn(
        `[MAIL DEV] ${input.to} | ${input.subject} (sin RESEND_API_KEY: se omite el envio)`,
      );
      return { status: 'skipped', providerId: null };
    }

    const client = await this.getClient(apiKey);
    if (!client) {
      return { status: 'skipped', providerId: null };
    }

    const from = this.config.get('MAIL_FROM', { infer: true });
    const result = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if ((result as ResendError)?.error) {
      throw new Error((result as ResendError).error?.message ?? 'Error desconocido de Resend');
    }
    const id = (result as ResendSuccess)?.data?.id ?? null;
    return { status: 'sent', providerId: id };
  }

  private async getClient(apiKey: string) {
    if (!this.clientPromise) {
      this.clientPromise = this.buildClient(apiKey);
    }
    return this.clientPromise;
  }

  private async buildClient(apiKey: string) {
    try {
      const mod = await import('resend');
      const ResendCtor = mod.Resend ?? (mod as unknown as { default: typeof mod.Resend }).default;
      const client = new ResendCtor(apiKey);
      return client as unknown as { emails: { send: SendFn } };
    } catch (err) {
      this.logger.error(`No se pudo cargar Resend: ${(err as Error).message}`);
      return null;
    }
  }
}

type SendFn = (input: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) => Promise<ResendSuccess | ResendError>;

interface ResendSuccess {
  data: { id: string } | null;
}
interface ResendError {
  error: { message: string; statusCode?: number } | null;
}
