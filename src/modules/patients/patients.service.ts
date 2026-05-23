import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import type { Env } from '@config/env.validation';
import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsDto } from './dto/list-patients.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: ListPatientsDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.PatientWhereInput = { deletedAt: null };
    if (query.documentType) where.documentType = query.documentType;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { documentNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: {
        users: {
          where: { deletedAt: null, role: UserRole.patient },
          select: { id: true, email: true, status: true, lastLoginAt: true },
        },
      },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  async create(dto: CreatePatientDto) {
    await this.assertDocumentAvailable(dto.documentType, dto.documentNumber);
    return this.prisma.patient.create({
      data: {
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        sex: dto.sex,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findById(id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        sex: dto.sex,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
      },
    });
  }

  async softDelete(id: string, actor?: AuthUser) {
    const patient = await this.findById(id);
    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.events.emit(AppEvents.AuditEvent, {
      action: 'patient.soft_deleted',
      entityType: 'patient',
      entityId: id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Paciente ${patient.firstName} ${patient.lastName} (${patient.documentNumber}) eliminado`,
      metadata: { documentType: patient.documentType, documentNumber: patient.documentNumber },
    });
  }

  // Crea (o resetea) el usuario del portal del paciente. Login = documentNumber.
  async grantPortalAccess(
    patientId: string,
    actor?: AuthUser,
  ): Promise<{ documentNumber: string; temporaryPassword: string }> {
    const patient = await this.findById(patientId);
    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const temporary = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(temporary, cost);

    const existing = await this.prisma.user.findFirst({
      where: { patientId: patient.id, role: UserRole.patient, deletedAt: null },
    });

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          status: UserStatus.active,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } else {
      // Si el documento ya esta tomado por otro usuario (raro), abortar.
      const conflict = await this.prisma.user.findUnique({
        where: { documentNumber: patient.documentNumber },
      });
      if (conflict) {
        throw new ConflictException('Ya existe un usuario con ese numero de documento');
      }
      await this.prisma.user.create({
        data: {
          documentNumber: patient.documentNumber,
          email: patient.email ?? null,
          passwordHash,
          role: UserRole.patient,
          status: UserStatus.active,
          mustChangePassword: true,
          fullName: `${patient.firstName} ${patient.lastName}`,
          patientId: patient.id,
        },
      });
    }

    this.events.emit(AppEvents.AuditEvent, {
      action: 'patient.portal_access_granted',
      entityType: 'patient',
      entityId: patient.id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Credenciales del portal generadas para ${patient.firstName} ${patient.lastName}`,
      metadata: { documentNumber: patient.documentNumber, reset: !!existing },
    });

    return { documentNumber: patient.documentNumber, temporaryPassword: temporary };
  }

  private async assertDocumentAvailable(
    documentType: CreatePatientDto['documentType'],
    documentNumber: string,
  ): Promise<void> {
    const existing = await this.prisma.patient.findFirst({
      where: { documentType, documentNumber, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Ya existe un paciente con ese documento');
    }
  }
}
