import {
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/modules/identity/auth/auth.controller';
import { AuthService } from '../src/modules/identity/auth/auth.service';
import {
  SESSION_CONFIGURATION,
  type SessionConfiguration,
} from '../src/modules/identity/session';

describe('Authentication HTTP contract', () => {
  let app: INestApplication;
  let server: App;
  const auth = {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    changePassword: jest.fn(),
  };
  const sessionConfiguration: SessionConfiguration = {
    absoluteTtlSeconds: 30 * 24 * 60 * 60,
    idleTtlSeconds: 7 * 24 * 60 * 60,
    cookieName: '__Host-bc.sid',
    keyPrefix: 'test:sess:',
    secrets: ['0123456789abcdef0123456789abcdef'],
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: SESSION_CONFIGURATION, useValue: sessionConfiguration },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    server = app.getHttpServer() as App;
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => app.close());

  it('registers with the safe user response contract', async () => {
    auth.register.mockResolvedValue({
      id: '110f47ac-10b8-4d10-9338-031a8b115236',
      email: 'customer@example.com',
      emailVerified: false,
    });

    const response = await request(server).post('/auth/register').send({
      email: 'customer@example.com',
      password: 'a-long-test-password',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: '110f47ac-10b8-4d10-9338-031a8b115236',
      email: 'customer@example.com',
      emailVerified: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it('rejects invalid registration input before calling the domain service', async () => {
    await request(server)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('keeps failed-login responses generic', async () => {
    auth.login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    await request(server)
      .post('/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'a-long-test-password',
      })
      .expect(401)
      .expect((response) => {
        const body = response.body as { message?: unknown };
        expect(body.message).toBe('Invalid email or password');
      });
  });

  it('clears the configured session cookie on logout', async () => {
    auth.logout.mockResolvedValue(undefined);

    const response = await request(server).post('/auth/logout').expect(204);

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('__Host-bc.sid=;');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });
});
