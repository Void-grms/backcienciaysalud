import { Module } from '@nestjs/common';
import { LabConfigController } from './lab-config.controller';
import { LabConfigService } from './lab-config.service';

@Module({
  controllers: [LabConfigController],
  providers: [LabConfigService],
  exports: [LabConfigService],
})
export class LabConfigModule {}
