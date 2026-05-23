import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus, Prisma, UserRole } from '@prisma/client';

import type { Env } from '@config/env.validation';
import { PrismaService } from '@shared/prisma/prisma.service';

import { EmailTemplateName, EmailTemplateService } from './email-template.service';
import { MailService } from './mail.service';

interface OrderRecipient {
  email: string;
  audience: 'patient' | 'reference';
  name: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly templates: EmailTemplateService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---- Trigger principal: orden entregada ----

  async notifyOrderDelivered(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        patient: { select: { firstName: true, lastName: true, email: true } },
        reference: {
          select: {
            contactEmail: true,
            name: true,
            users: {
              where: { deletedAt: null, role: UserRole.reference_user },
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');

    const recipients = this.collectRecipients(order);
    const lab = await this.loadLabBranding();
    const portalUrl = this.config.get('FRONT_URL', { infer: true });
    const verificationUrl = this.buildLatestVerificationUrl(orderId);

    for (const r of recipients) {
      await this.send({
        template: 'result-ready',
        recipient: r.email,
        subject: `${lab.commercialName} | Tu resultado esta listo (${order.code})`,
        orderId: order.id,
        ctx: {
          labName: lab.commercialName,
          labColor: lab.primaryColor,
          labEmail: lab.email ?? '',
          patientName: r.audience === 'patient' ? r.name : null,
          orderCode: order.code,
          portalUrl,
          verificationUrl: await verificationUrl,
        },
      });
    }

    if (recipients.length === 0) {
      await this.log({
        orderId: order.id,
        recipient: '-',
        template: 'result-ready',
        subject: 'sin destinatarios',
        status: NotificationStatus.no_recipient,
      });
    }
  }

  async resendForOrder(orderId: string): Promise<{ recipients: number }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.state !== 'delivered' && order.state !== 'amended') {
      throw new BadRequestException(`No se puede reenviar: la orden esta en estado ${order.state}`);
    }
    const before = await this.prisma.notificationsLog.count({ where: { orderId } });
    await this.notifyOrderDelivered(orderId);
    const after = await this.prisma.notificationsLog.count({ where: { orderId } });
    return { recipients: Math.max(0, after - before) };
  }

  // ---- Otros triggers (usados por AuthService / UsersService) ----

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const lab = await this.loadLabBranding();
    const verifyBase = this.config.get('FRONT_URL', { infer: true }).replace(/\/+$/, '');
    const resetUrl = `${verifyBase}/reset-password?token=${encodeURIComponent(token)}`;

    await this.send({
      template: 'password-reset',
      recipient: email,
      subject: `${lab.commercialName} | Restablece tu contrasena`,
      orderId: null,
      ctx: {
        labName: lab.commercialName,
        labColor: lab.primaryColor,
        resetUrl,
      },
    });
  }

  async sendCredentials(input: {
    recipientEmail: string;
    identifier: string;
    fullName: string | null;
    temporaryPassword: string;
  }): Promise<void> {
    const lab = await this.loadLabBranding();
    const portalUrl = this.config.get('FRONT_URL', { infer: true });
    await this.send({
      template: 'credentials',
      recipient: input.recipientEmail,
      subject: `${lab.commercialName} | Tus credenciales de acceso`,
      orderId: null,
      ctx: {
        labName: lab.commercialName,
        labColor: lab.primaryColor,
        identifier: input.identifier,
        fullName: input.fullName,
        temporaryPassword: input.temporaryPassword,
        portalUrl,
      },
    });
  }

  // ---- Lecturas para auditoria ----

  async listByOrder(orderId: string) {
    return this.prisma.notificationsLog.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Engine compartido (render + send + log) ----

  private async send(input: {
    template: EmailTemplateName;
    recipient: string;
    subject: string;
    orderId: string | null;
    ctx: Record<string, unknown>;
  }): Promise<void> {
    if (!input.recipient || !this.isValidEmail(input.recipient)) {
      await this.log({
        orderId: input.orderId,
        recipient: input.recipient || '-',
        template: input.template,
        subject: input.subject,
        status: NotificationStatus.no_recipient,
      });
      return;
    }

    const html = await this.templates.render(input.template, {
      ...input.ctx,
      subject: input.subject,
    });
    const logRow = await this.prisma.notificationsLog.create({
      data: {
        orderId: input.orderId,
        recipient: input.recipient,
        template: input.template,
        subject: input.subject,
        channel: NotificationChannel.email,
        status: NotificationStatus.pending,
      },
    });

    try {
      const result = await this.mail.send({
        to: input.recipient,
        subject: input.subject,
        html,
      });
      await this.prisma.notificationsLog.update({
        where: { id: logRow.id },
        data: {
          status: result.status === 'sent' ? NotificationStatus.sent : NotificationStatus.skipped,
          providerId: result.providerId,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`Envio fallido a ${input.recipient}: ${message}`);
      await this.prisma.notificationsLog.update({
        where: { id: logRow.id },
        data: {
          status: NotificationStatus.failed,
          errorMessage: message.slice(0, 1000),
        },
      });
    }
  }

  private async log(args: {
    orderId: string | null;
    recipient: string;
    template: string;
    subject: string;
    status: NotificationStatus;
    error?: string;
  }): Promise<void> {
    await this.prisma.notificationsLog.create({
      data: {
        orderId: args.orderId,
        recipient: args.recipient,
        template: args.template,
        subject: args.subject,
        status: args.status,
        errorMessage: args.error,
        channel: NotificationChannel.email,
      },
    });
  }

  private collectRecipients(order: {
    patient: { firstName: string; lastName: string; email: string | null };
    reference: {
      contactEmail: string | null;
      name: string;
      users: { email: string | null; fullName: string | null }[];
    } | null;
  }): OrderRecipient[] {
    const out: OrderRecipient[] = [];

    if (order.patient.email) {
      out.push({
        email: order.patient.email,
        audience: 'patient',
        name: `${order.patient.firstName} ${order.patient.lastName}`,
      });
    }

    if (order.reference) {
      // Usuarios reference_user > contactEmail de la referencia (en ese orden).
      const userEmails = order.reference.users.map((u) => u.email).filter((e): e is string => !!e);
      if (userEmails.length > 0) {
        for (const email of userEmails) {
          out.push({
            email,
            audience: 'reference',
            name: order.reference.name,
          });
        }
      } else if (order.reference.contactEmail) {
        out.push({
          email: order.reference.contactEmail,
          audience: 'reference',
          name: order.reference.name,
        });
      }
    }

    return out;
  }

  private async loadLabBranding() {
    const lab = await this.prisma.labConfig.findFirst();
    return {
      commercialName: lab?.commercialName ?? 'Laboratorio',
      primaryColor: lab?.primaryColor ?? '#0F766E',
      email: lab?.email ?? null,
    };
  }

  private async buildLatestVerificationUrl(orderId: string): Promise<string | null> {
    const report = await this.prisma.report.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
      include: { tokens: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const token = report?.tokens[0]?.token;
    if (!token) return null;
    const base = this.config.get('PUBLIC_VERIFY_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/${token}`;
  }

  private isValidEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
}
