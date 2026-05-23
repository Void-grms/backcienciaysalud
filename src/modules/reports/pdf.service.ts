import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser, LaunchOptions } from 'puppeteer';

import type { Env } from '@config/env.validation';

// Singleton de Chromium: una sola instancia de browser que se reusa entre
// renders. Cerramos solo paginas, no el browser (recomendacion de Puppeteer
// y nota explicita del plan).
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      try {
        const browser = await this.browserPromise;
        await browser.close();
      } catch (err) {
        this.logger.warn(`Error cerrando Chromium: ${(err as Error).message}`);
      }
      this.browserPromise = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launch();
    }
    return this.browserPromise;
  }

  private async launch(): Promise<Browser> {
    // Cargamos puppeteer perezosamente para que el resto de la app pueda
    // arrancar aun si el binario de Chromium no esta disponible en el host.
    const { default: puppeteer } = await import('puppeteer');

    const options: LaunchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    };
    const executable = this.config.get('CHROMIUM_PATH', { infer: true });
    if (executable) {
      options.executablePath = executable;
    }

    this.logger.log('Lanzando Chromium para generacion de PDF...');
    const browser = await puppeteer.launch(options);
    browser.on('disconnected', () => {
      this.logger.warn('Chromium se desconecto; se relanzara al proximo render');
      this.browserPromise = null;
    });
    return browser;
  }
}
