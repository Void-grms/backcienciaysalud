import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

import type { Env } from '@config/env.validation';
import { PrismaService } from '@shared/prisma/prisma.service';

@Injectable()
export class ReportTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Garantiza que el reporte tenga un token vigente reutilizable. Se llama
  // tanto al generar el PDF (para embeber el QR) como al pedir el verify
  // posteriormente.
  async ensureToken(reportId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const existing = await client.reportToken.findFirst({
      where: {
        reportId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.token;

    const token = crypto.randomBytes(16).toString('base64url');
    await client.reportToken.create({ data: { reportId, token } });
    return token;
  }

  // Carga el reporte por token. Lanza 404 si no existe / expiro / esta
  // huerfano (sin orden). Solo lectura, sin efectos colaterales.
  async resolve(token: string) {
    const record = await this.prisma.reportToken.findUnique({
      where: { token },
      include: {
        report: {
          include: {
            order: {
              include: {
                patient: true,
                reference: { select: { id: true, name: true, taxId: true } },
                validatedBy: { select: { id: true, fullName: true } },
              },
            },
          },
        },
      },
    });
    if (!record || (record.expiresAt && record.expiresAt.getTime() < Date.now())) {
      throw new NotFoundException('Token de verificacion invalido o expirado');
    }
    return record;
  }

  buildVerificationUrl(token: string): string {
    const base = this.config.get('PUBLIC_VERIFY_URL', { infer: true });
    return `${base.replace(/\/+$/, '')}/${token}`;
  }
}
