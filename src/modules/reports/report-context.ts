import { OrderState, ResultFlag, ResultType } from '@prisma/client';

// Forma del objeto que recibe la plantilla Handlebars. Mantenemos esto fuera
// de los modelos Prisma para no acoplar la presentacion al ORM.

export interface ReportLab {
  commercialName: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  primaryColor: string;
  logoUrl: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
}

export interface ReportPatient {
  fullName: string;
  documentType: string;
  documentNumber: string;
  birthDate: string | null;
  sex: string;
  age: string;
}

export interface ReportOrder {
  code: string;
  state: OrderState;
  isAmended: boolean;
  previousCode: string | null;
  requestingDoctor: string | null;
  reference: string | null;
  sampleTakenAt: string | null;
  validatedAt: string | null;
  deliveredAt: string | null;
}

// Cada linea de rango referencial que se imprime en la celda "Rango de Referencia".
// Cuando el rango tiene displayText lo respetamos literal (preserva las
// segmentaciones tipo "VARONES: 14-18 gr/dl" como vienen del catalogo).
// Cuando no, lo armamos a partir de valueMin/valueMax + sex/edad inferidos.
export interface ReportRangeLine {
  text: string;
  highlighted: boolean;
}

export interface ReportResultRow {
  testName: string;
  testCode: string;
  unit: string | null;
  method: string | null;
  resultType: ResultType;
  decimals: number;
  valueNumeric: number | null;
  valueText: string | null;
  observation: string | null;
  flag: ResultFlag;
  ranges: ReportRangeLine[];
}

// Sub-grupo dentro de una categoria: si los items vienen del mismo panel se
// imprime su nombre como sub-cabecera (HEMOGRAMA COMPLETO debajo de
// HEMATOLOGIA). Los items sueltos van al grupo sin nombre.
export interface ReportPanelGroup {
  panelName: string | null;
  rows: ReportResultRow[];
}

export interface ReportCategoryGroup {
  categoryName: string;
  categoryColor: string;
  panels: ReportPanelGroup[];
  showMethodColumn: boolean;
}

export interface ReportProfessional {
  fullName: string;
  professionalTitle: string | null;
  licenseNumber: string | null;
  signatureUrl: string | null;
}

export interface ReportContext {
  lab: ReportLab;
  patient: ReportPatient;
  order: ReportOrder;
  categories: ReportCategoryGroup[];
  professionals: ReportProfessional[];
  qrDataUrl: string | null;
  verificationUrl: string | null;
  reportVersion: number;
  generatedAt: string;
}
