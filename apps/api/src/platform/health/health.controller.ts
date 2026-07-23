import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../http/authentication';
import { VERSION_NEUTRAL } from '../openapi';
import { HealthService, type ReadinessResult } from './health.service';

@Public()
@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process-only check. It must stay healthy during a dependency outage. */
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiResponse({ status: 200, description: 'The HTTP process is alive.' })
  @Get('live')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Traffic-admission check. Both authoritative stores must be available. */
  @ApiOperation({ summary: 'Dependency readiness probe' })
  @ApiResponse({
    status: 200,
    description: 'PostgreSQL and Redis are both available.',
  })
  @ApiResponse({
    status: 503,
    description: 'At least one authoritative dependency is unavailable.',
  })
  @Get('ready')
  async readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResult> {
    const result = await this.health.readiness();
    response.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return result;
  }
}
