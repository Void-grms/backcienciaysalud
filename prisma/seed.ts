import {
  CatalogStatus,
  DocumentType,
  PrismaClient,
  ResultType,
  Sex,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { seedCatalogFromFormats } from './seed-catalog';

const prisma = new PrismaClient();

const BASE_CATEGORIES = [
  { name: 'Hematologia', color: '#DC2626', displayOrder: 1 },
  { name: 'Bioquimica', color: '#2563EB', displayOrder: 2 },
  { name: 'Inmunologia', color: '#7C3AED', displayOrder: 3 },
  { name: 'Inmunologia especial', color: '#9333EA', displayOrder: 4 },
  { name: 'Uroanalisis', color: '#CA8A04', displayOrder: 5 },
  { name: 'Microbiologia', color: '#0F766E', displayOrder: 6 },
];

async function seedAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@laboratorio.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const bcryptCost = Number(process.env.PASSWORD_BCRYPT_COST ?? 12);
  const passwordHash = await bcrypt.hash(adminPassword, bcryptCost);

  return prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.admin,
      status: UserStatus.active,
      fullName: 'Admin Laboratorio',
      mustChangePassword: false,
    },
  });
}

async function seedPatientUser() {
  const bcryptCost = Number(process.env.PASSWORD_BCRYPT_COST ?? 12);
  const documentNumber = '12345678';

  const patient = await prisma.patient.upsert({
    where: {
      documentType_documentNumber: {
        documentType: DocumentType.DNI,
        documentNumber,
      },
    },
    update: {},
    create: {
      documentType: DocumentType.DNI,
      documentNumber,
      firstName: 'Maria',
      lastName: 'Paciente Demo',
      birthDate: new Date('1990-05-15'),
      sex: Sex.F,
      phone: '+51999111222',
      email: 'paciente.demo@laboratorio.com',
    },
  });

  const passwordHash = await bcrypt.hash('Paciente123!', bcryptCost);
  const user = await prisma.user.upsert({
    where: { documentNumber },
    update: { patientId: patient.id },
    create: {
      documentNumber,
      passwordHash,
      role: UserRole.patient,
      status: UserStatus.active,
      fullName: 'Maria Paciente Demo',
      patientId: patient.id,
      mustChangePassword: false,
    },
  });

  return { patient, user };
}

async function seedReferenceUser() {
  const bcryptCost = Number(process.env.PASSWORD_BCRYPT_COST ?? 12);
  const referenceEmail = 'referencia.demo@laboratorio.com';
  const referenceName = 'Clinica Demo SAC';

  // El modelo Reference no tiene unique fuera del id, hacemos findFirst + create.
  const reference =
    (await prisma.reference.findFirst({ where: { name: referenceName, deletedAt: null } })) ??
    (await prisma.reference.create({
      data: {
        name: referenceName,
        taxId: '20123456789',
        contactName: 'Dr. Juan Referente',
        contactEmail: referenceEmail,
        contactPhone: '+51998877665',
      },
    }));

  const passwordHash = await bcrypt.hash('Referencia123!', bcryptCost);
  const user = await prisma.user.upsert({
    where: { email: referenceEmail },
    update: { referenceId: reference.id },
    create: {
      email: referenceEmail,
      passwordHash,
      role: UserRole.reference_user,
      status: UserStatus.active,
      fullName: 'Dr. Juan Referente',
      referenceId: reference.id,
      mustChangePassword: false,
    },
  });

  return { reference, user };
}

async function seedLabConfig() {
  const existing = await prisma.labConfig.findFirst();
  if (existing) return existing;
  return prisma.labConfig.create({
    data: {
      commercialName: 'Laboratorio Clinico',
      primaryColor: '#0F766E',
    },
  });
}

async function seedProfessional() {
  const existing = await prisma.professional.findFirst({
    where: { fullName: 'Profesional Placeholder' },
  });
  if (existing) return existing;
  return prisma.professional.create({
    data: {
      fullName: 'Profesional Placeholder',
      professionalTitle: 'Tecnologo Medico',
      licenseNumber: 'CTMP-00000',
      status: CatalogStatus.active,
    },
  });
}

async function seedCategories(defaultProfessionalId: string) {
  for (const cat of BASE_CATEGORIES) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { ...cat, defaultProfessionalId },
    });
  }
}

async function seedSampleHemogram() {
  const hematologia = await prisma.category.findUnique({
    where: { name: 'Hematologia' },
  });
  if (!hematologia) return;

  const existing = await prisma.test.findFirst({
    where: { code: 'HB', deletedAt: null },
  });
  if (existing) return;

  const test = await prisma.test.create({
    data: {
      code: 'HB',
      name: 'Hemoglobina',
      shortName: 'Hb',
      categoryId: hematologia.id,
      resultType: ResultType.numeric,
      unit: 'g/dL',
      method: 'Espectrofotometria',
      decimals: 1,
      minCritical: 7,
      maxCritical: 20,
      referenceText: 'Adulto sano: 12-17 g/dL segun sexo.',
    },
  });

  // Rangos basicos del hemograma:
  //  - Mujeres adultas: 12.0 - 15.5 g/dL
  //  - Hombres adultos: 13.5 - 17.5 g/dL
  //  - Ninos 1-12 anos: 11.0 - 14.0 g/dL
  await prisma.referenceRange.createMany({
    data: [
      {
        testId: test.id,
        sex: Sex.F,
        ageMinDays: 365 * 13,
        valueMin: 12.0,
        valueMax: 15.5,
        priority: 10,
      },
      {
        testId: test.id,
        sex: Sex.M,
        ageMinDays: 365 * 13,
        valueMin: 13.5,
        valueMax: 17.5,
        priority: 10,
      },
      {
        testId: test.id,
        sex: Sex.A,
        ageMinDays: 365,
        ageMaxDays: 365 * 12,
        valueMin: 11.0,
        valueMax: 14.0,
        priority: 5,
      },
    ],
  });
}

async function main() {
  const admin = await seedAdmin();
  const lab = await seedLabConfig();
  const professional = await seedProfessional();
  await seedCategories(professional.id);
  await seedSampleHemogram();
  const catalog = await seedCatalogFromFormats(prisma);
  const { patient, user: patientUser } = await seedPatientUser();
  const { reference, user: referenceUser } = await seedReferenceUser();

  console.log('Seed completado:');
  console.log('  - LabConfig:       ', lab.commercialName);
  console.log('  - Profesional:     ', professional.fullName);
  console.log('  - Categorias:      ', BASE_CATEGORIES.length);
  console.log('  - Catalogo de pruebas:');
  console.log('      tests creados:  ', catalog.testsCreated);
  console.log('      tests existentes:', catalog.testsSkipped);
  console.log('      rangos creados:  ', catalog.rangesCreated);
  console.log('      paneles creados: ', catalog.panelsCreated);
  console.log('');
  console.log('Usuarios de prueba (los 3 roles):');
  console.log('  [ADMIN]      login:', admin.email,        '  /  password: Admin123!');
  console.log('  [PACIENTE]   login:', patientUser.documentNumber, '       /  password: Paciente123!');
  console.log('               ->', patient.firstName, patient.lastName);
  console.log('  [REFERENCIA] login:', referenceUser.email, '  /  password: Referencia123!');
  console.log('               ->', reference.name);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
