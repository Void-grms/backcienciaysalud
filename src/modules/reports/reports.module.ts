import { Module } from '@nestjs/common';

import { OrdersModule } from '@modules/orders/orders.module';

import { PdfService } from './pdf.service';
import { ReportTokenService } from './report-token.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TemplateRendererService } from './template-renderer.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [OrdersModule],
  controllers: [ReportsController, VerificationController],
  providers: [ReportsService, PdfService, TemplateRendererService, ReportTokenService],
  exports: [ReportsService, ReportTokenService],
})
export class ReportsModule {}
