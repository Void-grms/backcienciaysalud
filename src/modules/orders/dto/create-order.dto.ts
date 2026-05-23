import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class OrderTestEntryDto {
  @ApiProperty()
  @IsUUID()
  testId!: string;

  @ApiPropertyOptional({
    description: 'Si se agrego via panel, ID del panel (para referenciar agrupacion)',
  })
  @IsOptional()
  @IsUUID()
  panelId?: string;
}

export class OrderPanelEntryDto {
  @ApiProperty()
  @IsUUID()
  panelId!: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  requestingDoctor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalInfo?: string;

  @ApiPropertyOptional({ example: '2026-05-19T08:30:00Z' })
  @IsOptional()
  @IsDateString()
  sampleTakenAt?: string;

  @ApiPropertyOptional({ type: [OrderTestEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => OrderTestEntryDto)
  @ArrayUnique((it: OrderTestEntryDto) => it.testId)
  tests?: OrderTestEntryDto[];

  @ApiPropertyOptional({ type: [OrderPanelEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderPanelEntryDto)
  @ArrayUnique((it: OrderPanelEntryDto) => it.panelId)
  panels?: OrderPanelEntryDto[];

  @ValidateIf((o: CreateOrderDto) => !o.tests?.length && !o.panels?.length)
  @IsArray({ message: 'La orden debe tener al menos una prueba o panel' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _atLeastOne?: any;
}
