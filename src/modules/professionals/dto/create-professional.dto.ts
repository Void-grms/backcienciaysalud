import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProfessionalDto {
  @ApiProperty({ example: 'MSc. Maria Lopez' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Bioquimica' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  professionalTitle?: string;

  @ApiPropertyOptional({ example: 'CBP-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;
}
