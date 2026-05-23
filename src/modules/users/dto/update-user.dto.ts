import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName?: string;

  @ApiPropertyOptional({ enum: ['active', 'blocked', 'pending_password'] })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
