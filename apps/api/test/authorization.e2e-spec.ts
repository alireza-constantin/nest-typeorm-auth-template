import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request, { type Response, type SuperAgentTest } from 'supertest';
import type { App } from 'supertest/types';
import {
  AuthorizationAuditEvent,
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
  StaffRoleAssignment,
} from '../src/authorization/data';
import { OwnerBootstrapService } from '../src/authorization/bootstrap';
import { User } from '../src/modules/identity/persistence/user.entity';
import {
  clearFullStackTestData,
  createFullApplication,
} from './full-app.helper';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

async function csrf(agent: SuperAgentTest): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as { csrfToken: string }).csrfToken;
}

async function register(
  agent: SuperAgentTest,
  email: string,
): Promise<Response> {
  const token = await csrf(agent);
  return agent
    .post('/api/v1/auth/register')
    .set('Origin', ORIGIN)
    .set('x-csrf-token', token)
    .send({ email, password: PASSWORD })
    .expect(201);
}

async function login(agent: SuperAgentTest, email: string): Promise<void> {
  const token = await csrf(agent);
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', ORIGIN)
    .set('x-csrf-token', token)
    .send({ email, password: PASSWORD })
    .expect(200);
}

describe('Authorization full-stack security contracts', () => {
  let app: INestApplication;
  let server: App;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createFullApplication();
    server = app.getHttpServer() as App;
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => clearFullStackTestData(app));

  afterAll(async () => app.close());

  async function grantBuiltInRole(
    email: string,
    roleKey: RoleKey,
  ): Promise<string> {
    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: email,
    });
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: roleKey });
    const profiles = dataSource.getRepository(StaffProfile);
    const assignments = dataSource.getRepository(StaffRoleAssignment);
    await profiles.save(
      profiles.create({
        userId: user.id,
        status: StaffProfileStatus.ACTIVE,
        createdByUserId: null,
      }),
    );
    await assignments.save(
      assignments.create({
        staffUserId: user.id,
        roleId: role.id,
        assignedByUserId: null,
      }),
    );
    user.authVersion += 1;
    await dataSource.getRepository(User).save(user);
    return user.id;
  }

  async function staffAgent(
    email: string,
    roleKey: RoleKey,
  ): Promise<SuperAgentTest> {
    const agent = request.agent(server);
    await register(agent, email);
    await grantBuiltInRole(email, roleKey);
    await login(agent, email);
    return agent;
  }

  it('distinguishes unauthenticated and customer administrative access', async () => {
    await request(server).get('/api/v1/admin/audit-events').expect(401);

    const customer = request.agent(server);
    await register(customer, 'customer@example.test');
    await customer.get('/api/v1/admin/audit-events').expect(403);
    await customer.get('/api/v1/admin/roles').expect(403);
  });

  it('lets an administrator add non-owner staff but prevents owner escalation', async () => {
    const administrator = await staffAgent(
      'admin@example.test',
      RoleKey.ADMINISTRATOR,
    );
    const nonOwner = request.agent(server);
    await register(nonOwner, 'support@example.test');
    const target = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'support@example.test',
    });
    const createCsrf = await csrf(administrator);

    await administrator
      .post('/api/v1/admin/staff')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', createCsrf)
      .send({ userId: target.id, roleKeys: [RoleKey.SUPPORT_AGENT] })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          userId: target.id,
          roles: [RoleKey.SUPPORT_AGENT],
        });
      });

    const replaceCsrf = await csrf(administrator);
    await administrator
      .put(`/api/v1/admin/staff/${target.id}/roles`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', replaceCsrf)
      .send({ roleKeys: [RoleKey.ANALYST] })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ roles: [RoleKey.ANALYST] });
      });

    const ownerTarget = request.agent(server);
    await register(ownerTarget, 'owner-target@example.test');
    const ownerUser = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'owner-target@example.test',
    });
    const escalationCsrf = await csrf(administrator);
    await administrator
      .post('/api/v1/admin/staff')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', escalationCsrf)
      .send({ userId: ownerUser.id, roleKeys: [RoleKey.OWNER] })
      .expect(403);

    expect(
      await dataSource.getRepository(AuthorizationAuditEvent).countBy({
        targetId: ownerUser.id,
      }),
    ).toBe(0);

    const owner = await staffAgent(
      'existing-owner@example.test',
      RoleKey.OWNER,
    );
    const existingOwner = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'existing-owner@example.test',
    });

    const demotionCsrf = await csrf(administrator);
    await administrator
      .put(`/api/v1/admin/staff/${existingOwner.id}/roles`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', demotionCsrf)
      .send({ roleKeys: [RoleKey.ANALYST] })
      .expect(403);

    const suspensionCsrf = await csrf(administrator);
    await administrator
      .post(`/api/v1/admin/staff/${existingOwner.id}/suspend`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', suspensionCsrf)
      .expect(403);

    const lastOwnerCsrf = await csrf(owner);
    await owner
      .post(`/api/v1/admin/staff/${existingOwner.id}/suspend`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', lastOwnerCsrf)
      .expect(409);
  });

  it('invalidates stale staff sessions and records one safe audit event per successful mutation', async () => {
    const owner = await staffAgent('owner@example.test', RoleKey.OWNER);
    const support = await staffAgent(
      'support@example.test',
      RoleKey.SUPPORT_AGENT,
    );
    const supportUser = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'support@example.test',
    });

    await support.get('/api/v1/admin/me').expect(200);
    const replaceRolesCsrf = await csrf(owner);
    await owner
      .put(`/api/v1/admin/staff/${supportUser.id}/roles`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', replaceRolesCsrf)
      .send({ roleKeys: [] })
      .expect(200);

    await support.get('/api/v1/admin/me').expect(401);
    await owner
      .get('/api/v1/admin/audit-events')
      .expect(200)
      .expect((response) => {
        const body = response.body as { data: Array<Record<string, unknown>> };
        const events = body.data.filter(
          (event) => event.targetId === supportUser.id,
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ action: 'staff.roles_replaced' });
        expect(JSON.stringify(events[0])).not.toContain('support@example.test');
        expect(events[0]).not.toHaveProperty('actor');
      });
  });

  it('keeps CSRF and trusted-origin protection on staff mutations', async () => {
    const owner = await staffAgent('owner@example.test', RoleKey.OWNER);
    const target = request.agent(server);
    await register(target, 'target@example.test');
    const targetUser = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'target@example.test',
    });
    const token = await csrf(owner);

    await owner
      .post('/api/v1/admin/staff')
      .set('x-csrf-token', token)
      .send({ userId: targetUser.id, roleKeys: [RoleKey.SUPPORT_AGENT] })
      .expect(403);
  });

  it('bootstraps an existing user as owner idempotently without preserving the old session', async () => {
    const candidate = request.agent(server);
    await register(candidate, 'bootstrap-owner@example.test');
    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'bootstrap-owner@example.test',
    });
    const bootstrap = app.get(OwnerBootstrapService);

    await expect(bootstrap.bootstrap(user.emailNormalized)).resolves.toEqual({
      userId: user.id,
      changed: true,
    });
    await expect(bootstrap.bootstrap(user.emailNormalized)).resolves.toEqual({
      userId: user.id,
      changed: false,
    });

    await candidate.get('/api/v1/auth/me').expect(401);
    const profile = await dataSource.getRepository(StaffProfile).findOneOrFail({
      where: { userId: user.id },
      relations: { roleAssignments: { role: true } },
    });
    expect(profile.status).toBe(StaffProfileStatus.ACTIVE);
    expect(profile.roleAssignments?.map(({ role }) => role.key)).toContain(
      RoleKey.OWNER,
    );
    expect(
      await dataSource.getRepository(AuthorizationAuditEvent).countBy({
        targetId: user.id,
        action: 'owner.bootstrapped',
      }),
    ).toBe(1);
  });
});
