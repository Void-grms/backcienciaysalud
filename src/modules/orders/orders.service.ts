import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderState,
  Prisma,
  UserRole,
} from '@prisma/client';

import type { AuthUser } from '@shared/auth/auth-user';
import { AppEvents, AuditEvent, OrderDeliveredEvent } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { AddOrderItemDto } from './dto/add-order-item.dto';
import { AmendOrderDto } from './dto/amend-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto, OrderPanelEntryDto, OrderTestEntryDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderCodeService } from './order-code.service';
import {
  assertTransition,
  canEditItems,
  canEditMetadata,
} from './order-state';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeService: OrderCodeService,
    private readonly events: EventEmitter2,
  ) {}

  // ----- Lectura -----

  async list(query: ListOrdersDto, actor: AuthUser): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;
    const where = this.buildOwnershipWhere(actor);

    if (query.state) where.state = query.state;
    if (query.patientId) where.patientId = query.patientId;
    if (query.referenceId) where.referenceId = query.referenceId;
    if (query.code) where.code = { contains: query.code, mode: 'insensitive' };
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { requestingDoctor: { contains: query.search, mode: 'insensitive' } },
        { patient: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { patient: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { patient: { documentNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
          reference: { select: { id: true, name: true } },
          _count: { select: { items: true, results: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findByIdOrCode(idOrCode: string, actor: AuthUser) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrCode,
    );
    const where: Prisma.OrderWhereInput = {
      ...(isUuid ? { id: idOrCode } : { code: idOrCode }),
      deletedAt: null,
    };

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        patient: true,
        reference: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        validatedBy: { select: { id: true, fullName: true, email: true } },
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            test: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                resultType: true,
                categoryId: true,
                decimals: true,
              },
            },
            panel: { select: { id: true, code: true, name: true } },
            result: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Orden no encontrada');
    this.assertCanRead(order, actor);
    return order;
  }

  // ----- Creacion -----

  async create(dto: CreateOrderDto, actor: AuthUser) {
    if (!dto.tests?.length && !dto.panels?.length) {
      throw new BadRequestException('La orden requiere al menos una prueba o panel');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
    });
    if (!patient) throw new BadRequestException('Paciente no encontrado');

    if (dto.referenceId) {
      const ref = await this.prisma.reference.findFirst({
        where: { id: dto.referenceId, deletedAt: null },
      });
      if (!ref) throw new BadRequestException('Referencia no encontrada');
    }

    const items = await this.resolveItems(dto.tests ?? [], dto.panels ?? []);
    if (items.length === 0) {
      throw new BadRequestException('La orden no resolvio ninguna prueba');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const code = await this.codeService.nextCode(tx);
      const created = await tx.order.create({
        data: {
          code,
          patientId: dto.patientId,
          referenceId: dto.referenceId ?? null,
          requestingDoctor: dto.requestingDoctor,
          clinicalInfo: dto.clinicalInfo,
          sampleTakenAt: dto.sampleTakenAt ? new Date(dto.sampleTakenAt) : null,
          state: OrderState.draft,
          createdByUserId: actor.sub,
          items: {
            create: items.map((it, idx) => ({
              testId: it.testId,
              testVersion: it.testVersion,
              panelId: it.panelId,
              displayOrder: idx,
            })),
          },
        },
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
            include: {
              test: { select: { id: true, code: true, name: true, unit: true, resultType: true } },
              panel: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: created.id,
          fromState: OrderState.draft,
          toState: OrderState.draft,
          actorUserId: actor.sub,
          reason: 'Creacion',
        },
      });

      return created;
    });

    this.events.emit(AppEvents.AuditEvent, {
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      actorUserId: actor.sub,
      actorRole: actor.role,
      summary: `Orden ${order.code} creada con ${order.items.length} pruebas`,
      metadata: { code: order.code, itemsCount: order.items.length },
    });

    return order;
  }

  async update(id: string, dto: UpdateOrderDto, actor: AuthUser) {
    const order = await this.getEditable(id, actor, canEditMetadata, 'metadatos');

    if (dto.referenceId !== undefined && dto.referenceId !== null) {
      const ref = await this.prisma.reference.findFirst({
        where: { id: dto.referenceId, deletedAt: null },
      });
      if (!ref) throw new BadRequestException('Referencia no encontrada');
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        referenceId: dto.referenceId,
        requestingDoctor: dto.requestingDoctor,
        clinicalInfo: dto.clinicalInfo,
        sampleTakenAt: dto.sampleTakenAt ? new Date(dto.sampleTakenAt) : undefined,
      },
    });
  }

  // ----- Items -----

  async addItem(orderId: string, dto: AddOrderItemDto, actor: AuthUser) {
    const order = await this.getEditable(orderId, actor, canEditItems, 'items');

    if (!dto.testId && !dto.panelId) {
      throw new BadRequestException('Debes enviar testId o panelId');
    }

    const items = await this.resolveItems(
      dto.testId ? [{ testId: dto.testId }] : [],
      dto.panelId ? [{ panelId: dto.panelId }] : [],
    );
    if (items.length === 0) {
      throw new BadRequestException('No se resolvio ninguna prueba');
    }

    const existing = await this.prisma.orderItem.findMany({
      where: { orderId: order.id, testId: { in: items.map((i) => i.testId) } },
      select: { testId: true },
    });
    const existingIds = new Set(existing.map((e) => e.testId));
    const newItems = items.filter((i) => !existingIds.has(i.testId));

    if (newItems.length === 0) {
      throw new ConflictException('Las pruebas indicadas ya estan en la orden');
    }

    const lastOrder = await this.prisma.orderItem.findFirst({
      where: { orderId: order.id },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    let nextOrder = (lastOrder?.displayOrder ?? -1) + 1;

    const created = await this.prisma.$transaction(
      newItems.map((it) =>
        this.prisma.orderItem.create({
          data: {
            orderId: order.id,
            testId: it.testId,
            testVersion: it.testVersion,
            panelId: it.panelId,
            displayOrder: nextOrder++,
          },
          include: {
            test: { select: { id: true, code: true, name: true, unit: true, resultType: true } },
            panel: { select: { id: true, code: true, name: true } },
          },
        }),
      ),
    );
    return created;
  }

  async removeItem(orderId: string, itemId: string, actor: AuthUser) {
    const order = await this.getEditable(orderId, actor, canEditItems, 'items');
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId: order.id },
    });
    if (!item) throw new NotFoundException('Item no encontrado en la orden');

    await this.prisma.orderItem.delete({ where: { id: itemId } });
  }

  // ----- Transiciones de estado -----

  async validate(id: string, actor: AuthUser) {
    const order = await this.requireOrder(id);
    this.assertCanWrite(order, actor);
    assertTransition(order.state, OrderState.validated);

    // Reglas de validacion (RN-02, RN-03):
    //  1. Todos los items deben tener resultado con valor.
    //  2. Cada categoria presente debe tener profesional asignado (en test o categoria).
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: order.id },
      include: {
        result: true,
        test: { select: { categoryId: true, professionalId: true, resultType: true } },
      },
    });

    if (items.length === 0) {
      throw new UnprocessableEntityException('La orden no tiene items');
    }

    const missing = items.filter((it) => !this.hasMeaningfulValue(it.result, it.test.resultType));
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Hay ${missing.length} prueba(s) sin resultado`,
      );
    }

    const categoryIds = Array.from(new Set(items.map((i) => i.test.categoryId)));
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, defaultProfessionalId: true },
    });
    const catById = new Map(categories.map((c) => [c.id, c]));
    const missingProfessional: string[] = [];
    for (const it of items) {
      const cat = catById.get(it.test.categoryId);
      if (!it.test.professionalId && !cat?.defaultProfessionalId) {
        missingProfessional.push(cat?.name ?? it.test.categoryId);
      }
    }
    if (missingProfessional.length > 0) {
      const uniq = Array.from(new Set(missingProfessional)).join(', ');
      throw new UnprocessableEntityException(
        `Falta profesional firmante en categorias: ${uniq}`,
      );
    }

    return this.changeState(order.id, order.state, OrderState.validated, actor, {
      validatedAt: new Date(),
      validatedBy: { connect: { id: actor.sub } },
    });
  }

  async deliver(id: string, actor: AuthUser) {
    const order = await this.requireOrder(id);
    this.assertCanWrite(order, actor);
    assertTransition(order.state, OrderState.delivered);
    const updated = await this.changeState(order.id, order.state, OrderState.delivered, actor, {
      deliveredAt: new Date(),
    });

    // Disparo del evento DESPUES del commit, para que el suscriptor pueda
    // leer la orden y generar correos sin race con la transaccion.
    const payload: OrderDeliveredEvent = { orderId: order.id, actorUserId: actor.sub };
    this.events.emit(AppEvents.OrderDelivered, payload);

    return updated;
  }

  async cancel(id: string, dto: CancelOrderDto, actor: AuthUser) {
    const order = await this.requireOrder(id);
    this.assertCanWrite(order, actor);
    assertTransition(order.state, OrderState.cancelled);
    return this.changeState(order.id, order.state, OrderState.cancelled, actor, {
      cancelledAt: new Date(),
      stateReason: dto.reason,
    }, dto.reason);
  }

  // Crea una nueva orden enmienda: clona items+resultados de la original,
  // marca la original como `amended` y enlaza ambas. La nueva queda en
  // `draft` para que el operador la modifique.
  async amend(id: string, dto: AmendOrderDto, actor: AuthUser) {
    const original = await this.requireOrder(id);
    this.assertCanWrite(original, actor);
    assertTransition(original.state, OrderState.amended);

    const items = await this.prisma.orderItem.findMany({
      where: { orderId: original.id },
      include: { result: true },
      orderBy: { displayOrder: 'asc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const code = await this.codeService.nextCode(tx);
      const amended = await tx.order.create({
        data: {
          code,
          patientId: original.patientId,
          referenceId: original.referenceId,
          requestingDoctor: original.requestingDoctor,
          clinicalInfo: original.clinicalInfo,
          sampleTakenAt: original.sampleTakenAt,
          state: OrderState.draft,
          previousOrderId: original.id,
          createdByUserId: actor.sub,
        },
      });

      let displayOrder = 0;
      for (const src of items) {
        const newItem = await tx.orderItem.create({
          data: {
            orderId: amended.id,
            testId: src.testId,
            testVersion: src.testVersion,
            panelId: src.panelId,
            displayOrder: displayOrder++,
          },
        });
        if (src.result) {
          await tx.result.create({
            data: {
              orderId: amended.id,
              orderItemId: newItem.id,
              testId: src.testId,
              valueNumeric: src.result.valueNumeric,
              valueText: src.result.valueText,
              appliedRangeId: src.result.appliedRangeId,
              flag: src.result.flag,
              observation: src.result.observation,
              enteredByUserId: actor.sub,
              enteredAt: new Date(),
            },
          });
        }
      }

      await tx.order.update({
        where: { id: original.id },
        data: { state: OrderState.amended, stateReason: dto.reason },
      });
      await tx.orderEvent.create({
        data: {
          orderId: original.id,
          fromState: original.state,
          toState: OrderState.amended,
          actorUserId: actor.sub,
          reason: dto.reason,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: amended.id,
          fromState: OrderState.draft,
          toState: OrderState.draft,
          actorUserId: actor.sub,
          reason: `Enmienda de ${original.code}`,
        },
      });

      return amended;
    });
  }

  // ----- Helpers internos -----

  private async changeState(
    orderId: string,
    from: OrderState,
    to: OrderState,
    actor: AuthUser,
    extra: Prisma.OrderUpdateInput,
    reason?: string,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { state: to, ...extra },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          fromState: from,
          toState: to,
          actorUserId: actor.sub,
          reason,
        },
      });
      return updated;
    });

    // Auditoria fuera de la transaccion: si el insert falla por cualquier
    // razon (constraint exotica, DB lag), no rollbackeamos el cambio de
    // estado, solo logueamos en AuditService.
    const audit: AuditEvent = {
      action: `order.${to}`,
      entityType: 'order',
      entityId: orderId,
      actorUserId: actor.sub,
      actorRole: actor.role,
      summary: `Orden ${updated.code}: ${from} -> ${to}`,
      metadata: {
        fromState: from,
        toState: to,
        ...(reason ? { reason } : {}),
      },
    };
    this.events.emit(AppEvents.AuditEvent, audit);

    return updated;
  }

  async requireOrder(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }

  // Util para que ResultsService valide ownership y editabilidad sin reimplementar.
  async getOrderForResultEdit(id: string, actor: AuthUser) {
    const order = await this.requireOrder(id);
    this.assertCanWrite(order, actor);
    if (!this.canEditResults(order.state)) {
      throw new ConflictException(
        `No se pueden capturar resultados en estado ${order.state}`,
      );
    }
    return order;
  }

  private canEditResults(state: OrderState): boolean {
    return state === OrderState.draft || state === OrderState.in_progress;
  }

  // Si la orden esta en `draft` y se ingresan resultados, debe pasar a
  // `in_progress`. Llamado por ResultsService despues de cada captura.
  async moveToInProgressIfDraft(orderId: string, actor: AuthUser): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.state !== OrderState.draft) return;
    await this.changeState(
      orderId,
      OrderState.draft,
      OrderState.in_progress,
      actor,
      {},
      'Primer resultado capturado',
    );
  }

  private async getEditable(
    id: string,
    actor: AuthUser,
    predicate: (s: OrderState) => boolean,
    label: string,
  ) {
    const order = await this.requireOrder(id);
    this.assertCanWrite(order, actor);
    if (!predicate(order.state)) {
      throw new ConflictException(
        `No se pueden editar ${label} en estado ${order.state}`,
      );
    }
    return order;
  }

  private async resolveItems(
    tests: OrderTestEntryDto[],
    panels: OrderPanelEntryDto[],
  ): Promise<Array<{ testId: string; testVersion: number; panelId: string | null }>> {
    const seen = new Map<string, { testId: string; testVersion: number; panelId: string | null }>();

    if (tests.length > 0) {
      const testIds = tests.map((t) => t.testId);
      const found = await this.prisma.test.findMany({
        where: { id: { in: testIds }, deletedAt: null },
        select: { id: true, version: true },
      });
      const byId = new Map(found.map((t) => [t.id, t]));
      for (const t of tests) {
        const f = byId.get(t.testId);
        if (!f) throw new BadRequestException(`Prueba ${t.testId} no existe`);
        if (!seen.has(f.id)) {
          seen.set(f.id, { testId: f.id, testVersion: f.version, panelId: t.panelId ?? null });
        }
      }
    }

    if (panels.length > 0) {
      const panelIds = panels.map((p) => p.panelId);
      const found = await this.prisma.panel.findMany({
        where: { id: { in: panelIds }, deletedAt: null },
        include: {
          panelTests: {
            include: { test: { select: { id: true, version: true, deletedAt: true } } },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      const byId = new Map(found.map((p) => [p.id, p]));
      for (const p of panels) {
        const f = byId.get(p.panelId);
        if (!f) throw new BadRequestException(`Panel ${p.panelId} no existe`);
        for (const pt of f.panelTests) {
          if (pt.test.deletedAt) continue;
          if (!seen.has(pt.test.id)) {
            seen.set(pt.test.id, {
              testId: pt.test.id,
              testVersion: pt.test.version,
              panelId: f.id,
            });
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  private buildOwnershipWhere(actor: AuthUser): Prisma.OrderWhereInput {
    const base: Prisma.OrderWhereInput = { deletedAt: null };
    if (actor.role === UserRole.admin) return base;
    if (actor.role === UserRole.patient) {
      return {
        ...base,
        patient: { users: { some: { id: actor.sub } } },
        state: { in: [OrderState.delivered, OrderState.amended] },
      };
    }
    return {
      ...base,
      reference: { users: { some: { id: actor.sub } } },
    };
  }

  private assertCanRead(
    order: { patientId: string; referenceId: string | null; state: OrderState },
    actor: AuthUser,
  ): void {
    if (actor.role === UserRole.admin) return;
    if (actor.role === UserRole.patient) {
      // Para no filtrar existencia, devolvemos 404 cuando no es dueno.
      if (order.state !== OrderState.delivered && order.state !== OrderState.amended) {
        throw new NotFoundException('Orden no encontrada');
      }
      // El chequeo final de pertenencia se hace en el query (ownership where).
      return;
    }
    // reference_user: el ownership where ya filtra; si llegamos aqui es porque tiene acceso.
  }

  private assertCanWrite(_order: { state: OrderState }, actor: AuthUser): void {
    if (actor.role !== UserRole.admin) {
      throw new ForbiddenException('Solo el admin puede modificar ordenes');
    }
  }

  private hasMeaningfulValue(
    result: { valueNumeric: Prisma.Decimal | null; valueText: string | null } | null,
    resultType: import('@prisma/client').ResultType,
  ): boolean {
    if (!result) return false;
    if (resultType === 'numeric') return result.valueNumeric != null;
    return result.valueText != null && result.valueText.trim() !== '';
  }
}
