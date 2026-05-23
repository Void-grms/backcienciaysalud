import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';
import { StorageService } from '@shared/storage/storage.service';

import { UpdateLabConfigDto } from './dto/update-lab-config.dto';

@Injectable()
export class LabConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  async get() {
    const lab = await this.prisma.labConfig.findFirst();
    if (!lab) {
      throw new NotFoundException('No hay configuracion de laboratorio cargada');
    }
    return lab;
  }

  async update(dto: UpdateLabConfigDto, actor?: AuthUser) {
    const current = await this.get();
    const updated = await this.prisma.labConfig.update({
      where: { id: current.id },
      data: dto,
    });
    this.events.emit(AppEvents.AuditEvent, {
      action: 'lab_config.updated',
      entityType: 'lab_config',
      entityId: current.id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Configuracion del laboratorio actualizada`,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async updateLogo(file: Express.Multer.File, actor?: AuthUser) {
    const current = await this.get();
    const key = await this.storage.save(file.buffer, {
      contentType: file.mimetype,
      folder: 'logos',
      originalName: file.originalname,
    });
    const updated = await this.prisma.labConfig.update({
      where: { id: current.id },
      data: { logoStorageKey: key },
    });
    if (current.logoStorageKey && current.logoStorageKey !== key) {
      this.storage.delete(current.logoStorageKey).catch(() => undefined);
    }
    this.events.emit(AppEvents.AuditEvent, {
      action: 'lab_config.logo_updated',
      entityType: 'lab_config',
      entityId: current.id,
      actorUserId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      summary: `Logo del laboratorio actualizado`,
      metadata: { storageKey: key, size: file.size, contentType: file.mimetype },
    });
    return updated;
  }
}
