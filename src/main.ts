import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { setupSwagger } from '@config/swagger.config';
import { Rfc7807ExceptionFilter } from '@shared/filters/rfc7807-exception.filter';
import type { Env } from '@config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // Detras de Railway/Cloudflare/Nginx la conexion HTTPS termina en el proxy.
  // Sin `trust proxy`, Express ve la conexion como HTTP y `req.ip` reporta la
  // IP del LB en vez de la del cliente — necesario para que las cookies
  // `secure: true` se acepten y para auditar IPs reales.
  app.set('trust proxy', 1);

  // El prefijo global ya contiene la version; el versioning URI agregaria
  // otro `v1` extra a cada ruta. Por ahora basta con prefix manual; cuando
  // necesitemos v2 lo migramos a `setGlobalPrefix('api') + enableVersioning`.
  app.setGlobalPrefix('api/v1');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.get('FRONT_URL', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  setupSwagger(app, config.get('APP_NAME', { infer: true }));

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Lab Clinico API arrancada en http://localhost:${port}`);
  logger.log(`Swagger disponible en  http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error fatal al arrancar la API:', err);
  process.exit(1);
});
