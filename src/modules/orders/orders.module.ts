import { Module } from '@nestjs/common';
import { OrderCodeService } from './order-code.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderCodeService],
  exports: [OrdersService, OrderCodeService],
})
export class OrdersModule {}
