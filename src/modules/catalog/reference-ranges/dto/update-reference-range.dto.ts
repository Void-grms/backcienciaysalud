import { PartialType } from '@nestjs/swagger';
import { CreateReferenceRangeDto } from './create-reference-range.dto';

export class UpdateReferenceRangeDto extends PartialType(CreateReferenceRangeDto) {}
