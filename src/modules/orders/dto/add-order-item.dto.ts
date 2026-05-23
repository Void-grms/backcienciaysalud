import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AddOrderItemDto {
  @ApiPropertyOptional({ description: 'ID de prueba individual a agregar' })
  @ValidateIf((o: AddOrderItemDto) => !o.panelId)
  @IsUUID()
  testId?: string;

  @ApiPropertyOptional({ description: 'ID de panel a agregar (suma todas sus pruebas)' })
  @ValidateIf((o: AddOrderItemDto) => !o.testId)
  @IsUUID()
  panelId?: string;
}
