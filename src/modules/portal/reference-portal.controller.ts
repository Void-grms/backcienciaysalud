import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { OrdersService } from '@modules/orders/orders.service';
import { ReportsService } from '@modules/reports/reports.service';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { ListOrdersDto } from '@modules/orders/dto/list-orders.dto';

import { ReferencePortalService } from './reference-portal.service';

class ListPatientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 25;
}

@ApiTags('portal-reference')
@ApiBearerAuth('JWT')
@Roles(UserRole.reference_user)
@Controller('me/reference')
export class ReferencePortalController {
  constructor(
    private readonly orders: OrdersService,
    private readonly reports: ReportsService,
    private readonly portal: ReferencePortalService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'Lista ordenes derivadas por la referencia' })
  listOrders(@Query() query: ListOrdersDto, @CurrentUser() user: AuthUser) {
    return this.orders.list(query, user);
  }

  @Get('orders/:idOrCode')
  detail(@Param('idOrCode') idOrCode: string, @CurrentUser() user: AuthUser) {
    return this.orders.findByIdOrCode(idOrCode, user);
  }

  @Get('orders/:idOrCode/report.pdf')
  async pdf(
    @Param('idOrCode') idOrCode: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.orders.findByIdOrCode(idOrCode, user);
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

  @Get('patients')
  @ApiOperation({ summary: 'Pacientes derivados por la referencia del usuario' })
  listPatients(@Query() query: ListPatientsQueryDto, @CurrentUser() user: AuthUser) {
    return this.portal.listPatients(user, query.page, query.perPage, query.search);
  }
}
