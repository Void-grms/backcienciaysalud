import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { ReportContext } from './report-context';

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);
  private templateCache: HandlebarsTemplateDelegate<ReportContext> | null = null;

  constructor() {
    this.registerHelpers();
  }

  async render(ctx: ReportContext): Promise<string> {
    const template = await this.getTemplate();
    return template(ctx);
  }

  private async getTemplate(): Promise<HandlebarsTemplateDelegate<ReportContext>> {
    if (this.templateCache) return this.templateCache;
    const file = path.join(__dirname, 'templates', 'default-report.hbs');
    const src = await fs.readFile(file, 'utf-8');
    this.templateCache = Handlebars.compile<ReportContext>(src, { noEscape: false });
    return this.templateCache;
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatNumber', (value: unknown, decimals: unknown) => {
      const n = this.toNumber(value);
      if (n == null) return '—';
      const d = typeof decimals === 'number' ? decimals : Number(decimals ?? 2);
      return n.toLocaleString('es-PE', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
    });

    Handlebars.registerHelper('formatDate', (value: unknown, fmt: unknown) => {
      if (!value) return '—';
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return '—';
      const opts: Intl.DateTimeFormatOptions =
        fmt === 'short'
          ? { day: '2-digit', month: '2-digit', year: 'numeric' }
          : {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            };
      return new Intl.DateTimeFormat('es-PE', opts).format(d);
    });

    Handlebars.registerHelper('flagClass', (flag: unknown) => {
      switch (String(flag)) {
        case 'critical_high':
        case 'critical_low':
          return 'flag-critical';
        case 'high':
        case 'low':
        case 'abnormal':
          return 'flag-abnormal';
        case 'normal':
          return 'flag-normal';
        default:
          return '';
      }
    });

    Handlebars.registerHelper('flagLabel', (flag: unknown) => {
      const map: Record<string, string> = {
        critical_high: '↑↑ Critico alto',
        critical_low: '↓↓ Critico bajo',
        high: '↑ Alto',
        low: '↓ Bajo',
        abnormal: 'Anormal',
        normal: 'Normal',
        none: '',
      };
      return map[String(flag)] ?? '';
    });

    // Marca corta para pintar pill al lado del valor (↑, ↓, ↑↑, ↓↓).
    Handlebars.registerHelper('flagShort', (flag: unknown) => {
      const map: Record<string, string> = {
        critical_high: '↑↑',
        critical_low: '↓↓',
        high: '↑',
        low: '↓',
        abnormal: '!',
      };
      return map[String(flag)] ?? '';
    });

    // True cuando el flag justifica un pill visible (no normal, no none).
    Handlebars.registerHelper('showFlagPill', (flag: unknown) => {
      const s = String(flag);
      return s === 'critical_high' || s === 'critical_low' || s === 'high' || s === 'low' || s === 'abnormal';
    });

    Handlebars.registerHelper('formatRange', (range: unknown) => {
      if (!range) return '—';
      const r = range as {
        valueMin?: unknown;
        valueMax?: unknown;
        qualitativeExpected?: string | null;
        displayText?: string | null;
      };
      if (r.displayText) return r.displayText;
      if (r.qualitativeExpected) return r.qualitativeExpected;
      const min = this.toNumber(r.valueMin);
      const max = this.toNumber(r.valueMax);
      if (min != null && max != null) return `${min} - ${max}`;
      if (min != null) return `≥ ${min}`;
      if (max != null) return `≤ ${max}`;
      return '—';
    });

    Handlebars.registerHelper('ageFromBirth', (birthDate: unknown) => {
      if (!birthDate) return '—';
      const d = birthDate instanceof Date ? birthDate : new Date(String(birthDate));
      if (Number.isNaN(d.getTime())) return '—';
      const ms = Date.now() - d.getTime();
      const years = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
      return `${years} anos`;
    });

    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = Number(value.toString());
    return Number.isFinite(n) ? n : null;
  }
}
