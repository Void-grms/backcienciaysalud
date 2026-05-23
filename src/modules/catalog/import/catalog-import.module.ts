import { Module } from '@nestjs/common';
import { ImportTemplateService } from './import-template.service';
import { ImportTestsService } from './import-tests.service';
import { XlsxParserService } from './xlsx-parser.service';

@Module({
  providers: [ImportTemplateService, ImportTestsService, XlsxParserService],
  exports: [ImportTemplateService, ImportTestsService],
})
export class CatalogImportModule {}
