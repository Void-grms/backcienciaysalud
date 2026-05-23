import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateObservationDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation!: string | null;
}
