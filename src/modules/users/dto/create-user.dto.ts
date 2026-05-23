import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'maria.gonzalez@laboratorio.com' })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'Maria Gonzalez' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName!: string;

  @ApiProperty({ enum: ['admin', 'reference_user'], example: 'admin' })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({
    description:
      'Contrasena temporal. Si no se envia, se genera una y se obliga al cambio en primer login.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
