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

import { Roles } from '@shared/decorators/roles.decorator';

import { AddPanelTestDto } from './dto/add-panel-test.dto';
import { CreatePanelDto } from './dto/create-panel.dto';
import { ListPanelsDto } from './dto/list-panels.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';
import { PanelsService } from './panels.service';

@ApiTags('catalog')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('catalog/panels')
export class PanelsController {
  constructor(private readonly service: PanelsService) {}

  @Get()
  list(@Query() query: ListPanelsDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreatePanelDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePanelDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.softDelete(id);
  }

  @Post(':id/tests')
  @ApiOperation({ summary: 'Agrega una prueba al panel' })
  addTest(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AddPanelTestDto) {
    return this.service.addTest(id, dto);
  }

  @Delete(':id/tests/:testId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quita una prueba del panel' })
  removeTest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('testId', new ParseUUIDPipe()) testId: string,
  ) {
    return this.service.removeTest(id, testId);
  }
}
