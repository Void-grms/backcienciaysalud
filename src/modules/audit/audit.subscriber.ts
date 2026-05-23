import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AppEvents, type AuditEvent } from '@shared/events/app-events';

import { AuditService } from './audit.service';

// Suscriptor del evento generico `audit.event`. Hace una unica cosa:
// pasar el payload al AuditService para que lo persista. Separamos esto del
// servicio para no atar la API publica del servicio al event-emitter
// (cualquiera puede llamar `auditService.record(...)` directo si quiere).
@Injectable()
export class AuditSubscriber {
  constructor(private readonly service: AuditService) {}

  @OnEvent(AppEvents.AuditEvent, { async: true })
  async handle(event: AuditEvent): Promise<void> {
    await this.service.record(event);
  }
}
