import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '@shared/decorators/roles.decorator';

import { DashboardsService } from './dashboards.service';

@ApiTags('dashboards')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('admin/dashboard')
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'KPIs del dashboard administrativo',
    description:
      'Devuelve totales por estado, contadores hoy/7d/30d, top pruebas, top referencias y pacientes nuevos.',
  })
  overview() {
    return this.service.overview();
  }

  @Get('timeline')
  @ApiOperation({
    summary: 'Serie diaria de ordenes creadas vs entregadas',
    description: 'Acepta `days` (1-90, default 30).',
  })
  timeline(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.service.dailyTimeline(days);
  }
}
