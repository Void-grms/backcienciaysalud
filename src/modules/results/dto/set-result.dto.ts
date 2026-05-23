import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

// Acepta numeric, text o qualitative. La validacion contra el tipo de la
// prueba se hace en ResultsService (necesita cargar el test).
export class SetResultDto {
  @ApiPropertyOptional({ description: 'Para pruebas numericas' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  valueNumeric?: number | null;

  @ApiPropertyOptional({ description: 'Para text y qualitative' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  valueText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string | null;
}
