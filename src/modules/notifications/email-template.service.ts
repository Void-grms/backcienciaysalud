import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

export type EmailTemplateName = 'result-ready' | 'password-reset' | 'credentials';

@Injectable()
export class EmailTemplateService {
  private readonly cache = new Map<string, HandlebarsTemplateDelegate<Record<string, unknown>>>();

  async render(name: EmailTemplateName, ctx: Record<string, unknown>): Promise<string> {
    const tpl = await this.load(name);
    return tpl(ctx);
  }

  private async load(name: EmailTemplateName) {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const file = path.join(__dirname, 'templates', `${name}.hbs`);
    const src = await fs.readFile(file, 'utf-8');
    const tpl = Handlebars.compile<Record<string, unknown>>(src, { noEscape: false });
    this.cache.set(name, tpl);
    return tpl;
  }
}
