import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhysiologicalState, Sex } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReferenceRangeDto {
  @ApiPropertyOptional({ enum: ['M', 'F', 'A'], default: 'A' })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @ApiPropertyOptional({ description: 'Edad minima en dias (NULL = sin minimo)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ageMinDays?: number;

  @ApiPropertyOptional({ description: 'Edad maxima en dias (NULL = sin maximo)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ageMaxDays?: number;

  @ApiPropertyOptional({ enum: ['none', 'pregnancy', 'lactation'] })
  @IsOptional()
  @IsEnum(PhysiologicalState)
  physiologicalState?: PhysiologicalState;

  @ApiPropertyOptional({ description: 'Limite inferior normal (numericas)' })
  @IsOptional()
  @IsNumber()
  valueMin?: number;

  @ApiPropertyOptional({ description: 'Limite superior normal (numericas)' })
  @IsOptional()
  @IsNumber()
  valueMax?: number;

  @ApiPropertyOptional({
    description: 'Umbral critico inferior (panico). Por debajo dispara critical_low.',
  })
  @IsOptional()
  @IsNumber()
  criticalMin?: number;

  @ApiPropertyOptional({
    description: 'Umbral critico superior (panico). Por encima dispara critical_high.',
  })
  @IsOptional()
  @IsNumber()
  criticalMax?: number;

  @ApiPropertyOptional({ description: 'Valor normal esperado (cualitativas)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  qualitativeExpected?: string;

  @ApiPropertyOptional({ description: 'Texto a mostrar en el PDF' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  displayText?: string;

  @ApiPropertyOptional({ description: 'Prioridad de desempate (mayor gana)', default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ description: 'Vigente desde (ISO yyyy-mm-dd)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
