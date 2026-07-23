import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiCsrfProtected, ApiSessionAuthenticated } from '../../openapi';
import { RequestContextService } from '../../observability';
import { AdminApi, RequirePermissions } from '../enforcement';
import { PermissionKey } from '../data';
import {
  CreateStaffDto,
  ReplaceStaffRolesDto,
  StaffPaginationDto,
} from './dto';
import {
  StaffLifecycleService,
  type StaffActor,
  type StaffProfileResponse,
} from './staff-lifecycle.service';

@AdminApi()
@ApiTags('Administration')
@ApiSessionAuthenticated()
@Controller('admin')
export class StaffAdminController {
  constructor(
    private readonly staff: StaffLifecycleService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the current staff authorization profile' })
  @RequirePermissions(PermissionKey.ADMIN_ACCESS)
  async me(@Req() request: Request): Promise<StaffProfileResponse> {
    return this.staff.me(this.actor(request));
  }

  @Get('staff')
  @ApiOperation({
    summary: 'List staff profiles using bounded cursor pagination',
  })
  @RequirePermissions(PermissionKey.STAFF_READ)
  @ApiForbiddenResponse()
  async list(@Query() query: StaffPaginationDto) {
    return this.staff.list(query.cursor, query.limit);
  }

  @Post('staff')
  @ApiOperation({ summary: 'Promote an existing user to staff' })
  @ApiCsrfProtected()
  @RequirePermissions(
    PermissionKey.STAFF_CREATE,
    PermissionKey.STAFF_ASSIGN_ROLES,
  )
  @ApiConflictResponse({ description: 'The user is already staff.' })
  @ApiNotFoundResponse({
    description: 'The user or a requested role was not found.',
  })
  @ApiForbiddenResponse({
    description: 'The actor cannot assign the requested role.',
  })
  @ApiServiceUnavailableResponse()
  async create(
    @Body() dto: CreateStaffDto,
    @Req() request: Request,
  ): Promise<StaffProfileResponse> {
    return this.staff.create(this.context(request), dto.userId, dto.roleKeys);
  }

  @Put('staff/:userId/roles')
  @ApiOperation({
    summary: 'Atomically replace a staff profile role assignments',
  })
  @ApiCsrfProtected()
  @RequirePermissions(PermissionKey.STAFF_ASSIGN_ROLES)
  @ApiConflictResponse({
    description: 'The last active owner cannot be demoted.',
  })
  @ApiNotFoundResponse({
    description: 'The staff profile or a requested role was not found.',
  })
  @ApiForbiddenResponse({
    description: 'The actor cannot assign the requested role.',
  })
  async replaceRoles(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: ReplaceStaffRolesDto,
    @Req() request: Request,
  ): Promise<StaffProfileResponse> {
    return this.staff.replaceRoles(this.context(request), userId, dto.roleKeys);
  }

  @Post('staff/:userId/suspend')
  @ApiOperation({
    summary: 'Suspend administrative access for a staff profile',
  })
  @ApiCsrfProtected()
  @RequirePermissions(PermissionKey.STAFF_SUSPEND)
  @ApiConflictResponse({
    description: 'The last active owner cannot be suspended.',
  })
  async suspend(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: Request,
  ): Promise<StaffProfileResponse> {
    return this.staff.suspend(this.context(request), userId);
  }

  @Post('staff/:userId/activate')
  @ApiOperation({
    summary: 'Restore administrative access for a staff profile',
  })
  @ApiCsrfProtected()
  @RequirePermissions(PermissionKey.STAFF_SUSPEND)
  async activate(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: Request,
  ): Promise<StaffProfileResponse> {
    return this.staff.activate(this.context(request), userId);
  }

  @Get('roles')
  @ApiOperation({
    summary: 'List built-in roles and their explicit permissions',
  })
  @RequirePermissions(PermissionKey.ROLES_READ)
  @ApiUnauthorizedResponse()
  async roles() {
    return this.staff.listRoles();
  }

  private actor(request: Request): StaffActor {
    const authorization = request.authorization;
    if (!authorization) throw new ServiceUnavailableException();
    return {
      userId: authorization.userId,
      permissions: authorization.permissions,
    };
  }

  private context(request: Request) {
    const requestId = this.requestContext.getRequestId();
    if (!requestId) throw new ServiceUnavailableException();
    return { actor: this.actor(request), requestId };
  }
}
