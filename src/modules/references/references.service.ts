import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ReferenceStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import type { Env } from '@config/env.validation';
import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { CreateReferenceUserDto } from './dto/create-reference-user.dto';
import { CreateReferenceDto } from './dto/create-reference.dto';
import { ListReferencesDto } from './dto/list-references.dto';
import { UpdateReferenceDto } from './dto/update-reference.dto';

@Injectable()
export class ReferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: ListReferencesDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.ReferenceWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { taxId: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reference.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: {
            select: {
              users: { where: { deletedAt: null, role: UserRole.reference_user } },
            },
          },
        },
      }),
      this.prisma.reference.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const ref = await this.prisma.reference.findFirst({
      where: { id, deletedAt: null },
      include: {
        users: {
          where: { deletedAt: null, role: UserRole.reference_user },
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            lastLoginAt: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (!ref) throw new NotFoundException('Referencia no encontrada');
    return ref;
  }

  async create(dto: CreateReferenceDto) {
    if (dto.taxId) await this.assertTaxIdAvailable(dto.taxId);
    return this.prisma.reference.create({ data: dto });
  }

  async update(id: string, dto: UpdateReferenceDto) {
    const current = await this.findById(id);
    if (dto.taxId && dto.taxId !== current.taxId) {
      await this.assertTaxIdAvailable(dto.taxId);
    }
    return this.prisma.reference.update({ where: { id }, data: dto });
  }

  async softDelete(id: string, actor?: AuthUser) {
    const ref = await this.findById(id);
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { referenceId: id, deletedAt: null },
        data: { status: UserStatus.blocked },
      }),
      this.prisma.reference.update({
        where: { id },
        data: { deletedAt: new Date(), status: ReferenceStatus.inactive },
      }),
    ]);
    this.events.emit(AppEvents.AuditEvent, {
      action: 'reference.soft_deleted',
      entityType: 'reference',
      entityId: id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Referencia ${ref.name} eliminada (usuarios bloqueados)`,
      metadata: { taxId: ref.taxId, usersBlocked: ref.users.length },
    });
  }

  async addUser(referenceId: string, dto: CreateReferenceUserDto, actor?: AuthUser) {
    const ref = await this.findById(referenceId);

    const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (conflict) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const temporary = dto.password ? null : crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(dto.password ?? temporary!, cost);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: UserRole.reference_user,
        status: UserStatus.active,
        mustChangePassword: !dto.password,
        passwordHash,
        referenceId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        mustChangePassword: true,
        status: true,
      },
    });

    this.events.emit(AppEvents.AuditEvent, {
      action: 'reference_user.created',
      entityType: 'reference',
      entityId: referenceId,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Usuario ${user.email} agregado a ${ref.name}`,
      metadata: { userId: user.id, email: user.email, autoPassword: !dto.password },
    });

    return { user, temporaryPassword: temporary };
  }

  async removeUser(referenceId: string, userId: string, actor?: AuthUser) {
    const ref = await this.findById(referenceId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, referenceId, role: UserRole.reference_user, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado en esta referencia');
    }
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: UserStatus.blocked },
      }),
    ]);
    this.events.emit(AppEvents.AuditEvent, {
      action: 'reference_user.removed',
      entityType: 'reference',
      entityId: referenceId,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Usuario ${user.email} removido de ${ref.name}`,
      metadata: { userId: user.id, email: user.email },
    });
  }

  private async assertTaxIdAvailable(taxId: string): Promise<void> {
    const existing = await this.prisma.reference.findFirst({
      where: { taxId, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Ya existe una referencia con ese RUC/Tax ID');
    }
  }
}
