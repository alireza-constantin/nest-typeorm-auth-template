import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/user.entity';
import { SessionService } from '../session';
import { IS_PUBLIC_KEY } from './auth.constants';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const session = request.session;
    if (!session?.userId || session.authVersion === undefined) {
      throw new UnauthorizedException();
    }

    if (
      !Number.isFinite(session.absoluteExpiresAt) ||
      session.absoluteExpiresAt! <= Date.now()
    ) {
      await this.invalidate(request);
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.users.findOne({ where: { id: session.userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.authVersion !== session.authVersion ||
      (this.config.get<boolean>('requireEmailVerification') === true &&
        user.emailVerifiedAt === null)
    ) {
      await this.invalidate(request);
      throw new UnauthorizedException();
    }

    request.authUser = {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
    };
    return true;
  }

  private async invalidate(request: Request): Promise<void> {
    try {
      await this.sessions.destroy(request.session);
    } catch {
      // Authentication must still fail closed if Redis is unavailable while an
      // invalid session is being removed.
    }
  }
}
