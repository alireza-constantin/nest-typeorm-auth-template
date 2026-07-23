import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserStatus } from '../users/user.entity';
import { PasswordCredential } from '../users/password-credential.entity';
import { SessionService } from '../session';
import { AbuseProtectionService, requestIpAddress } from '../platform/security';
import { PasswordService } from './password.service';
import type { SafeUserResponse } from './auth.types';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}

function isActive(user: User): boolean {
  return user.status === UserStatus.ACTIVE;
}

function toSafeUser(user: User): SafeUserResponse {
  const candidate = user as unknown as {
    emailVerifiedAt: Date | null;
  };
  return {
    id: user.id,
    email: user.email,
    emailVerified: candidate.emailVerifiedAt !== null,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(PasswordCredential)
    private readonly credentials: Repository<PasswordCredential>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly abuseProtection: AbuseProtectionService,
  ) {}

  async register(
    dto: RegisterDto,
    request: Request,
  ): Promise<SafeUserResponse> {
    if (this.config.get<boolean>('publicRegistration') === false) {
      throw new NotFoundException();
    }

    await this.abuseProtection.consumeRegistration(
      requestIpAddress(request),
      dto.email,
    );

    const email = dto.email.trim();
    const normalizedEmail = normalizeEmail(dto.email);
    const passwordHash = await this.passwords.hash(dto.password);

    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const credentials = manager.getRepository(PasswordCredential);
        const createdUser = await users.save(
          users.create({
            email,
            emailNormalized: normalizedEmail,
            status: UserStatus.ACTIVE,
            authVersion: 0,
            emailVerifiedAt: null,
          }),
        );
        await credentials.save(
          credentials.create({
            userId: createdUser.id,
            passwordHash,
            passwordChangedAt: new Date(),
          }),
        );
        return createdUser;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    if (this.config.get<boolean>('requireEmailVerification') !== true) {
      await this.establishSession(request, user.id, user.authVersion);
    }
    return toSafeUser(user);
  }

  async login(dto: LoginDto, request: Request): Promise<SafeUserResponse> {
    await this.abuseProtection.consumeLogin(
      requestIpAddress(request),
      dto.email,
    );
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.users.findOne({
      where: { emailNormalized: normalizedEmail },
    });

    if (!user || !isActive(user)) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const credential = await this.credentials
      .createQueryBuilder('credential')
      .addSelect('credential.passwordHash')
      .where('credential.userId = :userId', { userId: user.id })
      .getOne();

    if (
      !credential ||
      !(await this.passwords.verify(credential.passwordHash, dto.password))
    ) {
      if (!credential) await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.abuseProtection.resetLoginAfterSuccess(dto.email);

    if (
      this.config.get<boolean>('requireEmailVerification') === true &&
      user.emailVerifiedAt === null
    ) {
      throw new ForbiddenException('Email verification is required');
    }

    await this.establishSession(request, user.id, user.authVersion);
    return toSafeUser(user);
  }

  async logout(request: Request): Promise<void> {
    await this.sessions.destroy(request.session);
  }

  async logoutAll(userId: string, request: Request): Promise<void> {
    await this.users.increment({ id: userId }, 'authVersion', 1);
    await this.sessions.destroy(request.session);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    request: Request,
  ): Promise<void> {
    const credential = await this.credentials
      .createQueryBuilder('credential')
      .addSelect('credential.passwordHash')
      .where('credential.userId = :userId', { userId })
      .getOne();

    if (
      !credential ||
      !(await this.passwords.verify(
        credential.passwordHash,
        dto.currentPassword,
      ))
    ) {
      if (!credential) await this.passwords.verifyDummy(dto.currentPassword);
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await this.passwords.verify(credential.passwordHash, dto.newPassword)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    const nextAuthVersion = await this.dataSource.transaction(
      async (manager) => {
        const users = manager.getRepository(User);
        const credentials = manager.getRepository(PasswordCredential);
        const user = await users.findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user || !isActive(user)) {
          throw new UnauthorizedException();
        }

        await credentials.update(
          { userId },
          { passwordHash, passwordChangedAt: new Date() },
        );
        const currentVersion = user.authVersion;
        await users.update({ id: userId }, { authVersion: currentVersion + 1 });
        return currentVersion + 1;
      },
    );

    // Changing the password revokes every old session. The current browser gets
    // a newly generated session so the user is not needlessly signed out.
    await this.establishSession(request, userId, nextAuthVersion);
  }

  private establishSession(
    request: Request,
    userId: string,
    authVersion: number,
  ): Promise<void> {
    return this.sessions.establishAuthenticatedSession(request, {
      userId,
      authVersion,
      authenticationMethod: 'password',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
