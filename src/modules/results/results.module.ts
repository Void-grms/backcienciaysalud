import { Module } from '@nestjs/common';

import { OrdersModule } from '@modules/orders/orders.module';
import { ReferenceRangesModule } from '@modules/catalog/reference-ranges/reference-ranges.module';

import { ResultFlaggerService } from './result-flagger.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [OrdersModule, ReferenceRangesModule],
  controllers: [ResultsController],
  providers: [ResultsService, ResultFlaggerService],
  exports: [ResultsService, ResultFlaggerService],
})
export class ResultsModule {}
