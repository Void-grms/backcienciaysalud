import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from '@config/env.validation';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { StorageModule } from '@shared/storage/storage.module';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { TestAwareThrottlerGuard } from '@shared/guards/test-aware-throttler.guard';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { DashboardsModule } from '@modules/dashboards/dashboards.module';
import { HealthModule } from '@modules/health/health.module';
import { LabConfigModule } from '@modules/lab-config/lab-config.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PatientsModule } from '@modules/patients/patients.module';
import { PortalModule } from '@modules/portal/portal.module';
import { ProfessionalsModule } from '@modules/professionals/professionals.module';
import { ReferencesModule } from '@modules/references/references.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { ResultsModule } from '@modules/results/results.module';
import { StorageHttpModule } from '@modules/storage/storage-http.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => validateEnv(raw),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss.l' },
              },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.currentPassword',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (req) => req.url === '/api/v1/health',
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    ReferencesModule,
    ProfessionalsModule,
    CatalogModule,
    OrdersModule,
    ResultsModule,
    ReportsModule,
    NotificationsModule,
    PortalModule,
    HealthModule,
    LabConfigModule,
    StorageHttpModule,
    AuditModule,
    DashboardsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TestAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
