import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({ description: 'Motivo de anulacion (obligatorio para trazabilidad)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
