import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { DataSource, IsNull, Repository } from 'typeorm';
import { EmailVerificationToken } from '../users/email-verification-token.entity';
import { User } from '../users/user.entity';
import { AbuseProtectionService, requestIpAddress } from '../security';
import { EMAIL_VERIFICATION_DELIVERY } from './auth.constants';
import type { EmailVerificationDelivery, SafeUserResponse } from './auth.types';
import { normalizeEmail } from './auth.service';

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

@Injectable()
export class EmailVerificationService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EmailVerificationToken)
    private readonly tokens: Repository<EmailVerificationToken>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly abuseProtection: AbuseProtectionService,
    @Optional()
    @Inject(EMAIL_VERIFICATION_DELIVERY)
    private readonly delivery?: EmailVerificationDelivery,
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<boolean>('requireEmailVerification') === true &&
      !this.delivery
    ) {
      throw new Error(
        'Email verification is required but no delivery adapter is configured',
      );
    }
  }

  async request(email: string, request: Request): Promise<void> {
    this.assertEnabled();
    if (!this.delivery) {
      throw new ServiceUnavailableException(
        'Email verification delivery is not configured',
      );
    }

    await this.abuseProtection.consumeEmailVerificationRequest(
      requestIpAddress(request),
      email,
    );

    const emailNormalized = normalizeEmail(email);
    const user = await this.users.findOne({ where: { emailNormalized } });
    if (!user || user.emailVerifiedAt) return;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);
    const created = await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(EmailVerificationToken);
      await tokens.update(
        { userId: user.id, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      return tokens.save(
        tokens.create({
          userId: user.id,
          emailNormalized,
          tokenHash: this.digest(token),
          expiresAt,
          consumedAt: null,
        }),
      );
    });

    try {
      await this.delivery.sendVerificationEmail({
        email: user.email,
        token,
        expiresAt,
      });
    } catch (error) {
      await this.tokens.delete({ id: created.id });
      throw error;
    }
  }

  async confirm(rawToken: string, request: Request): Promise<SafeUserResponse> {
    this.assertEnabled();
    await this.abuseProtection.consumeEmailVerificationConfirmation(
      requestIpAddress(request),
      rawToken,
    );
    const tokenHash = this.digest(rawToken);
    const user = await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(EmailVerificationToken);
      const token = await tokens
        .createQueryBuilder('token')
        .addSelect('token.tokenHash')
        .setLock('pessimistic_write')
        .where('token.tokenHash = :tokenHash', { tokenHash })
        .andWhere('token.consumedAt IS NULL')
        .andWhere('token.expiresAt > :now', { now: new Date() })
        .getOne();
      if (!token) throw new BadRequestException('Invalid or expired token');

      const user = await manager.getRepository(User).findOne({
        where: {
          id: token.userId,
          emailNormalized: token.emailNormalized,
        },
      });
      if (!user) throw new BadRequestException('Invalid or expired token');

      token.consumedAt = new Date();
      user.emailVerifiedAt = new Date();
      await tokens.save(token);
      await manager.getRepository(User).save(user);
      return user;
    });

    return {
      id: user.id,
      email: user.email,
      emailVerified: true,
    };
  }

  private assertEnabled(): void {
    if (this.config.get<boolean>('requireEmailVerification') !== true) {
      throw new NotFoundException();
    }
  }

  private digest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
