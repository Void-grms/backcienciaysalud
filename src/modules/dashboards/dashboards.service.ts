import { Injectable } from '@nestjs/common';
import { OrderState, Prisma, ResultFlag } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';

export interface DashboardOverview {
  ordersByState: Record<OrderState, number>;
  totalsToday: { orders: number; results: number; deliveries: number };
  totalsLast7d: { orders: number; results: number; deliveries: number };
  totalsLast30d: { orders: number; results: number; deliveries: number };
  pendingValidation: number;
  criticalsLast7d: number;
  topTests: Array<{ testId: string; code: string; name: string; count: number }>;
  topReferences: Array<{ referenceId: string; name: string; count: number }>;
  newPatientsLast30d: number;
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<DashboardOverview> {
    // Calculamos rangos con fechas en runtime (no constantes globales) para
    // que el dashboard refleje siempre "ahora menos N dias", no el momento
    // del module load.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Ejecutamos todo en paralelo: agregados independientes, no necesitamos
    // ordering. $transaction garantiza misma snapshot de DB.
    const [
      stateGroups,
      ordersToday,
      ordersLast7d,
      ordersLast30d,
      resultsToday,
      resultsLast7d,
      resultsLast30d,
      deliveriesToday,
      deliveriesLast7d,
      deliveriesLast30d,
      pendingValidation,
      criticalsLast7d,
      newPatientsLast30d,
      topTestsRaw,
      topRefsRaw,
    ] = await this.prisma.$transaction([
      this.prisma.order.groupBy({
        by: ['state'],
        where: { deletedAt: null },
        _count: { state: true },
        orderBy: { state: 'asc' },
      }),
      this.prisma.order.count({ where: { deletedAt: null, createdAt: { gte: startOfToday } } }),
      this.prisma.order.count({ where: { deletedAt: null, createdAt: { gte: last7d } } }),
      this.prisma.order.count({ where: { deletedAt: null, createdAt: { gte: last30d } } }),

      this.prisma.result.count({ where: { enteredAt: { gte: startOfToday } } }),
      this.prisma.result.count({ where: { enteredAt: { gte: last7d } } }),
      this.prisma.result.count({ where: { enteredAt: { gte: last30d } } }),

      this.prisma.order.count({
        where: { deletedAt: null, deliveredAt: { gte: startOfToday } },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, deliveredAt: { gte: last7d } },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, deliveredAt: { gte: last30d } },
      }),

      this.prisma.order.count({
        where: { deletedAt: null, state: OrderState.in_progress },
      }),

      // El enum tiene `critical_high` y `critical_low` separados; los sumamos
      // para reportar "criticos" sin distinguir direccion.
      this.prisma.result.count({
        where: {
          flag: { in: [ResultFlag.critical_high, ResultFlag.critical_low] },
          enteredAt: { gte: last7d },
        },
      }),

      this.prisma.patient.count({
        where: { deletedAt: null, createdAt: { gte: last30d } },
      }),

      // Top pruebas por cantidad de items en ordenes de los ultimos 30 dias.
      this.prisma.orderItem.groupBy({
        by: ['testId'],
        where: { order: { deletedAt: null, createdAt: { gte: last30d } } },
        _count: { testId: true },
        orderBy: { _count: { testId: 'desc' } },
        take: 5,
      }),

      // Top referencias por cantidad de ordenes de los ultimos 30 dias.
      this.prisma.order.groupBy({
        by: ['referenceId'],
        where: { deletedAt: null, createdAt: { gte: last30d }, referenceId: { not: null } },
        _count: { referenceId: true },
        orderBy: { _count: { referenceId: 'desc' } },
        take: 5,
      }),
    ]);

    // Hidratamos ids con nombres en una segunda pasada (sin transaccion: los
    // ids salieron del agregado anterior y el catalogo cambia poco).
    const testIds = topTestsRaw.map((t) => t.testId);
    const refIds = topRefsRaw.map((r) => r.referenceId).filter((id): id is string => id !== null);

    const [tests, refs] = await Promise.all([
      testIds.length > 0
        ? this.prisma.test.findMany({
            where: { id: { in: testIds } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; code: string; name: string }>),
      refIds.length > 0
        ? this.prisma.reference.findMany({
            where: { id: { in: refIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    const testById = new Map(tests.map((t) => [t.id, t]));
    const refById = new Map(refs.map((r) => [r.id, r]));

    const ordersByState = this.zeroFilledStateMap();
    for (const g of stateGroups) {
      // Prisma tipa `_count` como union (true | { state: number }) cuando se
      // pasa shape; estrechamos en runtime para acceder al numero real.
      const c = g._count;
      const value = typeof c === 'object' && c !== null && 'state' in c ? (c.state ?? 0) : 0;
      ordersByState[g.state] = value;
    }

    return {
      ordersByState,
      totalsToday: {
        orders: ordersToday,
        results: resultsToday,
        deliveries: deliveriesToday,
      },
      totalsLast7d: {
        orders: ordersLast7d,
        results: resultsLast7d,
        deliveries: deliveriesLast7d,
      },
      totalsLast30d: {
        orders: ordersLast30d,
        results: resultsLast30d,
        deliveries: deliveriesLast30d,
      },
      pendingValidation,
      criticalsLast7d,
      newPatientsLast30d,
      topTests: topTestsRaw
        .map((t) => {
          const meta = testById.get(t.testId);
          const c = t._count;
          const count = typeof c === 'object' && c !== null && 'testId' in c ? (c.testId ?? 0) : 0;
          return meta
            ? {
                testId: t.testId,
                code: meta.code,
                name: meta.name,
                count,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      topReferences: topRefsRaw
        .map((r) => {
          if (!r.referenceId) return null;
          const meta = refById.get(r.referenceId);
          const c = r._count;
          const count =
            typeof c === 'object' && c !== null && 'referenceId' in c ? (c.referenceId ?? 0) : 0;
          return meta
            ? {
                referenceId: r.referenceId,
                name: meta.name,
                count,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }

  // Serie temporal diaria (ordenes creadas vs entregadas) de los ultimos N dias.
  async dailyTimeline(
    days = 30,
  ): Promise<Array<{ date: string; created: number; delivered: number }>> {
    const bounded = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - bounded * 24 * 60 * 60 * 1000);

    // Usamos $queryRaw porque groupBy no soporta funciones de fecha. Cast a
    // text explicito para evitar problemas de timezone al serializar.
    const created = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(
      Prisma.sql`
        SELECT date_trunc('day', created_at) AS day, count(*) AS count
        FROM orders
        WHERE deleted_at IS NULL AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    );
    const delivered = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(
      Prisma.sql`
        SELECT date_trunc('day', delivered_at) AS day, count(*) AS count
        FROM orders
        WHERE deleted_at IS NULL AND delivered_at IS NOT NULL AND delivered_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    );

    const map = new Map<string, { created: number; delivered: number }>();
    for (const c of created) {
      const key = c.day.toISOString().slice(0, 10);
      const row = map.get(key) ?? { created: 0, delivered: 0 };
      row.created = Number(c.count);
      map.set(key, row);
    }
    for (const d of delivered) {
      const key = d.day.toISOString().slice(0, 10);
      const row = map.get(key) ?? { created: 0, delivered: 0 };
      row.delivered = Number(d.count);
      map.set(key, row);
    }

    return Array.from(map.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private zeroFilledStateMap(): Record<OrderState, number> {
    return {
      [OrderState.draft]: 0,
      [OrderState.in_progress]: 0,
      [OrderState.validated]: 0,
      [OrderState.delivered]: 0,
      [OrderState.amended]: 0,
      [OrderState.cancelled]: 0,
    };
  }
}
