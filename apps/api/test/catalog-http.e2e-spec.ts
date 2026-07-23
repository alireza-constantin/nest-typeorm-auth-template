/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request, { type SuperAgentTest } from 'supertest';
import type { App } from 'supertest/types';
import {
  Role,
  RoleKey,
  StaffProfile,
  StaffProfileStatus,
  StaffRoleAssignment,
} from '../src/modules/authorization/data';
import { User } from '../src/modules/identity/persistence/user.entity';
import {
  clearFullStackTestData,
  createFullApplication,
} from './full-app.helper';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

describe('Catalog HTTP contracts', () => {
  let app: INestApplication;
  let server: App;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createFullApplication();
    server = app.getHttpServer() as App;
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearFullStackTestData(app);
    await dataSource.query(
      'TRUNCATE TABLE catalog_variant_selections, catalog_option_values, catalog_product_options, catalog_variants, catalog_product_slugs, catalog_products CASCADE',
    );
  });

  afterAll(async () => app.close());

  async function csrf(agent: SuperAgentTest): Promise<string> {
    return (await agent.get('/api/v1/auth/csrf').expect(200)).body.csrfToken;
  }

  async function register(agent: SuperAgentTest, email: string): Promise<void> {
    const token = await csrf(agent);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(201);
  }

  async function staffAgent(
    email: string,
    roleKey: RoleKey,
  ): Promise<SuperAgentTest> {
    const agent = request.agent(server);
    await register(agent, email);
    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: email,
    });
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: roleKey });
    await dataSource.getRepository(StaffProfile).save({
      userId: user.id,
      status: StaffProfileStatus.ACTIVE,
      createdByUserId: null,
    });
    await dataSource.getRepository(StaffRoleAssignment).save({
      staffUserId: user.id,
      roleId: role.id,
      assignedByUserId: null,
    });
    user.authVersion += 1;
    await dataSource.getRepository(User).save(user);
    const token = await csrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  }

  async function createProduct(agent: SuperAgentTest, slug = 'trail-pack') {
    const response = await agent
      .post('/api/v1/admin/catalog/products')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(agent))
      .send({
        title: 'Trail Pack',
        slug,
        defaultVariantSku: `SKU-${slug}`,
        fulfillmentClassification: 'physical',
      })
      .expect(201);
    return response.body as { productId: string; variantId: string };
  }

  it('enforces admin authentication and exact catalog permissions', async () => {
    await request(server).get('/api/v1/admin/catalog/products').expect(401);
    const customer = request.agent(server);
    await register(customer, 'customer@example.test');
    await customer.get('/api/v1/admin/catalog/products').expect(403);

    const marketing = await staffAgent(
      'marketing@example.test',
      RoleKey.MARKETING_MANAGER,
    );
    await marketing.get('/api/v1/admin/catalog/products').expect(200);
    await marketing
      .post('/api/v1/admin/catalog/products')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(marketing))
      .send({
        title: 'Denied',
        slug: 'denied',
        fulfillmentClassification: 'physical',
      })
      .expect(403);
  });

  it('protects catalog mutations and translates validation and version conflicts', async () => {
    const manager = await staffAgent(
      'catalog@example.test',
      RoleKey.CATALOG_MANAGER,
    );
    await manager
      .post('/api/v1/admin/catalog/products')
      .send({
        title: 'No origin',
        slug: 'no-origin',
        fulfillmentClassification: 'physical',
      })
      .expect(403);
    await manager
      .post('/api/v1/admin/catalog/products')
      .set('Origin', 'https://evil.example')
      .set('x-csrf-token', await csrf(manager))
      .send({
        title: 'Bad origin',
        slug: 'bad-origin',
        fulfillmentClassification: 'physical',
      })
      .expect(403);
    await manager
      .post('/api/v1/admin/catalog/products')
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({
        title: 'Invalid',
        slug: 'not valid',
        fulfillmentClassification: 'physical',
      })
      .expect(400)
      .expect((response) =>
        expect(response.body.code).toBe('catalog.validation_failed'),
      );

    const product = await createProduct(manager);
    await manager
      .patch(`/api/v1/admin/catalog/products/${product.productId}`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({ expectedVersion: 0, title: 'Trail Pack', slug: 'trail-pack' })
      .expect(400);
    await manager
      .post(`/api/v1/admin/catalog/products/${product.productId}/publish`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({ expectedVersion: 99 })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('catalog.version_conflict');
        expect(response.body.currentVersion).toBe(1);
      });
  });

  it('keeps public hidden Products indistinguishable, resolves aliases, and pages deterministically', async () => {
    const manager = await staffAgent(
      'catalog@example.test',
      RoleKey.CATALOG_MANAGER,
    );
    const first = await createProduct(manager, 'trail-pack');
    const second = await createProduct(manager, 'day-pack');
    await manager
      .patch(`/api/v1/admin/catalog/products/${first.productId}`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({
        expectedVersion: 1,
        title: 'Trail Pack',
        slug: 'updated-trail-pack',
      })
      .expect(200);
    await manager
      .post(`/api/v1/admin/catalog/products/${first.productId}/publish`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({ expectedVersion: 2 })
      .expect(201);
    await manager
      .post(`/api/v1/admin/catalog/products/${second.productId}/publish`)
      .set('Origin', ORIGIN)
      .set('x-csrf-token', await csrf(manager))
      .send({ expectedVersion: 1 })
      .expect(201);

    for (const slug of ['missing', 'trail-pack-does-not-exist']) {
      await request(server)
        .get(`/api/v1/catalog/products/${slug}`)
        .expect(404)
        .expect((response) =>
          expect(response.body.code).toBe('catalog.not_found'),
        );
    }
    await request(server)
      .get('/api/v1/catalog/products/trail-pack')
      .expect(200)
      .expect((response) => {
        expect(response.body.canonicalSlug).toBe('updated-trail-pack');
        expect(response.body.requestedSlugIsCanonical).toBe(false);
        expect(response.body.product).not.toHaveProperty('version');
        expect(JSON.stringify(response.body)).not.toMatch(
          /price|stock|availability/i,
        );
      });
    const page = await request(server)
      .get('/api/v1/catalog/products?limit=1')
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toEqual(expect.any(String));
    await request(server)
      .get(
        `/api/v1/catalog/products?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].id).not.toBe(page.body.items[0].id);
      });
  });

  it('documents Catalog routes, security, permissions, and problem responses', async () => {
    await request(server)
      .get('/docs/openapi.json')
      .expect(200)
      .expect((response) => {
        const paths = response.body.paths as Record<
          string,
          Record<string, unknown>
        >;
        expect(paths).toHaveProperty('/api/v1/admin/catalog/products');
        expect(paths).toHaveProperty('/api/v1/catalog/products/{slug}');
        const create = paths['/api/v1/admin/catalog/products'].post as {
          responses: Record<string, unknown>;
          security: unknown[];
        };
        expect(create.responses).toEqual(
          expect.objectContaining({
            '400': expect.anything(),
            '401': expect.anything(),
            '403': expect.anything(),
            '409': expect.anything(),
          }),
        );
        expect(create.security).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ sessionCookie: [] }),
            expect.objectContaining({ csrfToken: [] }),
          ]),
        );
        expect(JSON.stringify(create)).toContain('catalog.products.write');
        const schemas = response.body.components.schemas as Record<
          string,
          { properties: Record<string, unknown> }
        >;
        expect(schemas.CreateProductDto.properties).toEqual(
          expect.objectContaining({
            title: expect.objectContaining({ maxLength: 200 }),
            slug: expect.objectContaining({ maxLength: 160 }),
            fulfillmentClassification: expect.objectContaining({
              enum: ['physical', 'digital', 'service'],
            }),
          }),
        );
        expect(schemas.ProductTransitionDto.properties).toHaveProperty(
          'expectedVersion',
          expect.objectContaining({ minimum: 1 }),
        );
      });
  });
});
