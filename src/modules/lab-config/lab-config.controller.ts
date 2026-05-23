import { Body, Controller, Get, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';
import { LOGO_CONSTRAINTS, assertImage } from '@shared/storage/image-upload';

import { UpdateLabConfigDto } from './dto/update-lab-config.dto';
import { LabConfigService } from './lab-config.service';

@ApiTags('lab-config')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('lab-config')
export class LabConfigController {
  constructor(private readonly service: LabConfigService) {}

  @Get()
  @ApiOkResponse({ description: 'Configuracion vigente del laboratorio.' })
  get() {
    return this.service.get();
  }

  @Put()
  @ApiOperation({ summary: 'Actualiza datos generales del laboratorio' })
  update(@Body() dto: UpdateLabConfigDto, @CurrentUser() user: AuthUser) {
    return this.service.update(dto, user);
  }

  @Put('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: LOGO_CONSTRAINTS.maxBytes * 2 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @ApiOperation({ summary: 'Sube/actualiza el logo del laboratorio' })
  updateLogo(@UploadedFile() logo: Express.Multer.File | undefined, @CurrentUser() user: AuthUser) {
    assertImage(logo, LOGO_CONSTRAINTS, 'logo');
    return this.service.updateLogo(logo, user);
  }
}
