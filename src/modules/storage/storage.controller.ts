import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '@shared/decorators/public.decorator';
import { StorageService } from '@shared/storage/storage.service';

// Sirve los archivos almacenados (firmas, logos, etc.) como binarios.
// Las claves son UUID-aleatorias generadas por LocalStorageService, asi que
// no son adivinables. Para datos clinicos del PDF se usaran tokens firmados
// (Sprint 6).
@ApiTags('storage')
@Public()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get(':folder/:fileName')
  @ApiOperation({ summary: 'Sirve un archivo almacenado (acceso por clave UUID)' })
  async serve(
    @Param('folder') folder: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ): Promise<void> {
    const key = `${folder}/${fileName}`;
    const file = await this.storage.get(key);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': file.contentType,
        'Content-Length': file.size.toString(),
        'Cache-Control': 'private, max-age=3600',
      })
      .end(file.buffer);
  }
}
