import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { ImportTemplateService } from '@modules/catalog/import/import-template.service';
import { ImportTestsService } from '@modules/catalog/import/import-tests.service';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import type { AuthUser } from '@shared/auth/auth-user';

import { CreateTestDto } from './dto/create-test.dto';
import { ListTestsDto } from './dto/list-tests.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { TestsService } from './tests.service';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('catalog')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('catalog/tests')
export class TestsController {
  constructor(
    private readonly service: TestsService,
    private readonly importTemplate: ImportTemplateService,
    private readonly importTests: ImportTestsService,
  ) {}

  // ------------------------------------------------------------------
  // Rutas ESTATICAS primero (import-template, import) para que no las
  // capture el matcher de :id. Nest las registra en este orden.
  // ------------------------------------------------------------------

  @Get('import-template')
  @ApiOperation({ summary: 'Descarga la plantilla XLSX oficial' })
  async importTemplateDownload(@Res() res: Response): Promise<void> {
    const buffer = await this.importTemplate.buildTestsTemplate();
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-pruebas.xlsx"',
        'Content-Length': buffer.length.toString(),
      })
      .end(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Sube XLSX, ejecuta dry-run y devuelve importToken + resumen',
  })
  async importUpload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Archivo `file` requerido');
    const job = await this.importTests.dryRun(file.buffer, file.originalname, user.sub);
    return {
      importToken: job.id,
      summary: job.summary,
      errors: job.errors,
      expiresAt: job.expiresAt,
    };
  }

  @Post('import/:importToken/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplica el job de importacion en una transaccion' })
  importConfirm(@Param('importToken', new ParseUUIDPipe()) token: string) {
    return this.importTests.confirm(token);
  }

  @Get('import/:importToken/errors.xlsx')
  @ApiOperation({ summary: 'Descarga reporte XLSX con los errores del job' })
  async importErrors(
    @Param('importToken', new ParseUUIDPipe()) token: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.importTests.generateErrorsXlsx(token);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      })
      .end(buffer);
  }

  // ------------------------------------------------------------------
  // CRUD estandar
  // ------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'Lista pruebas del catalogo' })
  list(@Query() query: ListTestsDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateTestDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.service.softDelete(id, user.sub);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Versiones historicas de la prueba' })
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.history(id);
  }
}
