import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CATALOG_MODULE_CONTRACT,
  type CatalogModuleContract,
} from '../src/modules/catalog';
import { CatalogApplicationService } from '../src/modules/catalog/application/catalog-application.service';
import { CatalogProduct } from '../src/modules/catalog/persistence/product.entity';
import { createFullApplication } from './full-app.helper';

describe('Catalog application behavior', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let catalog: CatalogApplicationService;
  let contract: CatalogModuleContract;

  beforeAll(async () => {
    app = await createFullApplication();
    dataSource = app.get(DataSource);
    catalog = app.get(CatalogApplicationService);
    contract = app.get<CatalogModuleContract>(CATALOG_MODULE_CONTRACT);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE catalog_variant_selections, catalog_option_values, catalog_product_options, catalog_variants, catalog_product_slugs, catalog_products CASCADE',
    );
  });

  afterAll(async () => app.close());

  async function create(slug = 'trail-pack') {
    return catalog.createProduct({
      title: 'Trail Pack',
      slug,
      defaultVariantSku: `SKU-${slug}`,
      fulfillmentClassification: 'physical',
    });
  }

  it('edits merchandising and reserves the previous slug atomically', async () => {
    const created = await create();

    const edited = await catalog.editMerchandising(created.productId, {
      expectedVersion: 1,
      title: 'Updated Trail Pack',
      slug: 'updated-trail-pack',
    });

    expect(edited.version).toBe(2);
    await expect(
      catalog.resolvePublishedSlug('trail-pack'),
    ).rejects.toMatchObject({
      code: 'catalog.not_found',
    });
    await catalog.publish(created.productId, 2);
    await expect(
      catalog.resolvePublishedSlug('trail-pack'),
    ).resolves.toMatchObject({
      canonicalSlug: 'updated-trail-pack',
      requestedSlugIsCanonical: false,
    });
  });

  it('rejects a stale version without changing Product data', async () => {
    const created = await create();
    await catalog.editMerchandising(created.productId, {
      expectedVersion: 1,
      title: 'New title',
      slug: 'trail-pack',
    });

    await expect(
      catalog.editMerchandising(created.productId, {
        expectedVersion: 1,
        title: 'Stale title',
        slug: 'stale-pack',
      }),
    ).rejects.toMatchObject({
      code: 'catalog.version_conflict',
      currentVersion: 2,
    });
    await expect(
      dataSource
        .getRepository(CatalogProduct)
        .findOneByOrFail({ id: created.productId }),
    ).resolves.toMatchObject({
      title: 'New title',
      slug: 'trail-pack',
      version: 2,
    });
  });

  it('enforces post-publication configuration identity and selection rules', async () => {
    const created = await create();
    const initial = await catalog.getAdminDetail(created.productId);
    await catalog.publish(created.productId, 1);

    await expect(
      catalog.replaceConfiguration(created.productId, {
        expectedVersion: 2,
        options: [
          {
            id: 'a9e8c7d6-b5a4-4c3b-8d2e-1f0a9b8c7d6e',
            name: 'Size',
            position: 0,
            values: [
              {
                id: 'b9e8c7d6-b5a4-4c3b-8d2e-1f0a9b8c7d6e',
                label: 'Small',
                position: 0,
              },
            ],
          },
        ],
        variants: initial.variants.map((variant) => ({
          ...variant,
          selectionValueIds: [],
        })),
      }),
    ).rejects.toMatchObject({ code: 'catalog.configuration_conflict' });
  });

  it('publishes only valid aggregates and public queries expose active variants only', async () => {
    const created = await create();
    await catalog.replaceConfiguration(created.productId, {
      expectedVersion: 1,
      options: [],
      variants: [
        {
          id: created.variantId,
          status: 'archived',
          title: null,
          sku: 'SKU-trail-pack',
          position: 0,
          fulfillmentClassification: 'physical',
          selectionValueIds: [],
        },
      ],
    });
    await expect(catalog.publish(created.productId, 2)).rejects.toMatchObject({
      code: 'catalog.configuration_conflict',
    });
    await catalog.replaceConfiguration(created.productId, {
      expectedVersion: 2,
      options: [],
      variants: [
        {
          id: created.variantId,
          status: 'active',
          title: null,
          sku: 'SKU-trail-pack',
          position: 0,
          fulfillmentClassification: 'physical',
          selectionValueIds: [],
        },
      ],
    });
    await catalog.publish(created.productId, 3);
    await expect(catalog.listPublished()).resolves.toMatchObject({
      items: [expect.objectContaining({ id: created.productId })],
    });
  });

  it('exports only catalog-owned purchasability and snapshot facts', async () => {
    const created = await create();
    await catalog.publish(created.productId, 1);

    await expect(
      contract.resolvePurchasableVariants([created.variantId]),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: created.productId,
        variantId: created.variantId,
        eligible: true,
        fulfillmentClassification: 'physical',
      }),
    ]);
    const [snapshot] = await contract.getVariantSnapshotFacts([
      created.variantId,
    ]);
    expect(snapshot).toEqual(
      expect.objectContaining({
        productTitle: 'Trail Pack',
        sku: 'SKU-trail-pack',
      }),
    );
    expect(snapshot).not.toHaveProperty('price');
    expect(snapshot).not.toHaveProperty('stock');
    expect(snapshot).not.toHaveProperty('availability');
  });

  it('applies every Product lifecycle transition and rejects forbidden ones', async () => {
    const created = await create();
    await catalog.publish(created.productId, 1);
    await catalog.unpublish(created.productId, 2);
    await catalog.archive(created.productId, 3);
    await expect(catalog.archive(created.productId, 4)).rejects.toMatchObject({
      code: 'catalog.invalid_product_transition',
    });
    await expect(catalog.publish(created.productId, 4)).rejects.toMatchObject({
      code: 'catalog.invalid_product_transition',
    });
    await catalog.restore(created.productId, 4);
    await catalog.publish(created.productId, 5);
    await catalog.archive(created.productId, 6);
    const restored = await catalog.restore(created.productId, 7);
    expect(restored).toMatchObject({
      status: 'draft',
      version: 8,
      archivedAt: null,
    });
  });
});
