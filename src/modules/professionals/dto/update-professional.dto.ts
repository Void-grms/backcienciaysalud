import { PartialType } from '@nestjs/swagger';
import { CatalogStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateProfessionalDto } from './create-professional.dto';

export class UpdateProfessionalDto extends PartialType(CreateProfessionalDto) {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
