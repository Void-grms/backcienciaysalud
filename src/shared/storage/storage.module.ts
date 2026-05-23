import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '@config/env.validation';

import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const driver = config.get('STORAGE_DRIVER', { infer: true });
        if (driver === 's3') {
          // Implementacion S3 pendiente (Sprint posterior).
          throw new Error('STORAGE_DRIVER=s3 aun no implementado');
        }
        return new LocalStorageService(config);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
