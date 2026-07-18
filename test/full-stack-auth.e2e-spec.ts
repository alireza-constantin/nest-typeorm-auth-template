import type { INestApplication } from '@nestjs/common';
import request, { type Response, type SuperAgentTest } from 'supertest';
import type { App } from 'supertest/types';
import {
  clearFullStackTestData,
  createFullApplication,
} from './full-app.helper';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'even better horse battery staple';

interface CsrfState {
  token: string;
  response: Response;
}

async function csrf(agent: SuperAgentTest): Promise<CsrfState> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  const body = response.body as { csrfToken: string };
  return { token: body.csrfToken, response };
}

async function register(
  agent: SuperAgentTest,
  email: string,
  password = PASSWORD,
): Promise<Response> {
  const state = await csrf(agent);
  return agent
    .post('/api/v1/auth/register')
    .set('Origin', ORIGIN)
    .set('x-csrf-token', state.token)
    .send({ email, password });
}

async function login(
  agent: SuperAgentTest,
  email: string,
  password = PASSWORD,
): Promise<Response> {
  const state = await csrf(agent);
  return agent
    .post('/api/v1/auth/login')
    .set('Origin', ORIGIN)
    .set('x-csrf-token', state.token)
    .send({ email, password });
}

describe('Full-stack authentication security contracts', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    app = await createFullApplication();
    server = app.getHttpServer() as App;
  });

  beforeEach(async () => clearFullStackTestData(app));

  afterAll(async () => app.close());

  it('serves versioned auth, leaves health unversioned, and exposes test docs', async () => {
    await request(server).get('/health/live').expect(200, { status: 'ok' });
    await request(server).get('/api/v1/health/live').expect(404);
    await request(server)
      .get('/docs/openapi.json')
      .expect(200)
      .expect((res) => {
        const body = res.body as { paths: Record<string, unknown> };
        expect(body.paths).toHaveProperty('/api/v1/auth/login');
      });
  });

  it('registers a user, rotates the anonymous session, authenticates me, and logs out', async () => {
    const agent = request.agent(server);
    const anonymous = await csrf(agent);
    const anonymousCookie = anonymous.response.headers['set-cookie']?.[0];

    const registration = await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', anonymous.token)
      .send({ email: 'customer@example.test', password: PASSWORD })
      .expect(201);

    expect(registration.body).toMatchObject({
      email: 'customer@example.test',
      emailVerified: false,
    });
    expect(registration.body).not.toHaveProperty('password');
    const authenticatedCookie = registration.headers['set-cookie']?.[0];
    expect(anonymousCookie).toBeDefined();
    expect(authenticatedCookie).toBeDefined();
    expect(authenticatedCookie).not.toBe(anonymousCookie);
    expect(authenticatedCookie).toContain('HttpOnly');
    expect(authenticatedCookie).toContain('SameSite=Lax');

    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect((res) => {
        const body = res.body as { email: string };
        expect(body.email).toBe('customer@example.test');
      });

    const logoutCsrf = await csrf(agent);
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', logoutCsrf.token)
      .expect(204);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('rejects missing, untrusted, and invalid CSRF boundaries', async () => {
    const missingOrigin = request.agent(server);
    const state = await csrf(missingOrigin);
    await missingOrigin
      .post('/api/v1/auth/register')
      .set('x-csrf-token', state.token)
      .send({ email: 'missing-origin@example.test', password: PASSWORD })
      .expect(403);

    const untrusted = request.agent(server);
    const untrustedState = await csrf(untrusted);
    await untrusted
      .post('/api/v1/auth/register')
      .set('Origin', 'https://evil.example')
      .set('x-csrf-token', untrustedState.token)
      .send({ email: 'untrusted@example.test', password: PASSWORD })
      .expect(403);

    const invalidToken = request.agent(server);
    await csrf(invalidToken);
    await invalidToken
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', 'invalid')
      .send({ email: 'invalid-csrf@example.test', password: PASSWORD })
      .expect(403);
  });

  it('logout-all invalidates every device session', async () => {
    const first = request.agent(server);
    const second = request.agent(server);
    await register(first, 'all-devices@example.test').then((res) =>
      expect(res.status).toBe(201),
    );
    await login(second, 'all-devices@example.test').then((res) =>
      expect(res.status).toBe(200),
    );

    const state = await csrf(first);
    await first
      .post('/api/v1/auth/logout-all')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', state.token)
      .expect(204);

    await first.get('/api/v1/auth/me').expect(401);
    await second.get('/api/v1/auth/me').expect(401);
  });

  it('password change rotates the current session and invalidates other devices and the old password', async () => {
    const first = request.agent(server);
    const second = request.agent(server);
    await register(first, 'password-change@example.test').then((res) =>
      expect(res.status).toBe(201),
    );
    await login(second, 'password-change@example.test').then((res) =>
      expect(res.status).toBe(200),
    );

    const state = await csrf(first);
    await first
      .post('/api/v1/auth/password/change')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', state.token)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await first.get('/api/v1/auth/me').expect(200);
    await second.get('/api/v1/auth/me').expect(401);
    await login(request.agent(server), 'password-change@example.test').then(
      (res) => expect(res.status).toBe(401),
    );
    await login(
      request.agent(server),
      'password-change@example.test',
      NEW_PASSWORD,
    ).then((res) => expect(res.status).toBe(200));
  });

  it('limits login independently from registration and returns Retry-After', async () => {
    const email = 'separate-budget@example.test';
    const attacker = request.agent(server);
    expect(
      (await login(attacker, email, 'wrong password long enough')).status,
    ).toBe(401);
    expect(
      (await login(attacker, email, 'wrong password long enough')).status,
    ).toBe(401);
    const limited = await login(attacker, email, 'wrong password long enough');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    const registration = await register(request.agent(server), email);
    expect(registration.status).toBe(201);
  });
});
