import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { Rfc7807ExceptionFilter } from '../../src/shared/filters/rfc7807-exception.filter';

// Bootstrap minimo de la app para tests. Replica los pipes/filtros/middleware
// criticos de produccion (validation, cookies, RFC7807). NO inicia helmet ni
// compression porque agregan ruido al output sin valor para los assertions.
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  await app.init();
  return app;
}

export const ADMIN_CREDS = {
  identifier: 'admin@laboratorio.com',
  password: 'Admin123!',
};
