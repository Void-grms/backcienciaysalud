import { OmitType, PartialType } from '@nestjs/swagger';
import { CatalogStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreatePanelDto } from './create-panel.dto';

export class UpdatePanelDto extends PartialType(
  OmitType(CreatePanelDto, ['code', 'tests'] as const),
) {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
