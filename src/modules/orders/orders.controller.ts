import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { AddOrderItemDto } from './dto/add-order-item.dto';
import { AmendOrderDto } from './dto/amend-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('JWT')
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.reference_user, UserRole.patient)
  list(@Query() query: ListOrdersDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get(':idOrCode')
  @Roles(UserRole.admin, UserRole.reference_user, UserRole.patient)
  @ApiOperation({ summary: 'Detalle por UUID o por codigo (ORD-...)' })
  findOne(@Param('idOrCode') idOrCode: string, @CurrentUser() user: AuthUser) {
    return this.service.findByIdOrCode(idOrCode, user);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/items')
  @Roles(UserRole.admin)
  addItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addItem(id, dto, user);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeItem(id, itemId, user);
  }

  @Post(':id/validate')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  validate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.validate(id, user);
  }

  @Post(':id/deliver')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  deliver(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deliver(id, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(id, dto, user);
  }

  @Post(':id/amend')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  amend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AmendOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.amend(id, dto, user);
  }
}
