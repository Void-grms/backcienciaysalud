import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@laboratorio.com' })
  @IsEmail()
  @MaxLength(180)
  email!: string;
}
