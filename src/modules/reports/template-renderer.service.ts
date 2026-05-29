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

    // Codigo corto que se imprime en el badge al lado del valor. Usamos la
    // convencion internacional H/L/HH/LL en vez de flechas — coincide con
    // la leyenda del pie del informe (flagsLegend) y es lo que el clinico
    // espera leer en un reporte de laboratorio.
    Handlebars.registerHelper('flagShort', (flag: unknown) => {
      const map: Record<string, string> = {
        critical_high: 'HH',
        critical_low: 'LL',
        high: 'H',
        low: 'L',
        abnormal: '!',
      };
      return map[String(flag)] ?? '';
    });

    // SVG inline para los iconos del template. Mantener viewBox 24x24 y
    // stroke="currentColor" para que el color lo defina el contexto CSS.
    // Usar siempre como {{{icon "nombre"}}} (triple llave) o SafeString se
    // encarga del unescaping.
    const ICONS: Record<string, string> = {
      'map-pin':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
      phone:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      'file-text':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
      calendar:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
      clock:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      user:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      flask:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/></svg>',
      'shield-check':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
      info:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>',
    };

    Handlebars.registerHelper('icon', (name: unknown) => {
      const svg = ICONS[String(name)];
      return svg ? new Handlebars.SafeString(svg) : '';
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
