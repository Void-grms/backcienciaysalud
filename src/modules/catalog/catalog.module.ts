import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';
import { PanelsModule } from './panels/panels.module';
import { ReferenceRangesModule } from './reference-ranges/reference-ranges.module';
import { TestsModule } from './tests/tests.module';

@Module({
  imports: [CategoriesModule, TestsModule, ReferenceRangesModule, PanelsModule],
  exports: [CategoriesModule, TestsModule, ReferenceRangesModule, PanelsModule],
})
export class CatalogModule {}
