import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('JWT')
@Controller('orders/:orderId')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('report.pdf')
  @Roles(UserRole.admin, UserRole.reference_user, UserRole.patient)
  @ApiOperation({ summary: 'Descarga el PDF del informe (genera si no existe)' })
  async getPdf(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.getPdf(orderId, user);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-store',
      })
      .end(buffer);
  }

  @Post('report/regenerate')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera una nueva version del informe' })
  regenerate(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.regenerate(orderId, user);
  }

  @Get('reports')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Lista las versiones generadas del informe' })
  versions(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listVersions(orderId, user);
  }
}
