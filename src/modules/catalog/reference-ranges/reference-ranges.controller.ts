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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { CreateReferenceRangeDto } from './dto/create-reference-range.dto';
import { UpdateReferenceRangeDto } from './dto/update-reference-range.dto';
import { ReferenceRangesService } from './reference-ranges.service';

@ApiTags('catalog')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('catalog')
export class ReferenceRangesController {
  constructor(private readonly service: ReferenceRangesService) {}

  @Get('tests/:id/ranges')
  @ApiOperation({ summary: 'Lista rangos referenciales vigentes de una prueba' })
  listForTest(@Param('id', new ParseUUIDPipe()) testId: string) {
    return this.service.listForTest(testId);
  }

  @Post('tests/:id/ranges')
  @ApiOperation({ summary: 'Crea un nuevo rango referencial' })
  create(
    @Param('id', new ParseUUIDPipe()) testId: string,
    @Body() dto: CreateReferenceRangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(testId, dto, user.sub);
  }

  @Patch('ranges/:id')
  @ApiOperation({ summary: 'Actualiza un rango (versiona el anterior)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReferenceRangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete('ranges/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marca el rango como historico (effectiveTo = ahora)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.markAsHistoric(id, user.sub);
  }
}
