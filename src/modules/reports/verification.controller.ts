import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@shared/decorators/public.decorator';

import { ReportsService } from './reports.service';

@ApiTags('verification')
@Public()
@Controller('verify')
export class VerificationController {
  constructor(private readonly service: ReportsService) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Verifica un informe a partir de un token publico',
    description:
      'Devuelve metadatos minimos del informe (codigo, fecha, profesional firmante) sin exponer resultados clinicos.',
  })
  verify(@Param('token') token: string) {
    return this.service.verify(token);
  }
}
