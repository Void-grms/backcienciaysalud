import { PartialType } from '@nestjs/swagger';
import { ReferenceStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateReferenceDto } from './create-reference.dto';

export class UpdateReferenceDto extends PartialType(CreateReferenceDto) {
  @IsOptional()
  @IsEnum(ReferenceStatus)
  status?: ReferenceStatus;
}
