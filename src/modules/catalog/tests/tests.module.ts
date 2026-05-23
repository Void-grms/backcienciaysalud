import { Module } from '@nestjs/common';
import { CatalogImportModule } from '@modules/catalog/import/catalog-import.module';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [CatalogImportModule],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
