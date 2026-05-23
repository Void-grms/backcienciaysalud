import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto';

// `documentType` y `documentNumber` no se editan despues de crear, para no
// invalidar referencias historicas en ordenes ya emitidas.
export class UpdatePatientDto extends PartialType(
  OmitType(CreatePatientDto, ['documentType', 'documentNumber'] as const),
) {}
