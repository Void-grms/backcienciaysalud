// Conversiones edad <-> dias.
// Convencion adoptada en el plan: 1 ano = 365 dias, 1 mes = 30 dias.
// Se usa tanto en la importacion masiva (Sprint 3) como en el
// RangeResolverService para comparar la edad del paciente contra los rangos.

export type AgeUnit = 'd' | 'm' | 'a';

export function ageToDays(value: number, unit: AgeUnit): number {
  switch (unit) {
    case 'd':
      return value;
    case 'm':
      return value * 30;
    case 'a':
      return value * 365;
  }
}

export function birthDateToAgeDays(birthDate: Date, referenceDate: Date = new Date()): number {
  const diffMs = referenceDate.getTime() - birthDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}
