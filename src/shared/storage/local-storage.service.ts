import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { Env } from '@config/env.validation';

import { SaveOptions, StorageService, StoredObject } from './storage.service';

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly basePath: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
    const configured = this.config.get('STORAGE_PATH', { infer: true });
    this.basePath = path.resolve(process.cwd(), configured);
  }

  async save(buffer: Buffer, options: SaveOptions): Promise<string> {
    const ext = this.extFor(options.contentType);
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const relativeKey = `${options.folder}/${fileName}`;
    const fullPath = path.join(this.basePath, relativeKey);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    // Guardamos el content type como metadato en un archivo paralelo .meta
    await fs.writeFile(`${fullPath}.meta`, options.contentType);
    return relativeKey;
  }

  async get(key: string): Promise<StoredObject> {
    const fullPath = this.resolveSafe(key);
    try {
      const [buffer, meta] = await Promise.all([
        fs.readFile(fullPath),
        fs.readFile(`${fullPath}.meta`, 'utf-8').catch(() => 'application/octet-stream'),
      ]);
      return { buffer, contentType: meta.trim(), size: buffer.length };
    } catch (err) {
      throw new NotFoundException('Archivo no encontrado');
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveSafe(key);
    await Promise.all([
      fs.rm(fullPath, { force: true }),
      fs.rm(`${fullPath}.meta`, { force: true }),
    ]);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveSafe(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolveSafe(key: string): string {
    const fullPath = path.resolve(this.basePath, key);
    // Evita path traversal (`../../etc/passwd`).
    if (!fullPath.startsWith(this.basePath)) {
      throw new NotFoundException('Archivo no encontrado');
    }
    return fullPath;
  }

  private extFor(contentType: string): string {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return map[contentType] ?? '';
  }
}
