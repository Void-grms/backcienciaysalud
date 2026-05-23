import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '@shared/decorators/roles.decorator';

import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('orders/:orderId/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvia los correos del informe entregado' })
  resend(@Param('orderId', new ParseUUIDPipe()) orderId: string) {
    return this.service.resendForOrder(orderId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista historial de notificaciones de la orden' })
  list(@Param('orderId', new ParseUUIDPipe()) orderId: string) {
    return this.service.listByOrder(orderId);
  }
}
