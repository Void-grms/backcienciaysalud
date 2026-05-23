import { Module } from '@nestjs/common';
import { RangeResolverService } from './range-resolver.service';
import { ReferenceRangesController } from './reference-ranges.controller';
import { ReferenceRangesService } from './reference-ranges.service';

@Module({
  controllers: [ReferenceRangesController],
  providers: [ReferenceRangesService, RangeResolverService],
  exports: [ReferenceRangesService, RangeResolverService],
})
export class ReferenceRangesModule {}
