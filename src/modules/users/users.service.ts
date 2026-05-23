import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, User, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import type { Env } from '@config/env.validation';
import { AppEvents, UserCredentialsIssuedEvent } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: ListUsersDto) {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: this.publicSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.publicSelect(),
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(
    dto: CreateUserDto,
  ): Promise<{ user: ReturnType<UsersService['toPublic']>; temporaryPassword: string | null }> {
    if (dto.role === UserRole.patient) {
      throw new BadRequestException(
        'Los usuarios de pacientes se crean desde /patients/:id/portal-access',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const temporary = dto.password ? null : this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(dto.password ?? temporary!, cost);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash,
        status: UserStatus.active,
        mustChangePassword: !dto.password,
      },
      select: this.publicSelect(),
    });

    if (temporary) {
      const payload: UserCredentialsIssuedEvent = {
        userId: created.id,
        recipientEmail: dto.email,
        identifier: dto.email,
        fullName: dto.fullName,
        temporaryPassword: temporary,
      };
      this.events.emit(AppEvents.UserCredentialsIssued, payload);
    }

    return { user: this.toPublic(created), temporaryPassword: temporary };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        status: dto.status,
      },
      select: this.publicSelect(),
    });
    return updated;
  }

  async resetPasswordFor(id: string): Promise<string> {
    const user = await this.findById(id);
    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const temporary = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporary, cost);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (user.email) {
      const payload: UserCredentialsIssuedEvent = {
        userId: user.id,
        recipientEmail: user.email,
        identifier: user.email,
        fullName: user.fullName,
        temporaryPassword: temporary,
      };
      this.events.emit(AppEvents.UserCredentialsIssued, payload);
    }

    return temporary;
  }

  async softDelete(id: string) {
    await this.findById(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.blocked },
    });
  }

  private generateTemporaryPassword(): string {
    return crypto.randomBytes(9).toString('base64url');
  }

  private publicSelect() {
    return {
      id: true,
      email: true,
      documentNumber: true,
      role: true,
      status: true,
      fullName: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.UserSelect;
  }

  private toPublic(user: Pick<User, 'id' | 'email' | 'role' | 'fullName' | 'status'>) {
    return user;
  }
}
