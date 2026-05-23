import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CatalogStatus, Prisma } from '@prisma/client';

import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';
import { StorageService } from '@shared/storage/storage.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { CreateProfessionalDto } from './dto/create-professional.dto';
import { ListProfessionalsDto } from './dto/list-professionals.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: ListProfessionalsDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.ProfessionalWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { professionalTitle: { contains: query.search, mode: 'insensitive' } },
        { licenseNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.professional.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.professional.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const pro = await this.prisma.professional.findFirst({
      where: { id, deletedAt: null },
    });
    if (!pro) throw new NotFoundException('Profesional no encontrado');
    return pro;
  }

  async create(dto: CreateProfessionalDto, signature?: Express.Multer.File) {
    const signatureKey = signature
      ? await this.storage.save(signature.buffer, {
          contentType: signature.mimetype,
          folder: 'signatures',
          originalName: signature.originalname,
        })
      : null;

    return this.prisma.professional.create({
      data: {
        fullName: dto.fullName,
        professionalTitle: dto.professionalTitle,
        licenseNumber: dto.licenseNumber,
        signatureStorageKey: signatureKey,
      },
    });
  }

  async update(id: string, dto: UpdateProfessionalDto) {
    await this.findById(id);
    return this.prisma.professional.update({
      where: { id },
      data: dto,
    });
  }

  async updateSignature(id: string, signature: Express.Multer.File) {
    const current = await this.findById(id);
    const newKey = await this.storage.save(signature.buffer, {
      contentType: signature.mimetype,
      folder: 'signatures',
      originalName: signature.originalname,
    });

    const updated = await this.prisma.professional.update({
      where: { id },
      data: { signatureStorageKey: newKey },
    });

    if (current.signatureStorageKey && current.signatureStorageKey !== newKey) {
      // Best-effort: si falla el borrado del anterior no rompemos la operacion.
      this.storage.delete(current.signatureStorageKey).catch(() => undefined);
    }

    return updated;
  }

  async softDelete(id: string, actor?: AuthUser) {
    const pro = await this.findById(id);
    await this.prisma.professional.update({
      where: { id },
      data: { deletedAt: new Date(), status: CatalogStatus.inactive },
    });
    this.events.emit(AppEvents.AuditEvent, {
      action: 'professional.soft_deleted',
      entityType: 'professional',
      entityId: id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Profesional ${pro.fullName} eliminado`,
      metadata: { licenseNumber: pro.licenseNumber },
    });
  }
}
