import { OmitType, PartialType } from '@nestjs/swagger';
import { CatalogStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateTestDto } from './create-test.dto';

// `code` no es editable despues de creado: la prueba debe mantener un codigo
// estable porque las ordenes ya emitidas lo referencian.
export class UpdateTestDto extends PartialType(OmitType(CreateTestDto, ['code'] as const)) {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
