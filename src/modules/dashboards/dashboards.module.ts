import { Module } from '@nestjs/common';

import { PrismaModule } from '@shared/prisma/prisma.module';

import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
