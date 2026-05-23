import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '@shared/decorators/roles.decorator';

import { AuditService } from './audit.service';
import { ListAuditDto } from './dto/list-audit.dto';

@ApiTags('audit')
@ApiBearerAuth('JWT')
@Roles(UserRole.admin)
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Lista entradas de auditoria con filtros' })
  list(@Query() query: ListAuditDto) {
    return this.service.list(query);
  }
}
