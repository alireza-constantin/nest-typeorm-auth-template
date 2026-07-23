import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { CATALOG_RESERVED_ROUTES } from '../catalog.constants';
import {
  CATALOG_LIMITS,
  normalizeSku,
  normalizeSlug,
  optionalText,
  requiredText,
  type FulfillmentClassification,
} from '../domain';
import { CatalogProductSlug } from './product-slug.entity';
import { CatalogProduct, ProductLifecycleStatus } from './product.entity';
import {
  CatalogVariant,
  VariantFulfillmentClassification,
  VariantLifecycleStatus,
} from './variant.entity';

export interface CreateCatalogProductRecord {
  readonly title: string;
  readonly slug: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly defaultVariantTitle?: string | null;
  readonly defaultVariantSku?: string | null;
  readonly fulfillmentClassification: FulfillmentClassification;
}

export interface CreatedCatalogProductRecord {
  readonly productId: string;
  readonly variantId: string;
  readonly version: number;
}

/** Catalog-private persistence adapter. It is intentionally not exported by the module. */
@Injectable()
export class CatalogPersistenceService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CATALOG_RESERVED_ROUTES)
    private readonly reservedRoutes: readonly string[],
  ) {}

  async createProduct(
    input: CreateCatalogProductRecord,
  ): Promise<CreatedCatalogProductRecord> {
    const title = requiredText(
      input.title,
      CATALOG_LIMITS.productTitle,
      'title',
    );
    const summary = optionalText(
      input.summary,
      CATALOG_LIMITS.productSummary,
      'summary',
    );
    const description = optionalText(
      input.description,
      CATALOG_LIMITS.productDescription,
      'description',
    );
    const slug = normalizeSlug(input.slug, this.reservedRoutes);
    const defaultVariantTitle = optionalText(
      input.defaultVariantTitle,
      CATALOG_LIMITS.variantTitle,
      'default variant title',
    );
    const sku = normalizeSku(input.defaultVariantSku);

    return this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(CatalogProduct);
      const slugs = manager.getRepository(CatalogProductSlug);
      const variants = manager.getRepository(CatalogVariant);
      const product = await products.save(
        products.create({
          title,
          summary,
          description,
          slug,
          status: ProductLifecycleStatus.DRAFT,
          version: 1,
          everPublished: false,
          publishedAt: null,
          archivedAt: null,
        }),
      );
      await slugs.save(
        slugs.create({ productId: product.id, slug, isCanonical: true }),
      );
      const variant = await variants.save(
        variants.create({
          productId: product.id,
          status: VariantLifecycleStatus.ACTIVE,
          title: defaultVariantTitle,
          sku: sku.display,
          normalizedSku: sku.canonical,
          fulfillmentClassification:
            input.fulfillmentClassification as VariantFulfillmentClassification,
          position: 0,
          combinationKey: '',
        }),
      );
      return {
        productId: product.id,
        variantId: variant.id,
        version: product.version,
      };
    });
  }

  /**
   * A command that already owns a Catalog transaction calls this after all
   * aggregate writes. The conditional update is the optimistic-concurrency
   * compare-and-increment primitive; it never exposes a repository.
   */
  async compareAndIncrementVersion(
    manager: EntityManager,
    productId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return false;
    }
    const result = await manager
      .getRepository(CatalogProduct)
      .createQueryBuilder()
      .update(CatalogProduct)
      .set({
        version: () => 'version + 1',
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :productId AND version = :expectedVersion', {
        productId,
        expectedVersion,
      })
      .execute();
    return result.affected === 1;
  }

  async withTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(work);
  }
}
