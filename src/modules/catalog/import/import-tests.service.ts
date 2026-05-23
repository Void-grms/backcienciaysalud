import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CatalogStatus, ImportJob, ImportJobStatus, Prisma, ResultType } from '@prisma/client';
import * as ExcelJS from 'exceljs';

import { PrismaService } from '@shared/prisma/prisma.service';

import {
  ImportError,
  ImportPayload,
  ImportSummary,
  ParsedCategoryRow,
  ParsedRangeRow,
  ParsedTestRow,
} from './types';
import { XlsxParserService } from './xlsx-parser.service';

const IMPORT_JOB_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class ImportTestsService {
  private readonly logger = new Logger(ImportTestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: XlsxParserService,
  ) {}

  async dryRun(file: Buffer, filename: string | undefined, actorId: string): Promise<ImportJob> {
    const { payload, errors } = await this.parser.parse(file);

    const semanticErrors = await this.validateSemantically(payload);
    const allErrors = [...errors, ...semanticErrors];

    const summary = await this.buildSummary(payload, allErrors);

    return this.prisma.importJob.create({
      data: {
        type: 'tests',
        status: ImportJobStatus.pending_confirmation,
        createdByUserId: actorId,
        filename: filename?.slice(0, 255),
        summary: summary as unknown as Prisma.InputJsonValue,
        payload: payload as unknown as Prisma.InputJsonValue,
        errors: allErrors as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IMPORT_JOB_TTL_MS),
      },
    });
  }

  async confirm(importToken: string): Promise<{ summary: ImportSummary; jobId: string }> {
    const job = await this.prisma.importJob.findUnique({ where: { id: importToken } });
    if (!job) throw new NotFoundException('Job de importacion no encontrado');
    if (job.status !== ImportJobStatus.pending_confirmation) {
      throw new BadRequestException(`Job en estado ${job.status}, no se puede confirmar`);
    }
    if (job.expiresAt.getTime() < Date.now()) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: ImportJobStatus.expired },
      });
      throw new BadRequestException('El job de importacion ha expirado');
    }

    const errors = job.errors as unknown as ImportError[];
    if (errors.length > 0) {
      throw new BadRequestException(
        `No se puede confirmar: hay ${errors.length} errores. Corregelos y reintenta.`,
      );
    }

    const payload = job.payload as unknown as ImportPayload;

    await this.prisma.$transaction(async (tx) => {
      await this.applyCategories(tx, payload.categories);
      const testIdByCode = await this.applyTests(tx, payload.tests);
      await this.applyRanges(tx, payload.ranges, testIdByCode);
    });

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.confirmed, confirmedAt: new Date() },
    });

    return { summary: job.summary as unknown as ImportSummary, jobId: job.id };
  }

  async generateErrorsXlsx(importToken: string): Promise<{ buffer: Buffer; filename: string }> {
    const job = await this.prisma.importJob.findUnique({ where: { id: importToken } });
    if (!job) throw new NotFoundException('Job de importacion no encontrado');

    const errors = job.errors as unknown as ImportError[];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Errores');
    ws.columns = [
      { header: 'Hoja', key: 'sheet', width: 14 },
      { header: 'Fila', key: 'row', width: 6 },
      { header: 'Columna', key: 'column', width: 22 },
      { header: 'Mensaje', key: 'message', width: 60 },
    ];
    ws.getRow(1).font = { bold: true };
    errors.forEach((e) => ws.addRow(e));

    const ab = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(ab as ArrayBuffer),
      filename: `errores-import-${job.id}.xlsx`,
    };
  }

  // ---- Validacion semantica (post-parser) ----

  private async validateSemantically(payload: ImportPayload): Promise<ImportError[]> {
    const errors: ImportError[] = [];

    const knownCategoryNames = new Set<string>(payload.categories.map((c) => c.name.toLowerCase()));
    const existingCategories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { name: true },
    });
    existingCategories.forEach((c) => knownCategoryNames.add(c.name.toLowerCase()));

    for (const test of payload.tests) {
      if (!knownCategoryNames.has(test.categoryName.toLowerCase())) {
        errors.push({
          sheet: 'Pruebas',
          row: test.rowNumber,
          column: 'categoria',
          message: `categoria "${test.categoryName}" no existe (creala en la hoja Categorias o en el sistema)`,
        });
      }
    }

    const knownTestCodes = new Set<string>(payload.tests.map((t) => t.code.toLowerCase()));
    const existingTests = await this.prisma.test.findMany({
      where: { deletedAt: null },
      select: { code: true },
    });
    existingTests.forEach((t) => knownTestCodes.add(t.code.toLowerCase()));

    for (const range of payload.ranges) {
      if (!knownTestCodes.has(range.testCode.toLowerCase())) {
        errors.push({
          sheet: 'Rangos',
          row: range.rowNumber,
          column: 'codigo_prueba',
          message: `prueba "${range.testCode}" no existe (definila en la hoja Pruebas o en el sistema)`,
        });
      }
    }

    return errors;
  }

  private async buildSummary(
    payload: ImportPayload,
    errors: ImportError[],
  ): Promise<ImportSummary> {
    const existingCategoryNames = new Set(
      (await this.prisma.category.findMany({ select: { name: true } })).map((c) => c.name),
    );
    const existingTestCodes = new Set(
      (await this.prisma.test.findMany({ select: { code: true } })).map((t) => t.code),
    );

    const catToCreate = payload.categories.filter((c) => !existingCategoryNames.has(c.name)).length;
    const catToUpdate = payload.categories.length - catToCreate;

    const testsToCreate = payload.tests.filter((t) => !existingTestCodes.has(t.code)).length;
    const testsToUpdate = payload.tests.length - testsToCreate;

    return {
      categories: { rows: payload.categories.length, toCreate: catToCreate, toUpdate: catToUpdate },
      tests: { rows: payload.tests.length, toCreate: testsToCreate, toUpdate: testsToUpdate },
      ranges: { rows: payload.ranges.length, toCreate: payload.ranges.length },
      errorCount: errors.length,
    };
  }

  // ---- Aplicacion en transaccion ----

  private async applyCategories(
    tx: Prisma.TransactionClient,
    rows: ParsedCategoryRow[],
  ): Promise<void> {
    for (const row of rows) {
      await tx.category.upsert({
        where: { name: row.name },
        update: {
          description: row.description ?? undefined,
          color: row.color ?? undefined,
          displayOrder: row.displayOrder ?? undefined,
        },
        create: {
          name: row.name,
          description: row.description ?? undefined,
          color: row.color ?? '#0F766E',
          displayOrder: row.displayOrder ?? 0,
        },
      });
    }
  }

  private async applyTests(
    tx: Prisma.TransactionClient,
    rows: ParsedTestRow[],
  ): Promise<Map<string, string>> {
    const categories = await tx.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    const testIdByCode = new Map<string, string>();
    for (const row of rows) {
      const categoryId = categoryIdByName.get(row.categoryName.toLowerCase());
      if (!categoryId) {
        throw new Error(`Categoria "${row.categoryName}" no encontrada al aplicar pruebas`);
      }

      const existing = await tx.test.findFirst({
        where: { code: row.code, deletedAt: null },
      });

      let testId: string;
      if (existing) {
        await tx.testHistory.create({
          data: {
            testId: existing.id,
            version: existing.version,
            code: existing.code,
            name: existing.name,
            shortName: existing.shortName,
            categoryId: existing.categoryId,
            resultType: existing.resultType,
            unit: existing.unit,
            method: existing.method,
            decimals: existing.decimals,
            minCritical: existing.minCritical,
            maxCritical: existing.maxCritical,
            referenceText: existing.referenceText,
            professionalId: existing.professionalId,
            status: existing.status,
            validFrom: existing.updatedAt,
            validTo: new Date(),
          },
        });
        const updated = await tx.test.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            shortName: row.shortName,
            categoryId,
            resultType: row.resultType,
            unit: row.unit,
            method: row.method,
            decimals: row.decimals,
            minCritical: row.minCritical,
            maxCritical: row.maxCritical,
            referenceText: row.referenceText,
            status: CatalogStatus.active,
            version: { increment: 1 },
          },
        });
        testId = updated.id;
        await tx.testOption.deleteMany({ where: { testId } });
      } else {
        const created = await tx.test.create({
          data: {
            code: row.code,
            name: row.name,
            shortName: row.shortName,
            categoryId,
            resultType: row.resultType,
            unit: row.unit,
            method: row.method,
            decimals: row.decimals,
            minCritical: row.minCritical,
            maxCritical: row.maxCritical,
            referenceText: row.referenceText,
            status: CatalogStatus.active,
          },
        });
        testId = created.id;
      }

      if (row.resultType === ResultType.qualitative && row.options.length > 0) {
        await tx.testOption.createMany({
          data: row.options.map((value, idx) => ({
            testId,
            value,
            displayOrder: idx,
          })),
        });
      }

      testIdByCode.set(row.code.toLowerCase(), testId);
    }
    return testIdByCode;
  }

  private async applyRanges(
    tx: Prisma.TransactionClient,
    rows: ParsedRangeRow[],
    testIdByCode: Map<string, string>,
  ): Promise<void> {
    const existingTests = await tx.test.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true },
    });
    existingTests.forEach((t) => {
      const key = t.code.toLowerCase();
      if (!testIdByCode.has(key)) testIdByCode.set(key, t.id);
    });

    for (const row of rows) {
      const testId = testIdByCode.get(row.testCode.toLowerCase());
      if (!testId) {
        throw new Error(`Prueba "${row.testCode}" no encontrada al aplicar rangos`);
      }
      await tx.referenceRange.create({
        data: {
          testId,
          sex: row.sex,
          ageMinDays: row.ageMinDays ?? null,
          ageMaxDays: row.ageMaxDays ?? null,
          physiologicalState: row.physiologicalState ?? null,
          valueMin: row.valueMin ?? null,
          valueMax: row.valueMax ?? null,
          qualitativeExpected: row.qualitativeExpected ?? null,
          displayText: row.displayText ?? null,
          priority: row.priority,
        },
      });
    }
  }
}
