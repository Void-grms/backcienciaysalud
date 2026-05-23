import { BadRequestException } from '@nestjs/common';

export interface ImageUploadConstraints {
  maxBytes: number;
  allowedMime: ReadonlyArray<string>;
}

export const SIGNATURE_CONSTRAINTS: ImageUploadConstraints = {
  maxBytes: 500 * 1024, // 500 KB segun el plan
  allowedMime: ['image/png', 'image/jpeg', 'image/jpg'],
};

export const LOGO_CONSTRAINTS: ImageUploadConstraints = {
  maxBytes: 1024 * 1024, // 1 MB
  allowedMime: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
};

export function assertImage(
  file: Express.Multer.File | undefined,
  constraints: ImageUploadConstraints,
  fieldName = 'file',
): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException(`Archivo ${fieldName} requerido`);
  }
  if (file.size > constraints.maxBytes) {
    const max = Math.round(constraints.maxBytes / 1024);
    throw new BadRequestException(`El archivo excede el maximo permitido (${max} KB)`);
  }
  if (!constraints.allowedMime.includes(file.mimetype)) {
    throw new BadRequestException(
      `Tipo de archivo no permitido (${file.mimetype}). Permitidos: ${constraints.allowedMime.join(', ')}`,
    );
  }
}
