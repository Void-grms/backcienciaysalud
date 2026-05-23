import { Controller, Get, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderState, UserRole } from '@prisma/client';
import type { Response } from 'express';

import { OrdersService } from '@modules/orders/orders.service';
import { ReportsService } from '@modules/reports/reports.service';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { ListOrdersDto } from '@modules/orders/dto/list-orders.dto';

@ApiTags('portal-patient')
@ApiBearerAuth('JWT')
@Roles(UserRole.patient)
@Controller('me')
export class PatientPortalController {
  constructor(
    private readonly orders: OrdersService,
    private readonly reports: ReportsService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'Lista las ordenes entregadas/enmendadas del paciente' })
  list(@Query() query: ListOrdersDto, @CurrentUser() user: AuthUser) {
    return this.orders.list(query, user);
  }

  @Get('orders/:idOrCode')
  detail(@Param('idOrCode') idOrCode: string, @CurrentUser() user: AuthUser) {
    return this.orders.findByIdOrCode(idOrCode, user);
  }

  @Get('orders/:idOrCode/report.pdf')
  @ApiOperation({ summary: 'Descarga el PDF (solo si la orden esta entregada)' })
  async pdf(
    @Param('idOrCode') idOrCode: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.orders.findByIdOrCode(idOrCode, user);
    if (order.state !== OrderState.delivered && order.state !== OrderState.amended) {
      // Por seguridad respondemos 404 para no filtrar existencia de estados intermedios.
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Orden no encontrada' });
      return;
    }
    const { buffer, filename } = await this.reports.getPdf(order.id, user);
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
}
