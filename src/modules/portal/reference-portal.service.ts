import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderState, UserRole } from '@prisma/client';

import type { AuthUser } from '@shared/auth/auth-user';
import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

@Injectable()
export class ReferencePortalService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista los pacientes que la referencia derivo (distintos en el conjunto
  // de ordenes asignadas a ella). Paginado.
  async listPatients(
    actor: AuthUser,
    page = 1,
    perPage = 25,
    search?: string,
  ): Promise<Paginated<unknown>> {
    if (actor.role !== UserRole.reference_user) {
      throw new ForbiddenException('Solo usuarios de referencia');
    }
    const referenceId = await this.referenceIdForActor(actor);

    const where = {
      orders: { some: { referenceId, deletedAt: null } },
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { documentNumber: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documentType: true,
          documentNumber: true,
          birthDate: true,
          sex: true,
          _count: {
            select: {
              orders: {
                where: {
                  referenceId,
                  state: { in: [OrderState.delivered, OrderState.amended] },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return paginated(items, total, page, perPage);
  }

  private async referenceIdForActor(actor: AuthUser): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { referenceId: true },
    });
    if (!user?.referenceId) {
      throw new NotFoundException('Usuario sin referencia asociada');
    }
    return user.referenceId;
  }
}
