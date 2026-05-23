import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';

// Genera codigos `ORD-YYYY-NNNNNN` de forma atomica.
//
// Estrategia: UPSERT en `order_sequences` con `last_number + 1` y RETURNING.
// Postgres ejecuta el ON CONFLICT ... DO UPDATE en una sola sentencia
// atomica con bloqueo de fila, asi que la concurrencia esta cubierta sin
// necesidad de SELECT FOR UPDATE explicito. La fila por ano se crea bajo
// demanda; no hay setup previo.
@Injectable()
export class OrderCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async nextCode(tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const year = new Date().getFullYear();

    const rows = await client.$queryRaw<{ last_number: bigint }[]>`
      INSERT INTO order_sequences (year, last_number)
      VALUES (${year}, 1)
      ON CONFLICT (year)
      DO UPDATE SET last_number = order_sequences.last_number + 1
      RETURNING last_number
    `;
    const next = Number(rows[0]?.last_number ?? 0);
    if (!next) {
      throw new Error('No se pudo generar el codigo de orden');
    }
    return `ORD-${year}-${String(next).padStart(6, '0')}`;
  }
}
