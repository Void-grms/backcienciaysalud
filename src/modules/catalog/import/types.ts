import { PhysiologicalState, ResultType, Sex } from '@prisma/client';

export interface ParsedCategoryRow {
  rowNumber: number;
  name: string;
  description: string | null;
  color: string | null;
  displayOrder: number | null;
}

export interface ParsedTestRow {
  rowNumber: number;
  code: string;
  name: string;
  shortName: string | null;
  categoryName: string;
  resultType: ResultType;
  unit: string | null;
  method: string | null;
  decimals: number;
  minCritical: number | null;
  maxCritical: number | null;
  referenceText: string | null;
  options: string[];
}

export interface ParsedRangeRow {
  rowNumber: number;
  testCode: string;
  sex: Sex;
  ageMinDays: number | null;
  ageMaxDays: number | null;
  physiologicalState: PhysiologicalState | null;
  valueMin: number | null;
  valueMax: number | null;
  qualitativeExpected: string | null;
  displayText: string | null;
  priority: number;
}

export interface ImportError {
  sheet: 'Categorias' | 'Pruebas' | 'Rangos';
  row: number;
  column: string;
  message: string;
}

export interface ImportSummary {
  categories: { rows: number; toCreate: number; toUpdate: number };
  tests: { rows: number; toCreate: number; toUpdate: number };
  ranges: { rows: number; toCreate: number };
  errorCount: number;
}

export interface ImportPayload {
  categories: ParsedCategoryRow[];
  tests: ParsedTestRow[];
  ranges: ParsedRangeRow[];
}
