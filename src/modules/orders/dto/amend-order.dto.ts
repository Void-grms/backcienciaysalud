import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AmendOrderDto {
  @ApiProperty({ description: 'Motivo de la enmienda (queda en el historial)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
