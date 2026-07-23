import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CatalogPersistenceService } from '../src/modules/catalog/persistence/catalog-persistence.service';
import { CatalogProduct } from '../src/modules/catalog/persistence/product.entity';
import { CatalogProductSlug } from '../src/modules/catalog/persistence/product-slug.entity';
import { CatalogVariant } from '../src/modules/catalog/persistence/variant.entity';
import { createFullApplication } from './full-app.helper';

describe('Catalog persistence constraints', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let catalog: CatalogPersistenceService;

  beforeAll(async () => {
    app = await createFullApplication();
    dataSource = app.get(DataSource);
    catalog = app.get(CatalogPersistenceService);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE catalog_variant_selections, catalog_option_values, catalog_product_options, catalog_variants, catalog_product_slugs, catalog_products CASCADE',
    );
  });

  afterAll(async () => app.close());

  const physicalProduct = (slug: string, sku?: string) => ({
    title: 'Trail Pack',
    slug,
    defaultVariantSku: sku,
    fulfillmentClassification: 'physical' as const,
  });

  it('atomically creates the draft Product, canonical reservation, and default Variant', async () => {
    const created = await catalog.createProduct(
      physicalProduct('trail-pack', 'PACK-1'),
    );

    await expect(
      dataSource.getRepository(CatalogProduct).count(),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(CatalogVariant).count(),
    ).resolves.toBe(1);
    await expect(
      dataSource
        .getRepository(CatalogProductSlug)
        .findOneByOrFail({ slug: 'trail-pack' }),
    ).resolves.toMatchObject({
      productId: created.productId,
      isCanonical: true,
    });
    await expect(
      dataSource
        .getRepository(CatalogVariant)
        .findOneByOrFail({ id: created.variantId }),
    ).resolves.toMatchObject({
      productId: created.productId,
      combinationKey: '',
    });
  });

  it('rolls back the Product and reservation if the default Variant violates SKU uniqueness', async () => {
    await catalog.createProduct(physicalProduct('first-pack', 'PACK-1'));

    await expect(
      catalog.createProduct(physicalProduct('second-pack', ' pack-1 ')),
    ).rejects.toThrow();
    await expect(
      dataSource.getRepository(CatalogProduct).count(),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(CatalogProductSlug).count(),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(CatalogVariant).count(),
    ).resolves.toBe(1);
  });

  it('enforces slug and archived-SKU uniqueness under concurrent writes', async () => {
    const slugAttempts = await Promise.allSettled([
      catalog.createProduct(physicalProduct('same-slug', 'FIRST')),
      catalog.createProduct(physicalProduct('same-slug', 'SECOND')),
    ]);
    expect(
      slugAttempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);

    const skuAttempts = await Promise.allSettled([
      catalog.createProduct(physicalProduct('third-pack', 'shared-sku')),
      catalog.createProduct(physicalProduct('fourth-pack', 'SHARED-SKU')),
    ]);
    expect(
      skuAttempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);

    const archivedVariant = await dataSource
      .getRepository(CatalogVariant)
      .findOneByOrFail({
        normalizedSku: 'shared-sku',
      });
    archivedVariant.status = 'archived';
    await dataSource.getRepository(CatalogVariant).save(archivedVariant);
    await expect(
      catalog.createProduct(physicalProduct('fifth-pack', 'shared-sku')),
    ).rejects.toThrow();
  });

  it('enforces deterministic variant-combination uniqueness under concurrent writes', async () => {
    const created = await catalog.createProduct(
      physicalProduct('combinations'),
    );
    const variants = dataSource.getRepository(CatalogVariant);
    const duplicateCombination = (position: number) =>
      variants.save(
        variants.create({
          productId: created.productId,
          status: 'active',
          title: null,
          sku: null,
          normalizedSku: null,
          fulfillmentClassification: 'physical',
          position,
          combinationKey: 'blue:large',
        }),
      );

    const attempts = await Promise.allSettled([
      duplicateCombination(1),
      duplicateCombination(2),
    ]);
    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
  });

  it('compares and increments the aggregate version in one conditional update', async () => {
    const created = await catalog.createProduct(
      physicalProduct('versioned-pack'),
    );

    const updates = await Promise.all([
      catalog.withTransaction((manager) =>
        catalog.compareAndIncrementVersion(manager, created.productId, 1),
      ),
      catalog.withTransaction((manager) =>
        catalog.compareAndIncrementVersion(manager, created.productId, 1),
      ),
    ]);
    expect(updates.filter(Boolean)).toHaveLength(1);
    await expect(
      dataSource
        .getRepository(CatalogProduct)
        .findOneByOrFail({ id: created.productId }),
    ).resolves.toMatchObject({
      version: 2,
    });
  });
});
