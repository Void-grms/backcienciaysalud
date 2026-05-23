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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';
import { SIGNATURE_CONSTRAINTS, assertImage } from '@shared/storage/image-upload';

import { CreateProfessionalDto } from './dto/create-professional.dto';
import { ListProfessionalsDto } from './dto/list-professionals.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('professionals')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly service: ProfessionalsService) {}

  @Get()
  list(@Query() query: ListProfessionalsDto) {
    return this.service.list(query);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('signature', { limits: { fileSize: SIGNATURE_CONSTRAINTS.maxBytes * 2 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        professionalTitle: { type: 'string' },
        licenseNumber: { type: 'string' },
        signature: { type: 'string', format: 'binary' },
      },
      required: ['fullName'],
    },
  })
  @ApiOperation({ summary: 'Crea profesional, opcionalmente con imagen de firma' })
  create(@Body() dto: CreateProfessionalDto, @UploadedFile() signature?: Express.Multer.File) {
    if (signature) assertImage(signature, SIGNATURE_CONSTRAINTS, 'signature');
    return this.service.create(dto, signature);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProfessionalDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/signature')
  @UseInterceptors(
    FileInterceptor('signature', { limits: { fileSize: SIGNATURE_CONSTRAINTS.maxBytes * 2 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { signature: { type: 'string', format: 'binary' } },
      required: ['signature'],
    },
  })
  @ApiOperation({ summary: 'Actualiza la imagen de firma del profesional' })
  updateSignature(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() signature: Express.Multer.File | undefined,
  ) {
    assertImage(signature, SIGNATURE_CONSTRAINTS, 'signature');
    return this.service.updateSignature(id, signature);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.softDelete(id, user);
  }
}
