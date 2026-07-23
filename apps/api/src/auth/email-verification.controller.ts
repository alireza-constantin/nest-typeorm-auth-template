import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AbuseProtectionInterceptor } from '../platform/security';
import { Public } from '../platform/http/authentication';
import { EmailVerificationService } from './email-verification.service';
import { RequestEmailVerificationDto } from './dto/request-email-verification.dto';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { SafeUserResponseDto } from './dto/safe-user-response.dto';
import { ApiCsrfProtected } from '../platform/openapi';

@Public()
@ApiTags('Email verification')
@Controller('auth/email-verification')
@UseInterceptors(new AbuseProtectionInterceptor())
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request an email-verification message' })
  @ApiCsrfProtected()
  @ApiAcceptedResponse({
    description: 'Accepted without revealing whether an account exists.',
  })
  @ApiNotFoundResponse({ description: 'Email verification is disabled.' })
  @ApiServiceUnavailableResponse({
    description: 'Email delivery is not configured or unavailable.',
  })
  @Post('request')
  async request(
    @Body() dto: RequestEmailVerificationDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.verification.request(dto.email, request);
    return {
      message: 'If the account can be verified, an email will be sent',
    };
  }

  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume an email-verification token' })
  @ApiCsrfProtected()
  @ApiOkResponse({ type: SafeUserResponseDto })
  @ApiNotFoundResponse({ description: 'Email verification is disabled.' })
  @Post('confirm')
  confirm(@Body() dto: ConfirmEmailVerificationDto, @Req() request: Request) {
    return this.verification.confirm(dto.token, request);
  }
}
