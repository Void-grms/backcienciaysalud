import { Injectable } from '@nestjs/common';
import { PhysiologicalState, ReferenceRange, Sex } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';

export interface PatientContext {
  sex: Sex;
  ageDays: number;
  physiologicalState?: PhysiologicalState | null;
}

@Injectable()
export class RangeResolverService {
  constructor(private readonly prisma: PrismaService) {}

  // RN-01: dado un test + paciente, devuelve el rango aplicable (o null).
  // Estrategia: filtrar todos los rangos vigentes del test y desempatar por
  // especificidad (mas restrictivo gana) y `priority` (mayor gana).
  async resolve(testId: string, patient: PatientContext): Promise<ReferenceRange | null> {
    const today = new Date();
    const candidates = await this.prisma.referenceRange.findMany({
      where: {
        testId,
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
          { effectiveFrom: { lte: today } },
        ],
      },
    });

    const matches = candidates.filter((r) => this.applies(r, patient));
    if (matches.length === 0) return null;

    matches.sort((a, b) => this.specificity(b) - this.specificity(a) || b.priority - a.priority);
    return matches[0] ?? null;
  }

  private applies(range: ReferenceRange, patient: PatientContext): boolean {
    if (range.sex !== Sex.A && range.sex !== patient.sex) return false;
    if (range.ageMinDays != null && patient.ageDays < range.ageMinDays) return false;
    if (range.ageMaxDays != null && patient.ageDays > range.ageMaxDays) return false;
    if (range.physiologicalState && range.physiologicalState !== PhysiologicalState.none) {
      if (range.physiologicalState !== patient.physiologicalState) return false;
    }
    return true;
  }

  // Cuanto mas campos esten "fijados" (no comodines), mas especifico es el rango.
  private specificity(range: ReferenceRange): number {
    let score = 0;
    if (range.sex !== Sex.A) score += 4;
    if (range.ageMinDays != null) score += 1;
    if (range.ageMaxDays != null) score += 1;
    if (range.physiologicalState && range.physiologicalState !== PhysiologicalState.none) {
      score += 2;
    }
    return score;
  }
}
