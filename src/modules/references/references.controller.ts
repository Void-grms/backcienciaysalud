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

import { CreateReferenceUserDto } from './dto/create-reference-user.dto';
import { CreateReferenceDto } from './dto/create-reference.dto';
import { ListReferencesDto } from './dto/list-references.dto';
import { UpdateReferenceDto } from './dto/update-reference.dto';
import { ReferencesService } from './references.service';

@ApiTags('references')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('references')
export class ReferencesController {
  constructor(private readonly service: ReferencesService) {}

  @Get()
  list(@Query() query: ListReferencesDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateReferenceDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateReferenceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.softDelete(id, user);
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Crea un usuario asociado a la referencia' })
  addUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateReferenceUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addUser(id, dto, user);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeUser(id, userId, user);
  }
}
