import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiSessionAuthenticated } from '../../openapi';
import { PermissionKey } from '../data';
import { AdminApi, RequirePermissions } from '../enforcement';
import {
  AuditEventsService,
  type AuditEventListResponse,
} from './audit-events.service';
import { AuditEventsQueryDto } from './dto';

@AdminApi()
@ApiTags('Administration')
@ApiSessionAuthenticated()
@Controller('admin/audit-events')
export class AuditEventsController {
  constructor(private readonly audits: AuditEventsService) {}

  @Get()
  @RequirePermissions(PermissionKey.AUDIT_READ)
  @ApiOperation({
    summary: 'List successful administrative audit events',
    description:
      'Requires `admin.access` and `audit.read`. Results are newest-first, cursor-paginated, and expose only safe audit fields.',
  })
  @ApiOkResponse({ description: 'A bounded page of safe audit events.' })
  @ApiBadRequestResponse({ description: 'The cursor or query is invalid.' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiServiceUnavailableResponse({
    description: 'Authorization data is unavailable; access fails closed.',
  })
  list(@Query() query: AuditEventsQueryDto): Promise<AuditEventListResponse> {
    return this.audits.list(query);
  }
}
