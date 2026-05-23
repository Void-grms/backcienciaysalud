import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import type { AuditEvent } from '@shared/events/app-events';

import { ListAuditDto } from './dto/list-audit.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Persiste un evento de auditoria. La firma es identica al `AuditEvent`
  // emitido por EventEmitter para que cualquier servicio pueda escribir
  // tanto por evento como por llamada directa (cuando el contexto lo
  // requiere mas inmediato y no queremos race con el listener).
  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          actorUserId: event.actorUserId,
          actorRole: event.actorRole ?? null,
          summary: event.summary ?? null,
          metadata: (event.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
        },
      });
    } catch (err) {
      // No queremos que un fallo de audit tumbe la operacion principal.
      // Lo logueamos a nivel WARN y seguimos.
      this.logger.warn(
        `Fallo al persistir audit (${event.action} ${event.entityType}:${event.entityId}): ${(err as Error).message}`,
      );
    }
  }

  async list(query: ListAuditDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }
}
