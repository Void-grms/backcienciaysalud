import { Module } from '@nestjs/common';

import { OrdersModule } from '@modules/orders/orders.module';
import { ReportsModule } from '@modules/reports/reports.module';

import { PatientPortalController } from './patient-portal.controller';
import { ReferencePortalController } from './reference-portal.controller';
import { ReferencePortalService } from './reference-portal.service';

@Module({
  imports: [OrdersModule, ReportsModule],
  controllers: [PatientPortalController, ReferencePortalController],
  providers: [ReferencePortalService],
})
export class PortalModule {}
