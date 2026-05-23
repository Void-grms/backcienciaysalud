import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResultType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TestOptionDto {
  @ApiProperty({ example: 'POSITIVO' })
  @IsString()
  @MaxLength(80)
  value!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class CreateTestDto {
  @ApiProperty({ example: 'GLU' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'Glucosa serica' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ example: 'Glucosa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shortName?: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ enum: ['numeric', 'text', 'qualitative', 'observation'] })
  @IsEnum(ResultType)
  resultType!: ResultType;

  @ApiPropertyOptional({ example: 'mg/dL' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ example: 'Cinetica enzimatica' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  method?: string;

  @ApiPropertyOptional({ default: 2, minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minCritical?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxCritical?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referenceText?: string;

  @ApiPropertyOptional({ description: 'Sobreescribe al profesional de la categoria' })
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @ApiPropertyOptional({
    type: [TestOptionDto],
    description: 'Solo para resultType=qualitative',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TestOptionDto)
  options?: TestOptionDto[];
}
