import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateReferenceUserDto {
  @ApiProperty({ example: 'medico@salud-total.pe' })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'Dr. Juan Perez' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName!: string;

  @ApiPropertyOptional({
    description:
      'Contrasena temporal opcional. Si no se envia, se genera y se obliga al cambio.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
