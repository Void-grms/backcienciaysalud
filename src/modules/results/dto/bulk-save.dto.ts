import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class BulkResultEntryDto {
  @ApiProperty()
  @IsUUID()
  orderItemId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  valueNumeric?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  valueText?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string | null;
}

export class BulkSaveDto {
  @ApiProperty({ type: [BulkResultEntryDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => BulkResultEntryDto)
  entries!: BulkResultEntryDto[];
}
