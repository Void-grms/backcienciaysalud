import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// Genera la plantilla oficial de importacion de pruebas.
// 3 hojas: Categorias, Pruebas, Rangos. Cada una con encabezados y un ejemplo.
@Injectable()
export class ImportTemplateService {
  async buildTestsTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Laboratorio Clinico';
    wb.created = new Date();

    this.buildCategoriesSheet(wb);
    this.buildTestsSheet(wb);
    this.buildRangesSheet(wb);
    this.buildReadmeSheet(wb);

    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(ab as ArrayBuffer);
  }

  private buildReadmeSheet(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet('Leeme');
    ws.columns = [{ header: 'Instrucciones', key: 'text', width: 100 }];
    const lines = [
      'Plantilla de importacion masiva de pruebas.',
      '',
      'Convencion de edades: 1 ano = 365 dias, 1 mes = 30 dias.',
      'En la hoja Rangos se acepta valor + unidad ("a" para anos, "m" meses, "d" dias).',
      'El sistema almacena internamente la edad en dias.',
      '',
      'Sexo: M (masculino), F (femenino), A (cualquiera).',
      '',
      'Tipos de resultado validos: numeric, text, qualitative, observation.',
      '',
      'Estado fisiologico: pregnancy, lactation, none (o dejar vacio).',
    ];
    lines.forEach((line) => ws.addRow({ text: line }));
  }

  private buildCategoriesSheet(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet('Categorias');
    ws.columns = [
      { header: 'nombre', key: 'name', width: 30 },
      { header: 'descripcion', key: 'description', width: 40 },
      { header: 'color_hex', key: 'color', width: 12 },
      { header: 'orden', key: 'displayOrder', width: 10 },
    ];
    this.styleHeader(ws);
    ws.addRow({
      name: 'Hematologia',
      description: 'Pruebas hematologicas',
      color: '#DC2626',
      displayOrder: 1,
    });
  }

  private buildTestsSheet(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet('Pruebas');
    ws.columns = [
      { header: 'codigo', key: 'code', width: 12 },
      { header: 'nombre', key: 'name', width: 35 },
      { header: 'nombre_corto', key: 'shortName', width: 18 },
      { header: 'categoria', key: 'category', width: 20 },
      { header: 'tipo_resultado', key: 'resultType', width: 14 },
      { header: 'unidad', key: 'unit', width: 12 },
      { header: 'metodo', key: 'method', width: 25 },
      { header: 'decimales', key: 'decimals', width: 10 },
      { header: 'critico_min', key: 'minCritical', width: 12 },
      { header: 'critico_max', key: 'maxCritical', width: 12 },
      { header: 'texto_referencia', key: 'referenceText', width: 40 },
      { header: 'opciones_cualitativas', key: 'options', width: 30 },
    ];
    this.styleHeader(ws);
    ws.addRow({
      code: 'GLU',
      name: 'Glucosa serica',
      shortName: 'Glucosa',
      category: 'Bioquimica',
      resultType: 'numeric',
      unit: 'mg/dL',
      method: 'Cinetica enzimatica',
      decimals: 0,
      minCritical: 40,
      maxCritical: 500,
      referenceText: 'Ayuno: 70-99 mg/dL',
      options: '',
    });
    ws.addRow({
      code: 'DENGUE-IGG',
      name: 'Dengue IgG',
      shortName: 'Dengue IgG',
      category: 'Inmunologia',
      resultType: 'qualitative',
      unit: '',
      method: 'Inmunocromatografia',
      decimals: 0,
      minCritical: '',
      maxCritical: '',
      referenceText: '',
      options: 'POSITIVO|NEGATIVO',
    });
  }

  private buildRangesSheet(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet('Rangos');
    ws.columns = [
      { header: 'codigo_prueba', key: 'testCode', width: 14 },
      { header: 'sexo', key: 'sex', width: 6 },
      { header: 'edad_min_valor', key: 'ageMinValue', width: 14 },
      { header: 'edad_min_unidad', key: 'ageMinUnit', width: 14 },
      { header: 'edad_max_valor', key: 'ageMaxValue', width: 14 },
      { header: 'edad_max_unidad', key: 'ageMaxUnit', width: 14 },
      { header: 'estado_fisiologico', key: 'physiologicalState', width: 18 },
      { header: 'valor_min', key: 'valueMin', width: 12 },
      { header: 'valor_max', key: 'valueMax', width: 12 },
      { header: 'esperado_cualitativo', key: 'qualitativeExpected', width: 18 },
      { header: 'texto_mostrar', key: 'displayText', width: 30 },
      { header: 'prioridad', key: 'priority', width: 10 },
    ];
    this.styleHeader(ws);
    ws.addRow({
      testCode: 'GLU',
      sex: 'A',
      ageMinValue: 1,
      ageMinUnit: 'a',
      ageMaxValue: '',
      ageMaxUnit: '',
      physiologicalState: '',
      valueMin: 70,
      valueMax: 99,
      qualitativeExpected: '',
      displayText: '70 - 99 mg/dL',
      priority: 0,
    });
    ws.addRow({
      testCode: 'DENGUE-IGG',
      sex: 'A',
      ageMinValue: '',
      ageMinUnit: '',
      ageMaxValue: '',
      ageMaxUnit: '',
      physiologicalState: '',
      valueMin: '',
      valueMax: '',
      qualitativeExpected: 'NEGATIVO',
      displayText: '',
      priority: 0,
    });
  }

  private styleHeader(ws: ExcelJS.Worksheet): void {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    row.alignment = { vertical: 'middle', horizontal: 'left' };
    row.height = 22;
  }
}
