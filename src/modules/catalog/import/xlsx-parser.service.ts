import { Injectable } from '@nestjs/common';
import { PhysiologicalState, ResultType, Sex } from '@prisma/client';
import * as ExcelJS from 'exceljs';

import { ageToDays, AgeUnit } from '@shared/utils/age';

import {
  ImportError,
  ImportPayload,
  ParsedCategoryRow,
  ParsedRangeRow,
  ParsedTestRow,
} from './types';

interface ParseResult {
  payload: ImportPayload;
  errors: ImportError[];
}

@Injectable()
export class XlsxParserService {
  async parse(file: Buffer): Promise<ParseResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ArrayBuffer);

    const errors: ImportError[] = [];

    const categories = this.parseCategories(wb, errors);
    const tests = this.parseTests(wb, errors);
    const ranges = this.parseRanges(wb, errors);

    return { payload: { categories, tests, ranges }, errors };
  }

  private parseCategories(wb: ExcelJS.Workbook, errors: ImportError[]): ParsedCategoryRow[] {
    const ws = wb.getWorksheet('Categorias');
    if (!ws) return [];
    const out: ParsedCategoryRow[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (this.isEmptyRow(row)) return;

      const name = this.str(row, 1);
      const description = this.str(row, 2);
      const color = this.str(row, 3);
      const displayOrder = this.int(row, 4);

      if (!name) {
        errors.push({
          sheet: 'Categorias',
          row: rowNumber,
          column: 'nombre',
          message: 'requerido',
        });
        return;
      }
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        errors.push({
          sheet: 'Categorias',
          row: rowNumber,
          column: 'color_hex',
          message: 'formato invalido, debe ser #RRGGBB',
        });
      }
      out.push({ rowNumber, name, description, color, displayOrder });
    });
    return out;
  }

  private parseTests(wb: ExcelJS.Workbook, errors: ImportError[]): ParsedTestRow[] {
    const ws = wb.getWorksheet('Pruebas');
    if (!ws) return [];
    const out: ParsedTestRow[] = [];
    const seenCodes = new Set<string>();

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (this.isEmptyRow(row)) return;

      const code = this.str(row, 1);
      const name = this.str(row, 2);
      const shortName = this.str(row, 3);
      const categoryName = this.str(row, 4);
      const resultTypeRaw = this.str(row, 5)?.toLowerCase();
      const unit = this.str(row, 6);
      const method = this.str(row, 7);
      const decimals = this.int(row, 8) ?? 2;
      const minCritical = this.num(row, 9);
      const maxCritical = this.num(row, 10);
      const referenceText = this.str(row, 11);
      const optionsRaw = this.str(row, 12) ?? '';

      let ok = true;
      const fail = (column: string, message: string) => {
        errors.push({ sheet: 'Pruebas', row: rowNumber, column, message });
        ok = false;
      };

      if (!code) fail('codigo', 'requerido');
      if (!name) fail('nombre', 'requerido');
      if (!categoryName) fail('categoria', 'requerido');
      if (!resultTypeRaw || !this.isResultType(resultTypeRaw)) {
        fail('tipo_resultado', 'debe ser numeric|text|qualitative|observation');
      }
      if (code && seenCodes.has(code)) {
        fail('codigo', `codigo duplicado en la hoja (${code})`);
      }
      if (code) seenCodes.add(code);

      if (!ok) return;

      const options = optionsRaw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);

      const resultType = resultTypeRaw as ResultType;
      if (resultType === ResultType.qualitative && options.length < 2) {
        errors.push({
          sheet: 'Pruebas',
          row: rowNumber,
          column: 'opciones_cualitativas',
          message: 'cualitativa requiere al menos 2 opciones separadas por |',
        });
        return;
      }
      if (resultType !== ResultType.qualitative && options.length > 0) {
        errors.push({
          sheet: 'Pruebas',
          row: rowNumber,
          column: 'opciones_cualitativas',
          message: 'solo pruebas cualitativas pueden tener opciones',
        });
        return;
      }

      out.push({
        rowNumber,
        code: code!,
        name: name!,
        shortName,
        categoryName: categoryName!,
        resultType,
        unit,
        method,
        decimals,
        minCritical,
        maxCritical,
        referenceText,
        options,
      });
    });
    return out;
  }

  private parseRanges(wb: ExcelJS.Workbook, errors: ImportError[]): ParsedRangeRow[] {
    const ws = wb.getWorksheet('Rangos');
    if (!ws) return [];
    const out: ParsedRangeRow[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (this.isEmptyRow(row)) return;

      const testCode = this.str(row, 1);
      const sexRaw = (this.str(row, 2) ?? 'A').toUpperCase();
      const ageMinValue = this.num(row, 3);
      const ageMinUnit = this.str(row, 4)?.toLowerCase();
      const ageMaxValue = this.num(row, 5);
      const ageMaxUnit = this.str(row, 6)?.toLowerCase();
      const physiologicalStateRaw = this.str(row, 7)?.toLowerCase();
      const valueMin = this.num(row, 8);
      const valueMax = this.num(row, 9);
      const qualitativeExpected = this.str(row, 10);
      const displayText = this.str(row, 11);
      const priority = this.int(row, 12) ?? 0;

      let ok = true;
      const fail = (column: string, message: string) => {
        errors.push({ sheet: 'Rangos', row: rowNumber, column, message });
        ok = false;
      };

      if (!testCode) fail('codigo_prueba', 'requerido');
      if (!['M', 'F', 'A'].includes(sexRaw)) fail('sexo', 'debe ser M, F o A');

      const ageMinDays = this.resolveAge(
        ageMinValue,
        ageMinUnit,
        'edad_min_unidad',
        rowNumber,
        fail,
      );
      const ageMaxDays = this.resolveAge(
        ageMaxValue,
        ageMaxUnit,
        'edad_max_unidad',
        rowNumber,
        fail,
      );

      let physiologicalState: PhysiologicalState | null = null;
      if (physiologicalStateRaw && physiologicalStateRaw !== 'none') {
        if (!this.isPhysiologicalState(physiologicalStateRaw)) {
          fail('estado_fisiologico', 'debe ser pregnancy|lactation|none');
        } else {
          physiologicalState = physiologicalStateRaw as PhysiologicalState;
        }
      }

      if (valueMin == null && valueMax == null && !qualitativeExpected && !displayText) {
        fail('valor_min', 'el rango no tiene contenido (ni valores ni texto)');
      }

      if (!ok) return;

      out.push({
        rowNumber,
        testCode: testCode!,
        sex: sexRaw as Sex,
        ageMinDays,
        ageMaxDays,
        physiologicalState,
        valueMin,
        valueMax,
        qualitativeExpected,
        displayText,
        priority,
      });
    });
    return out;
  }

  private resolveAge(
    value: number | null,
    unit: string | undefined,
    column: string,
    row: number,
    fail: (column: string, message: string) => void,
  ): number | null {
    if (value == null) return null;
    if (!unit || !['d', 'm', 'a'].includes(unit)) {
      fail(column, "unidad requerida ('d', 'm' o 'a')");
      return null;
    }
    return ageToDays(value, unit as AgeUnit);
  }

  private isResultType(s: string): s is ResultType {
    return (['numeric', 'text', 'qualitative', 'observation'] as const).includes(s as ResultType);
  }

  private isPhysiologicalState(s: string): s is PhysiologicalState {
    return (['none', 'pregnancy', 'lactation'] as const).includes(s as PhysiologicalState);
  }

  private isEmptyRow(row: ExcelJS.Row): boolean {
    const values = row.values as unknown[];
    return !values.slice(1).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  }

  private str(row: ExcelJS.Row, col: number): string | null {
    const v = row.getCell(col).value;
    if (v == null) return null;
    const s = typeof v === 'object' && 'text' in v ? String(v.text) : String(v);
    const trimmed = s.trim();
    return trimmed === '' ? null : trimmed;
  }

  private num(row: ExcelJS.Row, col: number): number | null {
    const v = row.getCell(col).value;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private int(row: ExcelJS.Row, col: number): number | null {
    const n = this.num(row, col);
    return n == null ? null : Math.trunc(n);
  }
}
