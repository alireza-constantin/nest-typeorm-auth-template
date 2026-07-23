import { Controller, Get, Header, Req } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { CsrfService } from './csrf.service';

export class CsrfTokenResponse {
  @ApiProperty({
    description:
      'Session-bound value to send as x-csrf-token on state-changing requests.',
  })
  csrfToken: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class CsrfController {
  constructor(private readonly csrf: CsrfService) {}

  @Public()
  @ApiOperation({
    summary:
      'Issue a CSRF token for the current anonymous or authenticated session',
  })
  @ApiOkResponse({ type: CsrfTokenResponse })
  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  async issue(@Req() request: Request): Promise<CsrfTokenResponse> {
    return { csrfToken: await this.csrf.issue(request) };
  }
}
