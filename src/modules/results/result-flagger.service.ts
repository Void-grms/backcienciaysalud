import { Injectable } from '@nestjs/common';
import {
  Patient,
  PhysiologicalState,
  Prisma,
  ReferenceRange,
  ResultFlag,
  ResultType,
  Test,
} from '@prisma/client';

import { RangeResolverService } from '@modules/catalog/reference-ranges/range-resolver.service';
import { birthDateToAgeDays } from '@shared/utils/age';

export interface FlagResult {
  flag: ResultFlag;
  appliedRangeId: string | null;
}

// minCritical/maxCritical de Test ya no se usan para flaggear — los criticos
// viven en ReferenceRange. Los dejamos en el tipo por compatibilidad con
// callers existentes que sigan armando el objeto Test completo.
type TestForFlag = Pick<Test, 'id' | 'resultType'>;
type PatientForFlag = Pick<Patient, 'sex' | 'birthDate'> & {
  physiologicalState?: PhysiologicalState | null;
};

@Injectable()
export class ResultFlaggerService {
  constructor(private readonly rangeResolver: RangeResolverService) {}

  // Implementa las reglas RN-01/RN-04 del plan:
  //  - critico tiene prioridad sobre normal/alto/bajo
  //  - rango aplicable = mas especifico segun sexo/edad/estado (resolver)
  //  - cualitativas comparan contra `qualitative_expected`
  //  - text/observation no se marcan
  async compute(
    test: TestForFlag,
    patient: PatientForFlag,
    value: { numeric: Prisma.Decimal | number | null; text: string | null },
  ): Promise<FlagResult> {
    if (test.resultType === ResultType.text || test.resultType === ResultType.observation) {
      return { flag: ResultFlag.none, appliedRangeId: null };
    }

    const ageDays = patient.birthDate ? birthDateToAgeDays(patient.birthDate) : 0;
    const range = await this.rangeResolver.resolve(test.id, {
      sex: patient.sex,
      ageDays,
      physiologicalState: patient.physiologicalState ?? null,
    });

    if (test.resultType === ResultType.qualitative) {
      return this.flagQualitative(range, value.text);
    }

    // Numerica: requiere valor numerico para marcar; si no llego nada, queda sin marca.
    if (value.numeric == null) {
      return { flag: ResultFlag.none, appliedRangeId: range?.id ?? null };
    }
    return this.flagNumeric(test, range, this.toNumber(value.numeric));
  }

  private flagQualitative(range: ReferenceRange | null, text: string | null): FlagResult {
    if (!range?.qualitativeExpected) {
      return { flag: ResultFlag.none, appliedRangeId: range?.id ?? null };
    }
    if (!text) {
      return { flag: ResultFlag.abnormal, appliedRangeId: range.id };
    }
    const equal = text.trim().toUpperCase() === range.qualitativeExpected.trim().toUpperCase();
    return {
      flag: equal ? ResultFlag.normal : ResultFlag.abnormal,
      appliedRangeId: range.id,
    };
  }

  private flagNumeric(_test: TestForFlag, range: ReferenceRange | null, value: number): FlagResult {
    if (!range) {
      return { flag: ResultFlag.none, appliedRangeId: null };
    }
    // Criticos van primero: si caen en panico, no nos importa el resto.
    if (range.criticalMin != null && value <= this.toNumber(range.criticalMin)) {
      return { flag: ResultFlag.critical_low, appliedRangeId: range.id };
    }
    if (range.criticalMax != null && value >= this.toNumber(range.criticalMax)) {
      return { flag: ResultFlag.critical_high, appliedRangeId: range.id };
    }
    if (range.valueMin != null && value < this.toNumber(range.valueMin)) {
      return { flag: ResultFlag.low, appliedRangeId: range.id };
    }
    if (range.valueMax != null && value > this.toNumber(range.valueMax)) {
      return { flag: ResultFlag.high, appliedRangeId: range.id };
    }
    return { flag: ResultFlag.normal, appliedRangeId: range.id };
  }

  private toNumber(v: Prisma.Decimal | number | string): number {
    if (typeof v === 'number') return v;
    return Number(v.toString());
  }
}
