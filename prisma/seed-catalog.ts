/* eslint-disable @typescript-eslint/no-explicit-any */
import { CatalogStatus, PrismaClient, ResultType, Sex } from '@prisma/client';

// Cataloga las pruebas, paneles y rangos referenciales extraidos de los
// formatos oficiales de "Ciencia y Salud" (HEMOGRAMA, PERFIL HEPATICO,
// PERFIL LIPIDICO, PERFIL TIROIDEO, AMILASA, PCR, FR, ANA, VSG, DENGUE,
// IGE TOTAL, EXAMEN DE ORINA). Los rangos van con `displayText` literal
// para preservar la segmentacion (VARONES / MUJERES / NIÑOS / RN / etc.)
// tal y como aparecen en el .docx — el reporte los pinta linea por linea.

interface TestSpec {
  code: string;
  name: string;
  shortName?: string;
  category: string; // nombre exacto de la Category existente
  resultType: ResultType;
  unit?: string;
  method?: string;
  decimals?: number;
  minCritical?: number;
  maxCritical?: number;
  // Rangos: si solo es un texto se usa como displayText. Para multi-segmento,
  // pasar un array de strings (cada uno renderiza como su propia linea).
  ranges?: Array<{
    sex?: Sex;
    ageMinDays?: number;
    ageMaxDays?: number;
    valueMin?: number;
    valueMax?: number;
    qualitativeExpected?: string;
    displayText: string;
    priority?: number;
  }>;
  // Opciones predefinidas (solo qualitative).
  options?: string[];
}

interface PanelSpec {
  code: string;
  name: string;
  description?: string;
  // codigos de tests en orden
  testCodes: string[];
}

// ---------------------------------------------------------------
// HEMOGRAMA COMPLETO (Hematologia)
// ---------------------------------------------------------------
const HEMOGRAMA: TestSpec[] = [
  { code: 'LEU',  name: 'LEUCOCITOS',                    category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 2, ranges: [{ valueMin: 4.0, valueMax: 10.0, displayText: '4.00 - 10.00' }] },
  { code: 'LINFR', name: 'LINFOCITOS RECUENTO',          category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 2, ranges: [{ valueMin: 0.9, valueMax: 4.8, displayText: '0.90 - 4.80' }] },
  { code: 'MONR', name: 'MONOCITOS RECUENTO',            category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 2, ranges: [{ valueMin: 0.1, valueMax: 0.7, displayText: '0.10 - 0.70' }] },
  { code: 'EOSR', name: 'EOSINOFILOS RECUENTO',          category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 2, ranges: [{ valueMin: 0.0, valueMax: 0.5, displayText: '0.0 - 0.50' }] },
  { code: 'BASR', name: 'BASOFILOS RECUENTO',            category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 3, ranges: [{ valueMin: 0.0, valueMax: 0.015, displayText: '0.0 - 0.015' }] },
  { code: 'NEUR', name: 'NEUTROFILOS RECUENTO',          category: 'Hematologia', resultType: ResultType.numeric, unit: '10^3/uL', decimals: 1, ranges: [{ valueMin: 1.8, valueMax: 8.0, displayText: '1.8 - 8.0' }] },
  { code: 'LINFP', name: 'LINFOCITOS %',                 category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMin: 25, valueMax: 45, displayText: '25 - 45' }] },
  { code: 'MONP', name: 'MONOCITOS %',                   category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMin: 0, valueMax: 6, displayText: '0 - 6' }] },
  { code: 'EOSP', name: 'EOSINOFILOS %',                 category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMin: 0, valueMax: 5, displayText: '0 - 5' }] },
  { code: 'BASP', name: 'BASOFILOS %',                   category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 2, ranges: [{ valueMin: 0, valueMax: 0.15, displayText: '0 - 0.15' }] },
  { code: 'NEUP', name: 'NEUTROFILOS %',                 category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMin: 37, valueMax: 72, displayText: '37 - 72' }] },
  { code: 'MIEL', name: 'MIELOCITOS',                    category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMax: 0, displayText: '0' }] },
  { code: 'NEUB', name: 'NEUTROFILO EN BANDA %',         category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 0, ranges: [{ valueMin: 0, valueMax: 2, displayText: '0 - 2' }] },
  { code: 'HMT',  name: 'HEMATIES',                      category: 'Hematologia', resultType: ResultType.numeric, unit: 'X10^6/uL', decimals: 2, ranges: [{ valueMin: 3.8, valueMax: 6.0, displayText: '3.80 - 6.00' }] },
  {
    code: 'HGB', name: 'HEMOGLOBINA', category: 'Hematologia', resultType: ResultType.numeric, unit: 'g/dl', decimals: 1, minCritical: 7, maxCritical: 20,
    ranges: [
      { sex: Sex.M, ageMinDays: 365 * 13, valueMin: 14, valueMax: 18, priority: 10, displayText: 'VARONES: 14 - 18 gr/dl' },
      { sex: Sex.F, ageMinDays: 365 * 13, valueMin: 12, valueMax: 16, priority: 10, displayText: 'MUJERES: 12 - 16 gr/dl' },
      { sex: Sex.A, ageMinDays: 30, ageMaxDays: 365 * 12, valueMin: 11, valueMax: 16, priority: 5, displayText: 'LACTANTES NIÑOS: 11 - 16 gr/dl' },
      { sex: Sex.A, ageMaxDays: 30, valueMin: 14, valueMax: 24, priority: 5, displayText: 'RECIEN NACIDOS: 14 - 24 gr/dl' },
    ],
  },
  {
    code: 'HCT', name: 'HEMATOCRITO', category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 1,
    ranges: [
      { sex: Sex.M, ageMinDays: 365 * 13, valueMin: 42, valueMax: 52, priority: 10, displayText: 'VARONES: 42 - 52 %' },
      { sex: Sex.F, ageMinDays: 365 * 13, valueMin: 37, valueMax: 47, priority: 10, displayText: 'MUJERES: 37 - 47 %' },
      { sex: Sex.A, ageMinDays: 30, ageMaxDays: 365 * 12, valueMin: 34, valueMax: 43, priority: 5, displayText: 'LACTANTES NIÑOS: 34 - 43 %' },
      { sex: Sex.A, ageMaxDays: 30, valueMin: 44, valueMax: 64, priority: 5, displayText: 'RECIEN NACIDOS: 44 - 64 %' },
    ],
  },
  { code: 'VCM',  name: 'VOLUMEN CORPUSCULAR MEDIO (VCM)', category: 'Hematologia', resultType: ResultType.numeric, unit: 'fl', decimals: 1, ranges: [{ valueMin: 82, valueMax: 95, displayText: '82 - 95' }] },
  { code: 'HCM',  name: 'HEMOGLOBINA CORPUSCULAR MEDIA (HCM)', category: 'Hematologia', resultType: ResultType.numeric, unit: 'pg', decimals: 1, ranges: [{ valueMin: 27, valueMax: 32, displayText: '27 - 32' }] },
  { code: 'CHCM', name: 'CONCENTRACION HEMOGLOBINA CORPUSCULAR MEDIA (CHCM)', category: 'Hematologia', resultType: ResultType.numeric, unit: 'g/dl', decimals: 1, ranges: [{ valueMin: 32, valueMax: 36, displayText: '32.0 - 36.0' }] },
  { code: 'RDWCV', name: 'RDW-CV',                       category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 1, ranges: [{ valueMin: 11, valueMax: 16, displayText: '11 - 16' }] },
  { code: 'RDWSD', name: 'RDW-SD',                       category: 'Hematologia', resultType: ResultType.numeric, unit: 'fL', decimals: 1, ranges: [{ valueMin: 38, valueMax: 52, displayText: '38.0 - 52.0' }] },
  { code: 'PLT',  name: 'PLAQUETAS',                     category: 'Hematologia', resultType: ResultType.numeric, unit: 'x10^3/uL', decimals: 0, minCritical: 50, maxCritical: 1000, ranges: [{ valueMin: 150, valueMax: 450, displayText: '150 - 450' }] },
  { code: 'VPM',  name: 'VOLUMEN PLAQUETARIO MEDIO (VPM)', category: 'Hematologia', resultType: ResultType.numeric, unit: 'fl', decimals: 1, ranges: [{ valueMin: 7.5, valueMax: 11.5, displayText: '7.5 - 11.5' }] },
  { code: 'PDW',  name: 'PDW',                           category: 'Hematologia', resultType: ResultType.numeric, unit: 'fL', decimals: 1, ranges: [{ valueMin: 9, valueMax: 16, displayText: '9 - 16' }] },
  { code: 'PCT',  name: 'PCT',                           category: 'Hematologia', resultType: ResultType.numeric, unit: '%', decimals: 3, ranges: [{ valueMin: 0.15, valueMax: 0.30, displayText: '0.15 - 0.30' }] },
];

// ---------------------------------------------------------------
// PERFIL HEPATICO (Bioquimica)
// ---------------------------------------------------------------
const PERFIL_HEPATICO: TestSpec[] = [
  { code: 'TGO',  name: 'TGO - TRANSAMINASA GLUTAMICO OXALACETICA', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'U/L', decimals: 1, ranges: [{ valueMin: 0, valueMax: 40, displayText: '0.0 - 40.0' }] },
  { code: 'TGP',  name: 'TGP - TRANSAMINASA GLUTAMICO PIRUVICA',    category: 'Bioquimica', resultType: ResultType.numeric, unit: 'U/L', decimals: 1, ranges: [{ valueMin: 0, valueMax: 41, displayText: '0.0 - 41.0' }] },
  { code: 'GGT',  name: 'GAMMA-GLUTAMIL TRANSFERASA (GGT)',         category: 'Bioquimica', resultType: ResultType.numeric, unit: 'U/L', decimals: 0, ranges: [{ valueMin: 5, valueMax: 58, displayText: '5 - 58' }] },
  {
    code: 'FAL', name: 'FOSFATASA ALCALINA', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'U/L', decimals: 0,
    ranges: [
      { sex: Sex.M, ageMinDays: 365 * 18, valueMax: 270, priority: 10, displayText: 'Mayor 18 años (Hombres): hasta 270 U/L' },
      { sex: Sex.F, ageMinDays: 365 * 18, valueMax: 240, priority: 10, displayText: 'Mayor 18 años (Mujeres): hasta 240 U/L' },
      { sex: Sex.M, ageMinDays: 365 * 13, ageMaxDays: 365 * 17, valueMax: 390, priority: 5, displayText: '13 - 17 años (Hombres): hasta 390 U/L' },
      { sex: Sex.F, ageMinDays: 365 * 13, ageMaxDays: 365 * 17, valueMax: 187, priority: 5, displayText: '13 - 17 años (Mujeres): hasta 187 U/L' },
    ],
  },
  { code: 'BILT', name: 'BILIRRUBINA TOTAL',     category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dL', method: 'JENDRASSIK Y GROF', decimals: 2, ranges: [{ valueMin: 0.10, valueMax: 1.20, displayText: '0.10 - 1.20' }] },
  { code: 'BILD', name: 'BILIRRUBINA DIRECTA',   category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dL', method: 'JENDRASSIK Y GROF', decimals: 2, ranges: [{ valueMin: 0.00, valueMax: 0.30, displayText: '0.00 - 0.30' }] },
  { code: 'BILI', name: 'BILIRRUBINA INDIRECTA', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dL', method: 'JENDRASSIK Y GROF', decimals: 2, ranges: [{ valueMin: 0.10, valueMax: 1.00, displayText: '0.10 - 1.00' }] },
  { code: 'PRT',  name: 'PROTEINAS TOTALES SERICAS', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'g/dL', method: 'BIURET', decimals: 2, ranges: [{ valueMin: 6.6, valueMax: 8.7, displayText: '6.60 - 8.70' }] },
  { code: 'ALB',  name: 'ALBUMINA',          category: 'Bioquimica', resultType: ResultType.numeric, unit: 'g/dL', method: 'BIURET', decimals: 2, ranges: [{ valueMin: 3.4, valueMax: 4.8, displayText: '3.40 - 4.80' }] },
  { code: 'GLB',  name: 'GLOBULINA',         category: 'Bioquimica', resultType: ResultType.numeric, unit: 'g/dL', method: 'BIURET', decimals: 2, ranges: [{ valueMin: 2.5, valueMax: 3.5, displayText: '2.50 - 3.50' }] },
];

// ---------------------------------------------------------------
// PERFIL LIPIDICO / CORONARIO (Bioquimica)
// ---------------------------------------------------------------
const PERFIL_LIPIDICO: TestSpec[] = [
  { code: 'COL',  name: 'COLESTEROL TOTAL', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0, ranges: [{ valueMax: 200, displayText: 'Menor a 200' }] },
  {
    code: 'TRIG', name: 'TRIGLICERIDOS', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0,
    ranges: [
      { valueMax: 150, displayText: 'Nivel deseado: < 150' },
      { valueMin: 150, valueMax: 199, displayText: 'Nivel intermedio: 150 - 199' },
      { valueMin: 200, valueMax: 499, displayText: 'Nivel elevado: 200 - 499' },
      { valueMin: 500, displayText: 'Nivel muy elevado: > 500' },
    ],
  },
  {
    code: 'HDL', name: 'HDL COLESTEROL', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0,
    ranges: [
      { valueMin: 60, displayText: 'Valor deseable: ≥ 60' },
      { valueMin: 40, valueMax: 59, displayText: 'Nivel intermedio: 40 - 59' },
      { valueMax: 40, displayText: 'Nivel bajo: < 40' },
    ],
  },
  {
    code: 'LDL', name: 'LDL COLESTEROL', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0,
    ranges: [
      { valueMax: 100, displayText: 'Nivel deseable: < 100' },
      { valueMin: 100, valueMax: 129, displayText: 'Cercano al deseable: 100 - 129' },
      { valueMin: 130, valueMax: 159, displayText: 'Nivel intermedio: 130 - 159' },
      { valueMin: 160, displayText: 'Nivel elevado: ≥ 160' },
    ],
  },
  { code: 'VLDL', name: 'VLDL COLESTEROL',   category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 1, ranges: [{ valueMin: 10, valueMax: 30, displayText: '10.0 - 30.0' }] },
  { code: 'RCOR', name: 'RIESGO CORONARIO', category: 'Bioquimica', resultType: ResultType.numeric, decimals: 2, ranges: [{ valueMax: 5, displayText: 'Menor a 5' }] },
  { code: 'LIPT', name: 'LIPIDOS TOTALES',  category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0, ranges: [{ valueMax: 800, displayText: 'Menor a 800' }] },
];

// ---------------------------------------------------------------
// PERFIL TIROIDEO (Inmunologia)
// ---------------------------------------------------------------
const PERFIL_TIROIDEO: TestSpec[] = [
  { code: 'T3',  name: 'T3 TOTAL (Tri-Iodotironina)', category: 'Inmunologia', resultType: ResultType.numeric, unit: 'ng/dL', method: 'CLIA', decimals: 2, ranges: [{ valueMin: 0.84, valueMax: 2.02, displayText: '0.84 - 2.02' }] },
  {
    code: 'T4', name: 'T4 TOTAL (Tiroxina)', category: 'Inmunologia', resultType: ResultType.numeric, unit: 'ug/dL', method: 'CLIA', decimals: 2,
    ranges: [
      { ageMinDays: 365 * 12, valueMin: 5.13, valueMax: 14.06, priority: 10, displayText: 'ADULTOS: 5.13 - 14.06' },
      { ageMaxDays: 6, valueMin: 5.04, valueMax: 18.5, priority: 5, displayText: 'NEONATOS 0 - 6 días: 5.04 - 18.5' },
      { ageMinDays: 6, ageMaxDays: 90, valueMin: 5.41, valueMax: 17.0, priority: 5, displayText: 'NIÑOS 6 días - 3 meses: 5.41 - 17.0' },
      { ageMinDays: 90, ageMaxDays: 365, valueMin: 5.67, valueMax: 16.0, priority: 5, displayText: 'NIÑOS 3 - 12 meses: 5.67 - 16.0' },
      { ageMinDays: 365, ageMaxDays: 365 * 6, valueMin: 5.95, valueMax: 14.7, priority: 5, displayText: 'NIÑOS 1 - 6 años: 5.95 - 14.7' },
      { ageMinDays: 365 * 6, ageMaxDays: 365 * 11, valueMin: 5.99, valueMax: 13.8, priority: 5, displayText: 'NIÑOS 6 - 11 años: 5.99 - 13.8' },
      { ageMinDays: 365 * 11, ageMaxDays: 365 * 20, valueMin: 5.91, valueMax: 13.2, priority: 5, displayText: 'ADOLESC 11 - 20 años: 5.91 - 13.2' },
    ],
  },
  {
    code: 'TSH', name: 'TSH ULTRASENSIBLE', category: 'Inmunologia', resultType: ResultType.numeric, unit: 'mUI/ml', method: 'CLIA', decimals: 2,
    ranges: [
      { ageMinDays: 365 * 20, valueMin: 0.27, valueMax: 4.20, priority: 10, displayText: 'ADULTOS: 0.27 - 4.20' },
      { ageMaxDays: 6, valueMin: 0.70, valueMax: 15.2, priority: 5, displayText: 'NEONATOS 0 - 6 días: 0.70 - 15.2' },
      { ageMinDays: 6, ageMaxDays: 90, valueMin: 0.73, valueMax: 11.0, priority: 5, displayText: 'NIÑOS 6 días - 3 meses: 0.73 - 11.0' },
      { ageMinDays: 90, ageMaxDays: 365, valueMin: 0.73, valueMax: 8.35, priority: 5, displayText: 'NIÑOS 3 - 12 meses: 0.73 - 8.35' },
      { ageMinDays: 365, ageMaxDays: 365 * 6, valueMin: 0.70, valueMax: 5.97, priority: 5, displayText: 'NIÑOS 1 - 6 años: 0.70 - 5.97' },
      { ageMinDays: 365 * 6, ageMaxDays: 365 * 11, valueMin: 0.60, valueMax: 4.84, priority: 5, displayText: 'NIÑOS 6 - 11 años: 0.60 - 4.84' },
      { ageMinDays: 365 * 11, ageMaxDays: 365 * 20, valueMin: 0.51, valueMax: 4.30, priority: 5, displayText: 'ADOLESC 11 - 20 años: 0.51 - 4.30' },
    ],
  },
];

// ---------------------------------------------------------------
// EXAMEN DE ORINA (Uroanalisis)
// ---------------------------------------------------------------
const EXAMEN_ORINA: TestSpec[] = [
  { code: 'OR-COL', name: 'COLOR',    category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'Amarillo' }] },
  { code: 'OR-ASP', name: 'ASPECTO',  category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'Transparente' }] },
  { code: 'OR-PH',  name: 'pH',       category: 'Uroanalisis', resultType: ResultType.numeric, decimals: 1, ranges: [{ valueMin: 5, valueMax: 9, displayText: '5 - 9' }] },
  { code: 'OR-DEN', name: 'DENSIDAD', category: 'Uroanalisis', resultType: ResultType.numeric, decimals: 3, ranges: [{ valueMin: 1.000, valueMax: 1.030, displayText: '1.000 - 1.030' }] },
  { code: 'OR-GLU', name: 'GLUCOSA',         category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'TRAZAS', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-CET', name: 'CETONAS',         category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'TRAZAS', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-PRO', name: 'PROTEINA',        category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'TRAZAS', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-BIL', name: 'BILIRRUBINA',     category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-URO', name: 'UROBILINOGENO',   category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-SAN', name: 'SANGRE',          category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'TRAZAS', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-EST', name: 'ESTERASA LEUCOCITARIA', category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-NIT', name: 'NITRITOS',        category: 'Uroanalisis', resultType: ResultType.qualitative, options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'OR-CEL', name: 'CELULAS',         category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'Escasas' }] },
  { code: 'OR-LEU', name: 'LEUCOCITOS (Sedimento)', category: 'Uroanalisis', resultType: ResultType.text, unit: 'cel/cam', ranges: [{ displayText: '< 6 / Campo' }] },
  { code: 'OR-HEM', name: 'HEMATIES (Sedimento)',   category: 'Uroanalisis', resultType: ResultType.text, unit: 'cel/cam', ranges: [{ displayText: '< 5 / Campo' }] },
  { code: 'OR-GER', name: 'GERMENES',        category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'No se observan' }] },
  { code: 'OR-MUC', name: 'FILAMENTO MUCOIDE', category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'No se observan' }] },
  { code: 'OR-CRI', name: 'CRISTALES',       category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'No se observan' }] },
  { code: 'OR-LEV', name: 'LEVADURAS',       category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'No se observan' }] },
  { code: 'OR-CIL', name: 'CILINDRO',        category: 'Uroanalisis', resultType: ResultType.text, ranges: [{ displayText: 'No se observan' }] },
];

// ---------------------------------------------------------------
// Pruebas sueltas (sin panel)
// ---------------------------------------------------------------
const TESTS_SUELTOS: TestSpec[] = [
  { code: 'AMI',  name: 'AMILASA SERICA', category: 'Bioquimica', resultType: ResultType.numeric, unit: 'U/L', method: 'CINETICA', decimals: 1, ranges: [{ valueMin: 25, valueMax: 125, displayText: '25.0 - 125.0' }] },
  { code: 'GLU',  name: 'GLUCOSA',        category: 'Bioquimica', resultType: ResultType.numeric, unit: 'mg/dl', decimals: 0, ranges: [{ valueMin: 75, valueMax: 110, displayText: '75 - 110' }] },
  { code: 'PCR',  name: 'PROTEINA C REACTIVA - PCR CUANTITATIVA', category: 'Inmunologia', resultType: ResultType.numeric, unit: 'mg/L', method: 'TURBIMETRIA', decimals: 2, ranges: [{ valueMin: 0.60, valueMax: 5.00, displayText: '0.60 - 5.00' }] },
  { code: 'FR',   name: 'FACTOR REUMATOIDEO CUANTITATIVO',       category: 'Inmunologia', resultType: ResultType.numeric, unit: 'IU/L', method: 'TURBIMETRIA', decimals: 1, ranges: [{ valueMin: 0, valueMax: 20, displayText: '0.0 - 20.0' }] },
  {
    code: 'IGE', name: 'INMUNOGLOBULINA E (IgE), DOSAJE', category: 'Inmunologia', resultType: ResultType.numeric, unit: 'U/mL', method: 'ECLIA', decimals: 1,
    ranges: [
      { ageMinDays: 365 * 18, valueMin: 0, valueMax: 100, priority: 10, displayText: 'ADULTOS: 0 - 100' },
      { ageMaxDays: 30, valueMin: 0, valueMax: 1.5, priority: 5, displayText: 'NEONATOS: 0 - 1.5' },
      { ageMinDays: 30, ageMaxDays: 365, valueMin: 0, valueMax: 15, priority: 5, displayText: 'RN hasta 1 año: 0 - 15' },
      { ageMinDays: 365, ageMaxDays: 365 * 5, valueMin: 0, valueMax: 60, priority: 5, displayText: 'Niños 1 - 5 años: 0 - 60' },
      { ageMinDays: 365 * 6, ageMaxDays: 365 * 9, valueMin: 0, valueMax: 90, priority: 5, displayText: 'Niños 6 - 9 años: 0 - 90' },
      { ageMinDays: 365 * 10, ageMaxDays: 365 * 15, valueMin: 0, valueMax: 200, priority: 5, displayText: 'Niños 10 - 15 años: 0 - 200' },
    ],
  },
  {
    code: 'VSG', name: 'VELOCIDAD DE SEDIMENTACION GLOBULAR (VSG)', category: 'Hematologia', resultType: ResultType.numeric, unit: 'mm/h', decimals: 0,
    ranges: [
      { sex: Sex.M, valueMin: 0, valueMax: 10, priority: 10, displayText: 'HOMBRES: 0 - 10' },
      { sex: Sex.F, valueMin: 0, valueMax: 15, priority: 10, displayText: 'MUJERES: 0 - 15' },
    ],
  },
  {
    code: 'ANA', name: 'ANA - ANTICUERPOS ANTINUCLEARES', category: 'Inmunologia especial', resultType: ResultType.qualitative, method: 'IFI', options: ['NEGATIVO', 'POSITIVO'],
    ranges: [
      { qualitativeExpected: 'NEGATIVO', priority: 10, displayText: 'NEGATIVO: < 1/100' },
      { qualitativeExpected: 'POSITIVO', priority: 5, displayText: 'POSITIVO: ≥ 1/100' },
    ],
  },
  { code: 'DENG-NS1', name: 'DENGUE - ANTIGENO NS1',  category: 'Inmunologia', resultType: ResultType.qualitative, method: 'Inmunocromatografia', options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'DENG-IGM', name: 'DENGUE - ANTICUERPO IgM', category: 'Inmunologia', resultType: ResultType.qualitative, method: 'Inmunocromatografia', options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
  { code: 'DENG-IGG', name: 'DENGUE - ANTICUERPO IgG', category: 'Inmunologia', resultType: ResultType.qualitative, method: 'Inmunocromatografia', options: ['NEGATIVO', 'POSITIVO'], ranges: [{ qualitativeExpected: 'NEGATIVO', displayText: 'NEGATIVO' }] },
];

const PANELS: PanelSpec[] = [
  {
    code: 'PNL-HGCOMPLETO',
    name: 'HEMOGRAMA COMPLETO',
    description: 'Hemograma de 25 parametros (serie roja, serie blanca, plaquetas).',
    testCodes: HEMOGRAMA.map((t) => t.code),
  },
  {
    code: 'PNL-PERFHEPATICO',
    name: 'PERFIL HEPATICO',
    description: 'TGO, TGP, GGT, FAL, bilirrubinas, proteinas, albumina, globulina.',
    testCodes: PERFIL_HEPATICO.map((t) => t.code),
  },
  {
    code: 'PNL-PERFLIPIDICO',
    name: 'PERFIL LIPIDICO',
    description: 'Colesterol total, trigliceridos, HDL, LDL, VLDL.',
    testCodes: ['COL', 'TRIG', 'HDL', 'LDL', 'VLDL'],
  },
  {
    code: 'PNL-PERFCORONARIO',
    name: 'PERFIL CORONARIO',
    description: 'Perfil lipidico + riesgo coronario + lipidos totales + glucosa.',
    testCodes: ['COL', 'TRIG', 'HDL', 'LDL', 'VLDL', 'RCOR', 'LIPT', 'GLU'],
  },
  {
    code: 'PNL-PERFTIROIDEO',
    name: 'PERFIL TIROIDEO',
    description: 'TSH ultrasensible, T3 total, T4 total.',
    testCodes: PERFIL_TIROIDEO.map((t) => t.code),
  },
  {
    code: 'PNL-ORINA',
    name: 'EXAMEN COMPLETO DE ORINA',
    description: 'Fisico-quimico (10 parametros) + sedimento urinario.',
    testCodes: EXAMEN_ORINA.map((t) => t.code),
  },
  {
    code: 'PNL-DENGUE',
    name: 'PRUEBA DE DENGUE (NS1 + IgM + IgG)',
    description: 'Inmunocromatografia cualitativa para deteccion de dengue.',
    testCodes: ['DENG-NS1', 'DENG-IGM', 'DENG-IGG'],
  },
];

const ALL_TESTS: TestSpec[] = [
  ...HEMOGRAMA,
  ...PERFIL_HEPATICO,
  ...PERFIL_LIPIDICO,
  ...PERFIL_TIROIDEO,
  ...EXAMEN_ORINA,
  ...TESTS_SUELTOS,
];

export async function seedCatalogFromFormats(prisma: PrismaClient): Promise<{
  testsCreated: number;
  testsSkipped: number;
  rangesCreated: number;
  panelsCreated: number;
}> {
  const counters = { testsCreated: 0, testsSkipped: 0, rangesCreated: 0, panelsCreated: 0 };

  // Mapa categoria nombre -> id.
  const cats = await prisma.category.findMany({ where: { deletedAt: null } });
  const catByName = new Map(cats.map((c) => [c.name, c.id]));

  // Cache de tests por codigo para resolver panelTests despues.
  const testByCode = new Map<string, string>();

  for (const spec of ALL_TESTS) {
    const categoryId = catByName.get(spec.category);
    if (!categoryId) {
      console.warn(`[seed-catalog] categoria no encontrada: ${spec.category} (test ${spec.code})`);
      continue;
    }

    const existing = await prisma.test.findFirst({ where: { code: spec.code, deletedAt: null } });
    if (existing) {
      testByCode.set(spec.code, existing.id);
      counters.testsSkipped++;
      continue;
    }

    const test = await prisma.test.create({
      data: {
        code: spec.code,
        name: spec.name,
        shortName: spec.shortName ?? null,
        categoryId,
        resultType: spec.resultType,
        unit: spec.unit ?? null,
        method: spec.method ?? null,
        decimals: spec.decimals ?? 2,
        minCritical: spec.minCritical ?? null,
        maxCritical: spec.maxCritical ?? null,
        status: CatalogStatus.active,
        options: spec.options
          ? {
              create: spec.options.map((v, i) => ({ value: v, displayOrder: i })),
            }
          : undefined,
      },
    });
    testByCode.set(spec.code, test.id);
    counters.testsCreated++;

    if (spec.ranges?.length) {
      const data = spec.ranges.map((r) => ({
        testId: test.id,
        sex: r.sex ?? Sex.A,
        ageMinDays: r.ageMinDays ?? null,
        ageMaxDays: r.ageMaxDays ?? null,
        valueMin: r.valueMin != null ? (r.valueMin as any) : null,
        valueMax: r.valueMax != null ? (r.valueMax as any) : null,
        qualitativeExpected: r.qualitativeExpected ?? null,
        displayText: r.displayText,
        priority: r.priority ?? 0,
      }));
      await prisma.referenceRange.createMany({ data });
      counters.rangesCreated += data.length;
    }
  }

  // Paneles.
  for (const p of PANELS) {
    const existing = await prisma.panel.findFirst({ where: { code: p.code, deletedAt: null } });
    if (existing) continue;

    const panel = await prisma.panel.create({
      data: {
        code: p.code,
        name: p.name,
        description: p.description ?? null,
        status: CatalogStatus.active,
      },
    });
    counters.panelsCreated++;

    // Asocia tests al panel, respetando el orden.
    const panelTests = p.testCodes
      .map((code, idx) => {
        const tid = testByCode.get(code);
        if (!tid) {
          console.warn(`[seed-catalog] panel ${p.code} referencia test inexistente ${code}`);
          return null;
        }
        return { panelId: panel.id, testId: tid, displayOrder: idx };
      })
      .filter((x): x is { panelId: string; testId: string; displayOrder: number } => x != null);

    if (panelTests.length) {
      await prisma.panelTest.createMany({ data: panelTests });
    }
  }

  return counters;
}
