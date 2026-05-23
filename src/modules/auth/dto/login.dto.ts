import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@laboratorio.com',
    description: 'Email (admin/referencia) o documentNumber (paciente).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  identifier!: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
