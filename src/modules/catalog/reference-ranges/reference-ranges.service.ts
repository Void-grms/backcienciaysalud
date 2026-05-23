import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReferenceRange } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';

import { CreateReferenceRangeDto } from './dto/create-reference-range.dto';
import { UpdateReferenceRangeDto } from './dto/update-reference-range.dto';

@Injectable()
export class ReferenceRangesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTest(testId: string) {
    await this.assertTestExists(testId);
    return this.prisma.referenceRange.findMany({
      where: { testId, effectiveTo: null },
      orderBy: [{ priority: 'desc' }, { sex: 'asc' }, { ageMinDays: 'asc' }],
    });
  }

  async create(testId: string, dto: CreateReferenceRangeDto, changedBy?: string) {
    await this.assertTestExists(testId);
    this.assertRangeConsistent(dto);

    return this.prisma.referenceRange.create({
      data: {
        testId,
        sex: dto.sex,
        ageMinDays: dto.ageMinDays,
        ageMaxDays: dto.ageMaxDays,
        physiologicalState: dto.physiologicalState,
        valueMin: dto.valueMin,
        valueMax: dto.valueMax,
        qualitativeExpected: dto.qualitativeExpected,
        displayText: dto.displayText,
        priority: dto.priority ?? 0,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      },
    });
  }

  async update(id: string, dto: UpdateReferenceRangeDto, changedBy?: string) {
    const current = await this.prisma.referenceRange.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rango referencial no encontrado');

    const merged = { ...current, ...dto };
    this.assertRangeConsistent({
      valueMin: merged.valueMin == null ? undefined : Number(merged.valueMin),
      valueMax: merged.valueMax == null ? undefined : Number(merged.valueMax),
      ageMinDays: merged.ageMinDays ?? undefined,
      ageMaxDays: merged.ageMaxDays ?? undefined,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.snapshot(tx, current, changedBy);
      return tx.referenceRange.update({
        where: { id },
        data: {
          sex: dto.sex,
          ageMinDays: dto.ageMinDays,
          ageMaxDays: dto.ageMaxDays,
          physiologicalState: dto.physiologicalState,
          valueMin: dto.valueMin,
          valueMax: dto.valueMax,
          qualitativeExpected: dto.qualitativeExpected,
          displayText: dto.displayText,
          priority: dto.priority,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
          version: { increment: 1 },
        },
      });
    });
  }

  async markAsHistoric(id: string, changedBy?: string) {
    const current = await this.prisma.referenceRange.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rango referencial no encontrado');
    if (current.effectiveTo) {
      return current;
    }
    return this.prisma.$transaction(async (tx) => {
      await this.snapshot(tx, current, changedBy);
      return tx.referenceRange.update({
        where: { id },
        data: { effectiveTo: new Date() },
      });
    });
  }

  private async assertTestExists(testId: string): Promise<void> {
    const test = await this.prisma.test.findFirst({
      where: { id: testId, deletedAt: null },
      select: { id: true },
    });
    if (!test) throw new NotFoundException('Prueba no encontrada');
  }

  private assertRangeConsistent(dto: {
    valueMin?: number;
    valueMax?: number;
    ageMinDays?: number;
    ageMaxDays?: number;
  }): void {
    if (dto.valueMin != null && dto.valueMax != null && dto.valueMin > dto.valueMax) {
      throw new BadRequestException('valueMin no puede ser mayor que valueMax');
    }
    if (dto.ageMinDays != null && dto.ageMaxDays != null && dto.ageMinDays > dto.ageMaxDays) {
      throw new BadRequestException('ageMinDays no puede ser mayor que ageMaxDays');
    }
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    current: ReferenceRange,
    changedBy?: string,
  ): Promise<void> {
    await tx.referenceRangeHistory.create({
      data: {
        rangeId: current.id,
        testId: current.testId,
        version: current.version,
        sex: current.sex,
        ageMinDays: current.ageMinDays,
        ageMaxDays: current.ageMaxDays,
        physiologicalState: current.physiologicalState,
        valueMin: current.valueMin,
        valueMax: current.valueMax,
        qualitativeExpected: current.qualitativeExpected,
        displayText: current.displayText,
        priority: current.priority,
        validFrom: current.updatedAt,
        validTo: new Date(),
        changedByUserId: changedBy ?? null,
      },
    });
  }
}
