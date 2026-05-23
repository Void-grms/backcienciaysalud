import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { BulkSaveDto } from './dto/bulk-save.dto';
import { SetResultDto } from './dto/set-result.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth('JWT')
@Controller('orders/:orderId/results')
export class ResultsController {
  constructor(private readonly service: ResultsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.reference_user, UserRole.patient)
  list(@Param('orderId', new ParseUUIDPipe()) orderId: string, @CurrentUser() user: AuthUser) {
    return this.service.listForOrder(orderId, user);
  }

  // Bulk-save antes de :itemId — ruta estatica primero.
  @Post('bulk-save')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autoguardado masivo (frontend lo invoca cada 10 s)',
  })
  bulkSave(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: BulkSaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.bulkSave(orderId, dto, user);
  }

  @Put(':itemId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Setea/actualiza el resultado de un item' })
  setOne(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: SetResultDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setOne(orderId, itemId, dto, user);
  }

  @Post(':itemId/observation')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  setObservation(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateObservationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setObservation(orderId, itemId, dto, user);
  }
}
