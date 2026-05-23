import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Patient, Result, ResultType, Test } from '@prisma/client';

import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';

import { OrdersService } from '@modules/orders/orders.service';

import { BulkSaveDto } from './dto/bulk-save.dto';
import { SetResultDto } from './dto/set-result.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';
import { ResultFlaggerService } from './result-flagger.service';

interface ResolvedItem {
  itemId: string;
  testId: string;
  test: Pick<Test, 'id' | 'resultType' | 'minCritical' | 'maxCritical'>;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly flagger: ResultFlaggerService,
    private readonly events: EventEmitter2,
  ) {}

  async listForOrder(orderId: string, actor: AuthUser) {
    const order = await this.orders.findByIdOrCode(orderId, actor);
    return this.prisma.result.findMany({
      where: { orderId: order.id },
      include: {
        appliedRange: true,
        orderItem: {
          select: {
            id: true,
            displayOrder: true,
            test: { select: { id: true, code: true, name: true, unit: true, resultType: true } },
          },
        },
      },
      orderBy: { orderItem: { displayOrder: 'asc' } },
    });
  }

  async setOne(orderId: string, itemId: string, dto: SetResultDto, actor: AuthUser) {
    const order = await this.orders.getOrderForResultEdit(orderId, actor);
    const item = await this.requireItem(order.id, itemId);
    const patient = await this.requirePatient(order.patientId);

    this.assertValueMatchesType(item.test.resultType, dto.valueNumeric, dto.valueText);

    const { flag, appliedRangeId } = await this.flagger.compute(item.test, patient, {
      numeric: dto.valueNumeric ?? null,
      text: dto.valueText ?? null,
    });

    const result = await this.prisma.result.upsert({
      where: { orderItemId: item.itemId },
      update: {
        valueNumeric: dto.valueNumeric ?? null,
        valueText: dto.valueText ?? null,
        observation: dto.observation ?? null,
        flag,
        appliedRangeId,
        enteredByUserId: actor.sub,
        enteredAt: new Date(),
      },
      create: {
        orderId: order.id,
        orderItemId: item.itemId,
        testId: item.testId,
        valueNumeric: dto.valueNumeric ?? null,
        valueText: dto.valueText ?? null,
        observation: dto.observation ?? null,
        flag,
        appliedRangeId,
        enteredByUserId: actor.sub,
        enteredAt: new Date(),
      },
    });

    await this.orders.moveToInProgressIfDraft(order.id, actor);

    this.events.emit(AppEvents.AuditEvent, {
      action: 'result.set',
      entityType: 'order_item',
      entityId: item.itemId,
      actorUserId: actor.sub,
      actorRole: actor.role,
      summary: `Resultado capturado para item ${item.itemId} (orden ${order.code})`,
      metadata: {
        orderId: order.id,
        orderCode: order.code,
        testId: item.testId,
        flag,
      },
    });

    return result;
  }

  async bulkSave(orderId: string, dto: BulkSaveDto, actor: AuthUser) {
    const order = await this.orders.getOrderForResultEdit(orderId, actor);
    const patient = await this.requirePatient(order.patientId);

    const itemIds = dto.entries.map((e) => e.orderItemId);
    const items = await this.prisma.orderItem.findMany({
      where: { id: { in: itemIds }, orderId: order.id },
      include: {
        test: { select: { id: true, resultType: true, minCritical: true, maxCritical: true } },
      },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const persisted: Result[] = [];
    const ignored: { orderItemId: string; reason: string }[] = [];

    // Procesamos secuencialmente para que el flag de cada uno use el resolver
    // sin race conditions. La carga real es baja (decenas de items por orden).
    for (const entry of dto.entries) {
      const item = itemMap.get(entry.orderItemId);
      if (!item) {
        ignored.push({ orderItemId: entry.orderItemId, reason: 'no pertenece a la orden' });
        continue;
      }
      try {
        this.assertValueMatchesType(item.test.resultType, entry.valueNumeric, entry.valueText);
      } catch (err) {
        ignored.push({
          orderItemId: entry.orderItemId,
          reason: err instanceof Error ? err.message : 'tipo de valor invalido',
        });
        continue;
      }

      const { flag, appliedRangeId } = await this.flagger.compute(item.test, patient, {
        numeric: entry.valueNumeric ?? null,
        text: entry.valueText ?? null,
      });

      const saved = await this.prisma.result.upsert({
        where: { orderItemId: item.id },
        update: {
          ...(entry.valueNumeric !== undefined ? { valueNumeric: entry.valueNumeric ?? null } : {}),
          ...(entry.valueText !== undefined ? { valueText: entry.valueText ?? null } : {}),
          ...(entry.observation !== undefined ? { observation: entry.observation ?? null } : {}),
          flag,
          appliedRangeId,
          enteredByUserId: actor.sub,
          enteredAt: new Date(),
        },
        create: {
          orderId: order.id,
          orderItemId: item.id,
          testId: item.testId,
          valueNumeric: entry.valueNumeric ?? null,
          valueText: entry.valueText ?? null,
          observation: entry.observation ?? null,
          flag,
          appliedRangeId,
          enteredByUserId: actor.sub,
          enteredAt: new Date(),
        },
      });
      persisted.push(saved);
    }

    await this.orders.moveToInProgressIfDraft(order.id, actor);

    if (persisted.length > 0) {
      this.events.emit(AppEvents.AuditEvent, {
        action: 'result.bulk_saved',
        entityType: 'order',
        entityId: order.id,
        actorUserId: actor.sub,
        actorRole: actor.role,
        summary: `Bulk-save: ${persisted.length} resultados en ${order.code}`,
        metadata: {
          orderCode: order.code,
          saved: persisted.length,
          ignored: ignored.length,
        },
      });
    }

    return { saved: persisted.length, ignored, results: persisted };
  }

  async setObservation(
    orderId: string,
    itemId: string,
    dto: UpdateObservationDto,
    actor: AuthUser,
  ) {
    const order = await this.orders.getOrderForResultEdit(orderId, actor);
    const item = await this.requireItem(order.id, itemId);

    return this.prisma.result.upsert({
      where: { orderItemId: item.itemId },
      update: {
        observation: dto.observation ?? null,
        enteredByUserId: actor.sub,
        enteredAt: new Date(),
      },
      create: {
        orderId: order.id,
        orderItemId: item.itemId,
        testId: item.testId,
        observation: dto.observation ?? null,
        enteredByUserId: actor.sub,
        enteredAt: new Date(),
      },
    });
  }

  // ----- Helpers -----

  private async requireItem(orderId: string, itemId: string): Promise<ResolvedItem> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: {
        test: { select: { id: true, resultType: true, minCritical: true, maxCritical: true } },
      },
    });
    if (!item) throw new NotFoundException('Item no encontrado en la orden');
    return { itemId: item.id, testId: item.testId, test: item.test };
  }

  private async requirePatient(patientId: string): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  private assertValueMatchesType(
    type: ResultType,
    numeric: number | null | undefined,
    text: string | null | undefined,
  ): void {
    if (type === ResultType.numeric) {
      if (text != null && text.trim() !== '') {
        throw new BadRequestException('La prueba es numerica, no acepta valueText');
      }
    } else {
      if (numeric != null) {
        throw new BadRequestException('Solo las pruebas numericas aceptan valueNumeric');
      }
    }
  }
}
