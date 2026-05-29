import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderState, Prisma, ResultType, Sex } from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

import type { Env } from '@config/env.validation';
import type { AuthUser } from '@shared/auth/auth-user';
import { PrismaService } from '@shared/prisma/prisma.service';
import { StorageService } from '@shared/storage/storage.service';

import { OrdersService } from '@modules/orders/orders.service';

import { PdfService } from './pdf.service';
import { ReportTokenService } from './report-token.service';
import {
  ReportCategoryGroup,
  ReportContext,
  ReportPanelGroup,
  ReportProfessional,
  ReportRangeLine,
  ReportResultRow,
} from './report-context';
import { TemplateRendererService } from './template-renderer.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly renderer: TemplateRendererService,
    private readonly tokens: ReportTokenService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ----- API publica del servicio -----

  // Devuelve el PDF actual de la orden, generandolo si aun no existe.
  async getPdf(orderId: string, actor: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.orders.findByIdOrCode(orderId, actor);
    if (
      order.state !== OrderState.validated &&
      order.state !== OrderState.delivered &&
      order.state !== OrderState.amended
    ) {
      throw new ConflictException(
        `La orden esta en estado ${order.state}; aun no se puede generar el informe`,
      );
    }

    const latest = await this.prisma.report.findFirst({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
    });

    if (latest) {
      const file = await this.storage.get(latest.pdfStorageKey).catch(() => null);
      if (file) return { buffer: file.buffer, filename: `${order.code}.pdf` };
      // El binario fue borrado del storage: regeneramos preservando version.
      this.logger.warn(`PDF perdido en storage para reporte ${latest.id}; regenerando`);
    }

    const report = await this.renderAndPersist(order.id, actor.sub);
    const file = await this.storage.get(report.pdfStorageKey);
    return { buffer: file.buffer, filename: `${order.code}.pdf` };
  }

  // Fuerza una nueva version del PDF (registra Report version = N+1).
  async regenerate(orderId: string, actor: AuthUser) {
    const order = await this.orders.findByIdOrCode(orderId, actor);
    if (order.state === OrderState.draft || order.state === OrderState.in_progress) {
      throw new ConflictException(
        `La orden esta en estado ${order.state}; no se puede regenerar el informe`,
      );
    }
    return this.renderAndPersist(order.id, actor.sub);
  }

  async listVersions(orderId: string, actor: AuthUser) {
    const order = await this.orders.findByIdOrCode(orderId, actor);
    return this.prisma.report.findMany({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        hashSha256: true,
        generatedAt: true,
        generatedByUserId: true,
      },
    });
  }

  // Datos minimos para verificacion publica.
  async verify(token: string) {
    const record = await this.tokens.resolve(token);
    const order = record.report.order;
    const patient = order.patient;

    const professionals = await this.loadProfessionals(order.id);

    return {
      verified: true,
      orderCode: order.code,
      reportVersion: record.report.version,
      validatedAt: order.validatedAt,
      deliveredAt: order.deliveredAt,
      isAmended: order.state === OrderState.amended,
      laboratory: await this.loadLabPublic(),
      patient: {
        initials: this.initials(patient.firstName, patient.lastName),
        documentMasked: this.maskDocument(patient.documentNumber),
      },
      professionals: professionals.map((p) => ({
        fullName: p.fullName,
        professionalTitle: p.professionalTitle,
        licenseNumber: p.licenseNumber,
      })),
    };
  }

  // ----- Render + persistencia -----

  private async renderAndPersist(orderId: string, actorId: string) {
    // 1. Calcular siguiente version y prepara un placeholder de Report.
    //    Necesitamos el report.id para crear el token y luego embeber el QR.
    const previous = await this.prisma.report.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (previous?.version ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          orderId,
          version: nextVersion,
          pdfStorageKey: '',
          hashSha256: '',
          generatedByUserId: actorId,
        },
      });
      const token = await this.tokens.ensureToken(report.id, tx);

      // 2. Construir el contexto y renderizar HTML.
      const ctx = await this.buildContext(orderId, nextVersion, token);
      const html = await this.renderer.render(ctx);

      // 3. PDF + almacenamiento.
      const buffer = await this.pdf.renderHtmlToPdf(html);
      const storageKey = await this.storage.save(buffer, {
        contentType: 'application/pdf',
        folder: 'reports',
      });
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // 4. Confirmar metadatos en Report.
      return tx.report.update({
        where: { id: report.id },
        data: { pdfStorageKey: storageKey, hashSha256: hash },
      });
    });
  }

  // ----- Construccion del contexto Handlebars -----

  private async buildContext(
    orderId: string,
    reportVersion: number,
    token: string,
  ): Promise<ReportContext> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        patient: true,
        reference: { select: { name: true } },
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            test: {
              include: {
                category: { select: { id: true, name: true, color: true, displayOrder: true } },
                ranges: {
                  // Solo rangos vigentes: effectiveTo null o futuro. Orden por
                  // prioridad descendente para que los mas especificos salgan
                  // primero en la columna del reporte.
                  where: { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
                  orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                },
              },
            },
            panel: { select: { id: true, name: true } },
            result: { include: { appliedRange: true } },
          },
        },
        previousOrder: { select: { code: true } },
      },
    });

    const lab = await this.loadLabConfigForReport();
    const professionals = await this.loadProfessionals(orderId);
    const verificationUrl = this.tokens.buildVerificationUrl(token);
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    });

    return {
      lab,
      patient: {
        fullName: `${order.patient.firstName} ${order.patient.lastName}`,
        documentType: order.patient.documentType,
        documentNumber: order.patient.documentNumber,
        birthDate: order.patient.birthDate?.toISOString() ?? null,
        sex: order.patient.sex === Sex.M ? 'M' : order.patient.sex === Sex.F ? 'F' : 'N/E',
        age: this.formatAge(order.patient.birthDate),
      },
      order: {
        code: order.code,
        state: order.state,
        isAmended: order.state === OrderState.amended || !!order.previousOrderId,
        previousCode: order.previousOrder?.code ?? null,
        requestingDoctor: order.requestingDoctor,
        reference: order.reference?.name ?? null,
        sampleTakenAt: this.fmtDate(order.sampleTakenAt),
        validatedAt: this.fmtDate(order.validatedAt),
        deliveredAt: this.fmtDate(order.deliveredAt),
      },
      categories: this.groupByCategory(order.items),
      professionals,
      flagsLegend: this.buildFlagsLegend(order.items),
      qrDataUrl,
      verificationUrl,
      reportVersion,
      generatedAt: this.fmtDate(new Date()) ?? '',
    };
  }

  // Detecta los flags que aparecen al menos una vez en el informe y devuelve
  // su definicion humana para la leyenda al pie de los resultados. Solo
  // listamos lo que el usuario ve marcado (no toda la enumeracion).
  private buildFlagsLegend(
    items: Prisma.OrderItemGetPayload<{
      include: { result: true };
    }>[],
  ): { code: string; label: string }[] {
    const FLAG_DEFINITIONS: Record<string, { code: string; label: string }> = {
      high: { code: 'H', label: 'Resultado por encima del valor referencial' },
      low: { code: 'L', label: 'Resultado por debajo del valor referencial' },
      critical_high: { code: 'HH', label: 'Resultado en zona crítica alta (panico)' },
      critical_low: { code: 'LL', label: 'Resultado en zona crítica baja (panico)' },
      abnormal: { code: '!', label: 'Resultado fuera del valor esperado' },
    };
    const seen = new Set<string>();
    for (const it of items) {
      const f = it.result?.flag;
      if (f && FLAG_DEFINITIONS[f]) seen.add(f);
    }
    return Array.from(seen).flatMap((f) => {
      const def = FLAG_DEFINITIONS[f];
      return def ? [def] : [];
    });
  }

  private groupByCategory(
    items: Prisma.OrderItemGetPayload<{
      include: {
        test: {
          include: {
            category: { select: { id: true; name: true; color: true; displayOrder: true } };
            ranges: true;
          };
        };
        panel: { select: { id: true; name: true } };
        result: { include: { appliedRange: true } };
      };
    }>[],
  ): ReportCategoryGroup[] {
    // Estructura: categoria -> panel (o null) -> rows[].
    // Orden de paneles: orden del primer item del panel (preservamos
    // displayOrder del OrderItem). Orden de categorias: cat.displayOrder.
    type PanelBucket = ReportPanelGroup & { _order: number };
    type CatBucket = {
      categoryName: string;
      categoryColor: string;
      _order: number;
      panels: Map<string, PanelBucket>;
      hasMethod: boolean;
    };
    const cats = new Map<string, CatBucket>();

    for (const it of items) {
      const cat = it.test.category;
      let catBucket = cats.get(cat.id);
      if (!catBucket) {
        catBucket = {
          categoryName: cat.name,
          categoryColor: cat.color,
          _order: cat.displayOrder,
          panels: new Map(),
          hasMethod: false,
        };
        cats.set(cat.id, catBucket);
      }
      if (it.test.method) catBucket.hasMethod = true;

      const panelKey = it.panel?.id ?? '__loose__';
      let panel = catBucket.panels.get(panelKey);
      if (!panel) {
        panel = {
          panelName: it.panel?.name ?? null,
          rows: [],
          _order: it.displayOrder,
        };
        catBucket.panels.set(panelKey, panel);
      }

      panel.rows.push(this.buildRow(it));
    }

    return Array.from(cats.values())
      .sort((a, b) => a._order - b._order)
      .map((c) => ({
        categoryName: c.categoryName,
        categoryColor: c.categoryColor,
        showMethodColumn: c.hasMethod,
        panels: Array.from(c.panels.values())
          .sort((a, b) => a._order - b._order)
          .map(({ _order, ...p }) => p),
      }));
  }

  private buildRow(
    it: Prisma.OrderItemGetPayload<{
      include: {
        test: { include: { ranges: true } };
        result: { include: { appliedRange: true } };
      };
    }>,
  ): ReportResultRow {
    const appliedId = it.result?.appliedRangeId ?? null;
    const lines: ReportRangeLine[] = it.test.ranges.map((r) => ({
      text: this.formatRange(r, it.test.resultType, it.test.decimals),
      highlighted: appliedId != null && r.id === appliedId,
    }));

    return {
      testName: it.test.name,
      testCode: it.test.code,
      unit: it.test.unit,
      method: it.test.method,
      resultType: it.test.resultType,
      decimals: it.test.decimals,
      valueNumeric: it.result?.valueNumeric != null ? Number(it.result.valueNumeric) : null,
      valueText: it.result?.valueText ?? null,
      observation: it.result?.observation ?? null,
      flag: it.result?.flag ?? 'none',
      ranges: lines,
    };
  }

  // Si el rango trae `displayText` lo respetamos literal (asi el catalogo
  // controla la presentacion final, ej. "VARONES: 14 - 18 gr/dl"). Si no,
  // armamos el texto desde valueMin/valueMax o qualitativeExpected.
  private formatRange(
    r: {
      displayText: string | null;
      qualitativeExpected: string | null;
      valueMin: Prisma.Decimal | null;
      valueMax: Prisma.Decimal | null;
    },
    resultType: ResultType,
    decimals: number,
  ): string {
    if (r.displayText && r.displayText.trim()) return r.displayText.trim();
    if (resultType === ResultType.qualitative && r.qualitativeExpected) {
      return r.qualitativeExpected;
    }
    const min = r.valueMin != null ? this.formatNum(Number(r.valueMin), decimals) : null;
    const max = r.valueMax != null ? this.formatNum(Number(r.valueMax), decimals) : null;
    if (min != null && max != null) return `${min} - ${max}`;
    if (min != null) return `≥ ${min}`;
    if (max != null) return `≤ ${max}`;
    return '—';
  }

  private formatNum(n: number, decimals: number): string {
    return n.toLocaleString('es-PE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  private async loadProfessionals(orderId: string): Promise<ReportProfessional[]> {
    // Recolectamos los profesionales firmantes "responsables" de los items
    // (test.professional o category.defaultProfessional).
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: {
        test: { select: { professionalId: true, categoryId: true } },
      },
    });
    const catIds = Array.from(new Set(items.map((i) => i.test.categoryId)));
    const cats = await this.prisma.category.findMany({
      where: { id: { in: catIds } },
      select: { id: true, defaultProfessionalId: true },
    });
    const catById = new Map(cats.map((c) => [c.id, c]));

    const proIds = new Set<string>();
    for (const it of items) {
      const id = it.test.professionalId ?? catById.get(it.test.categoryId)?.defaultProfessionalId;
      if (id) proIds.add(id);
    }
    if (proIds.size === 0) return [];

    const pros = await this.prisma.professional.findMany({
      where: { id: { in: Array.from(proIds) }, deletedAt: null },
      select: {
        fullName: true,
        professionalTitle: true,
        licenseNumber: true,
        signatureStorageKey: true,
      },
      orderBy: { fullName: 'asc' },
    });

    return pros.map((p) => ({
      fullName: p.fullName,
      professionalTitle: p.professionalTitle,
      licenseNumber: p.licenseNumber,
      signatureUrl: p.signatureStorageKey ? this.storageUrl(p.signatureStorageKey) : null,
    }));
  }

  private async loadLabConfigForReport() {
    const lab = await this.prisma.labConfig.findFirst();
    if (!lab) throw new NotFoundException('Lab config no cargada');
    return {
      commercialName: lab.commercialName,
      taxId: lab.taxId,
      address: lab.address,
      phone: lab.phone,
      email: lab.email,
      primaryColor: lab.primaryColor,
      logoUrl: lab.logoStorageKey ? this.storageUrl(lab.logoStorageKey) : null,
      headerHtml: lab.headerHtml,
      footerHtml: lab.footerHtml,
    };
  }

  private async loadLabPublic() {
    const lab = await this.prisma.labConfig.findFirst({
      select: { commercialName: true, taxId: true },
    });
    return lab ?? { commercialName: 'Laboratorio', taxId: null };
  }

  // ----- Helpers de presentacion -----

  private storageUrl(key: string): string {
    const base = this.config.get('APP_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/api/v1/storage/${key}`;
  }

  private fmtDate(d: Date | null): string | null {
    if (!d) return null;
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Lima',
    }).format(d);
  }

  private formatAge(birthDate: Date | null): string {
    if (!birthDate) return '—';
    const ms = Date.now() - birthDate.getTime();
    const years = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
    if (years >= 1) return `${years} anos`;
    const months = Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
    if (months >= 1) return `${months} meses`;
    const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    return `${days} dias`;
  }

  private initials(first: string, last: string): string {
    return `${first?.[0] ?? ''}.${last?.[0] ?? ''}.`;
  }

  private maskDocument(doc: string): string {
    if (doc.length <= 4) return '****';
    return `${doc.slice(0, 2)}${'*'.repeat(doc.length - 4)}${doc.slice(-2)}`;
  }
}
