import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In, type EntityManager, QueryFailedError } from 'typeorm';
import { CATALOG_RESERVED_ROUTES } from '../catalog.constants';
import {
  assertConfigurationConsistency,
  assertProductTransition,
  assertSingleFulfillmentClassification,
  canonicalComparison,
  combinationKey,
  CATALOG_LIMITS,
  CatalogRuleError,
  normalizeSku,
  normalizeSlug,
  optionalText,
  validateProductText,
  type FulfillmentClassification,
  type ProductStatus,
  type VariantStatus,
} from '../domain';
import {
  CatalogOptionValue,
  CatalogProduct,
  CatalogProductOption,
  CatalogProductSlug,
  CatalogVariant,
  CatalogVariantSelection,
  ProductLifecycleStatus,
  VariantLifecycleStatus,
} from '../persistence';
import { CatalogPersistenceService } from '../persistence/catalog-persistence.service';
import {
  type CatalogModuleContract,
  type PurchasableVariantResolution,
  type VariantSnapshotFact,
} from './catalog-contract';
import {
  CatalogApplicationError,
  type CatalogApplicationErrorCode,
} from './catalog-application.error';

export interface CreateProductCommand {
  readonly title: string;
  readonly slug: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly defaultVariantTitle?: string | null;
  readonly defaultVariantSku?: string | null;
  readonly fulfillmentClassification: FulfillmentClassification;
}

export interface MerchandisingEditCommand {
  readonly expectedVersion: number;
  readonly title: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly slug: string;
}

export interface ConfigurationOptionInput {
  readonly id?: string;
  readonly name: string;
  readonly position: number;
  readonly values: readonly {
    id?: string;
    label: string;
    position: number;
  }[];
}

export interface ConfigurationVariantInput {
  readonly id?: string;
  readonly status: VariantStatus;
  readonly title?: string | null;
  readonly sku?: string | null;
  readonly position: number;
  readonly fulfillmentClassification: FulfillmentClassification;
  readonly selectionValueIds: readonly string[];
}

export interface ReplaceConfigurationCommand {
  readonly expectedVersion: number;
  readonly options: readonly ConfigurationOptionInput[];
  readonly variants: readonly ConfigurationVariantInput[];
}

export interface ProductListQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly status?: ProductStatus;
  readonly sku?: string;
  readonly q?: string;
}

interface ProductRow {
  readonly id: string;
  readonly version: number;
  readonly status: ProductStatus;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly slug: string;
  readonly everPublished: boolean;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductListResult {
  readonly items: readonly ProductRow[];
  readonly nextCursor: string | null;
}

export interface ProductDetail extends ProductRow {
  readonly variants: readonly {
    id: string;
    status: VariantStatus;
    title: string | null;
    sku: string | null;
    fulfillmentClassification: FulfillmentClassification;
    position: number;
    selectionValueIds: readonly string[];
  }[];
  readonly options: readonly {
    id: string;
    name: string;
    position: number;
    values: readonly { id: string; label: string; position: number }[];
  }[];
}

export interface PublicProduct extends Omit<
  ProductDetail,
  'version' | 'status' | 'everPublished' | 'archivedAt' | 'variants'
> {
  readonly variants: readonly {
    id: string;
    title: string | null;
    sku: string | null;
    fulfillmentClassification: FulfillmentClassification;
    position: number;
    selectionValueIds: readonly string[];
  }[];
}

export interface PublicProductResolution {
  readonly product: PublicProduct;
  readonly canonicalSlug: string;
  readonly requestedSlugIsCanonical: boolean;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTRACT_VARIANT_LIMIT = 100;

@Injectable()
export class CatalogApplicationService implements CatalogModuleContract {
  constructor(
    private readonly persistence: CatalogPersistenceService,
    @Inject(CATALOG_RESERVED_ROUTES)
    private readonly reservedRoutes: readonly string[],
  ) {}

  async createProduct(input: CreateProductCommand) {
    try {
      this.assertFulfillmentClassification(input.fulfillmentClassification);
      return await this.persistence.createProduct(input);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async editMerchandising(
    productId: string,
    input: MerchandisingEditCommand,
  ): Promise<ProductDetail> {
    return this.command(
      productId,
      input.expectedVersion,
      async (manager, product) => {
        const values = validateProductText(input);
        const slug = normalizeSlug(input.slug, this.reservedRoutes);
        if (
          product.status === ProductLifecycleStatus.PUBLISHED &&
          (!values.title || !slug)
        ) {
          throw this.error(
            'catalog.configuration_conflict',
            'published Product must remain valid',
          );
        }
        if (slug !== product.slug)
          await this.replaceCanonicalSlug(manager, product, slug);
        product.title = values.title;
        product.summary = values.summary;
        product.description = values.description;
        product.slug = slug;
        await manager.getRepository(CatalogProduct).save(product);
      },
    );
  }

  async replaceConfiguration(
    productId: string,
    input: ReplaceConfigurationCommand,
  ): Promise<ProductDetail> {
    return this.command(
      productId,
      input.expectedVersion,
      async (manager, product) => {
        const existing = await this.loadDetail(manager, product);
        const materialized = this.materializeConfiguration(input);
        this.assertConfigurationEnums(materialized.variants);
        assertConfigurationConsistency(
          materialized.options,
          materialized.variants,
        );
        assertSingleFulfillmentClassification(materialized.variants);
        this.assertPostPublicationReshape(
          existing,
          materialized,
          product.everPublished,
        );
        if (
          product.status === ProductLifecycleStatus.PUBLISHED &&
          !materialized.variants.some((variant) => variant.status === 'active')
        ) {
          throw this.error(
            'catalog.configuration_conflict',
            'published Product needs an active Variant',
          );
        }
        await this.replaceConfigurationRows(manager, product.id, materialized);
      },
    );
  }

  publish(productId: string, expectedVersion: number): Promise<ProductDetail> {
    return this.transition(
      productId,
      expectedVersion,
      ProductLifecycleStatus.PUBLISHED,
    );
  }

  unpublish(
    productId: string,
    expectedVersion: number,
  ): Promise<ProductDetail> {
    return this.transition(
      productId,
      expectedVersion,
      ProductLifecycleStatus.DRAFT,
    );
  }

  archive(productId: string, expectedVersion: number): Promise<ProductDetail> {
    return this.transition(
      productId,
      expectedVersion,
      ProductLifecycleStatus.ARCHIVED,
    );
  }

  restore(productId: string, expectedVersion: number): Promise<ProductDetail> {
    return this.transition(
      productId,
      expectedVersion,
      ProductLifecycleStatus.DRAFT,
    );
  }

  async listAdmin(query: ProductListQuery = {}): Promise<ProductListResult> {
    return this.listProducts(query, false);
  }

  async getAdminDetail(productId: string): Promise<ProductDetail> {
    try {
      return await this.persistence.withTransaction(async (manager) => {
        const product = await manager
          .getRepository(CatalogProduct)
          .findOneBy({ id: productId });
        if (!product)
          throw this.error('catalog.not_found', 'Product was not found');
        return this.loadDetail(manager, product);
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async listPublished(
    query: Omit<ProductListQuery, 'status' | 'sku'> = {},
  ): Promise<{ items: readonly PublicProduct[]; nextCursor: string | null }> {
    const listed = await this.listProducts(query, true);
    const details = await Promise.all(
      listed.items.map((row) => this.getPublicByProductId(row.id)),
    );
    return { items: details, nextCursor: listed.nextCursor };
  }

  async resolvePublishedSlug(
    requestedSlug: string,
  ): Promise<PublicProductResolution> {
    try {
      const slug = normalizeSlug(requestedSlug, this.reservedRoutes);
      return await this.persistence.withTransaction(async (manager) => {
        const reservation = await manager
          .getRepository(CatalogProductSlug)
          .findOneBy({ slug });
        if (!reservation)
          throw this.error('catalog.not_found', 'Product was not found');
        const product = await manager
          .getRepository(CatalogProduct)
          .findOneBy({ id: reservation.productId });
        if (!product || product.status !== ProductLifecycleStatus.PUBLISHED)
          throw this.error('catalog.not_found', 'Product was not found');
        const detail = await this.loadDetail(manager, product);
        if (!detail.variants.some((variant) => variant.status === 'active'))
          throw this.error('catalog.not_found', 'Product was not found');
        return {
          product: this.toPublic(detail),
          canonicalSlug: product.slug,
          requestedSlugIsCanonical: reservation.isCanonical,
        };
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async resolvePurchasableVariants(
    variantIds: readonly string[],
  ): Promise<readonly PurchasableVariantResolution[]> {
    const ids = this.contractIds(variantIds);
    if (!ids.length) return [];
    const variants = await this.readVariants(ids);
    return variants.map(({ variant, product }) => ({
      productId: product.id,
      variantId: variant.id,
      productStatus: product.status,
      variantStatus: variant.status,
      eligible:
        product.status === ProductLifecycleStatus.PUBLISHED &&
        variant.status === VariantLifecycleStatus.ACTIVE,
      title: variant.title ?? product.title,
      sku: variant.sku,
      fulfillmentClassification: variant.fulfillmentClassification,
    }));
  }

  async getVariantSnapshotFacts(
    variantIds: readonly string[],
  ): Promise<readonly VariantSnapshotFact[]> {
    const ids = this.contractIds(variantIds);
    if (!ids.length) return [];
    const variants = await this.readVariants(ids);
    return variants.map(({ variant, product }) => ({
      productId: product.id,
      variantId: variant.id,
      productTitle: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      productStatus: product.status,
      variantStatus: variant.status,
      fulfillmentClassification: variant.fulfillmentClassification,
    }));
  }

  private async transition(
    productId: string,
    expectedVersion: number,
    target: ProductLifecycleStatus,
  ): Promise<ProductDetail> {
    return this.command(
      productId,
      expectedVersion,
      async (manager, product) => {
        assertProductTransition(product.status, target);
        if (target === ProductLifecycleStatus.PUBLISHED) {
          const detail = await this.loadDetail(manager, product);
          normalizeSlug(product.slug, this.reservedRoutes);
          if (
            !product.title ||
            !detail.variants.some((variant) => variant.status === 'active')
          ) {
            throw this.error(
              'catalog.configuration_conflict',
              'Product cannot be published',
            );
          }
          assertConfigurationConsistency(
            detail.options.map((option) => ({
              ...option,
              values: option.values.map((value) => ({ ...value })),
            })),
            detail.variants.map((variant) => ({ ...variant })),
          );
          assertSingleFulfillmentClassification(detail.variants);
          product.everPublished = true;
          product.publishedAt = new Date();
        } else if (target === ProductLifecycleStatus.ARCHIVED) {
          product.archivedAt = new Date();
        } else if (product.status === ProductLifecycleStatus.ARCHIVED) {
          normalizeSlug(product.slug, this.reservedRoutes);
          product.archivedAt = null;
        }
        product.status = target;
        await manager.getRepository(CatalogProduct).save(product);
      },
    );
  }

  private async command(
    productId: string,
    expectedVersion: number,
    work: (manager: EntityManager, product: CatalogProduct) => Promise<void>,
  ): Promise<ProductDetail> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw this.error(
        'catalog.validation_failed',
        'expectedVersion must be a positive integer',
      );
    try {
      return await this.persistence.withTransaction(async (manager) => {
        const products = manager.getRepository(CatalogProduct);
        const product = await products.findOneBy({ id: productId });
        if (!product)
          throw this.error('catalog.not_found', 'Product was not found');
        if (product.version !== expectedVersion)
          throw this.error(
            'catalog.version_conflict',
            'Product version is stale',
            product.version,
          );
        await work(manager, product);
        if (
          !(await this.persistence.compareAndIncrementVersion(
            manager,
            productId,
            expectedVersion,
          ))
        ) {
          throw this.error(
            'catalog.version_conflict',
            'Product version is stale',
          );
        }
        const updated = await products.findOneByOrFail({ id: productId });
        return this.loadDetail(manager, updated);
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  private materializeConfiguration(input: ReplaceConfigurationCommand) {
    const options = input.options.map((option) => ({
      id: option.id ?? randomUUID(),
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({
        id: value.id ?? randomUUID(),
        label: value.label,
        position: value.position,
      })),
    }));
    const variants = input.variants.map((variant) => ({
      ...variant,
      id: variant.id ?? randomUUID(),
    }));
    return { options, variants };
  }

  private assertConfigurationEnums(
    variants: readonly {
      status: VariantStatus;
      fulfillmentClassification: FulfillmentClassification;
    }[],
  ): void {
    for (const variant of variants) {
      if (variant.status !== 'active' && variant.status !== 'archived') {
        throw this.error(
          'catalog.validation_failed',
          'variant status is invalid',
        );
      }
      this.assertFulfillmentClassification(variant.fulfillmentClassification);
    }
  }

  private assertFulfillmentClassification(
    value: FulfillmentClassification,
  ): void {
    if (value !== 'physical' && value !== 'digital' && value !== 'service') {
      throw this.error(
        'catalog.validation_failed',
        'fulfillment classification is invalid',
      );
    }
  }

  private assertPostPublicationReshape(
    existing: ProductDetail,
    desired: ReturnType<CatalogApplicationService['materializeConfiguration']>,
    everPublished: boolean,
  ): void {
    if (!everPublished) return;
    const oldOptionIds = new Set(existing.options.map((option) => option.id));
    const desiredOptionIds = new Set(
      desired.options.map((option) => option.id),
    );
    if (
      oldOptionIds.size !== desiredOptionIds.size ||
      [...oldOptionIds].some((id) => !desiredOptionIds.has(id))
    ) {
      throw this.error(
        'catalog.configuration_conflict',
        'Option dimensions cannot change after publication',
      );
    }
    const oldVariants = new Map(
      existing.variants.map((variant) => [variant.id, variant]),
    );
    if (
      [...oldVariants.keys()].some(
        (id) => !desired.variants.some((variant) => variant.id === id),
      )
    ) {
      throw this.error(
        'catalog.configuration_conflict',
        'Published Variant identities cannot be removed',
      );
    }
    for (const variant of desired.variants) {
      const old = oldVariants.get(variant.id);
      if (
        old &&
        combinationKey(old.selectionValueIds) !==
          combinationKey(variant.selectionValueIds)
      ) {
        throw this.error(
          'catalog.configuration_conflict',
          'Published Variant selections cannot change',
        );
      }
    }
    const oldValueIds = new Set(
      existing.options.flatMap((option) =>
        option.values.map((value) => value.id),
      ),
    );
    const desiredValueIds = new Set(
      desired.options.flatMap((option) =>
        option.values.map((value) => value.id),
      ),
    );
    const retainedSelections = new Set(
      desired.variants.flatMap((variant) => variant.selectionValueIds),
    );
    if (
      [...oldValueIds].some(
        (id) => !desiredValueIds.has(id) && retainedSelections.has(id),
      )
    ) {
      throw this.error(
        'catalog.configuration_conflict',
        'Selected Option values cannot be removed',
      );
    }
  }

  private async replaceConfigurationRows(
    manager: EntityManager,
    productId: string,
    desired: ReturnType<CatalogApplicationService['materializeConfiguration']>,
  ): Promise<void> {
    const selections = manager.getRepository(CatalogVariantSelection);
    const variants = manager.getRepository(CatalogVariant);
    const values = manager.getRepository(CatalogOptionValue);
    const options = manager.getRepository(CatalogProductOption);
    const existingVariants = await variants.findBy({ productId });
    if (existingVariants.length)
      await selections.delete({
        variantId: In(existingVariants.map((variant) => variant.id)),
      });
    await variants.delete({ productId });
    const existingOptions = await options.findBy({ productId });
    if (existingOptions.length)
      await values.delete({
        optionId: In(existingOptions.map((option) => option.id)),
      });
    await options.delete({ productId });
    await options.save(
      desired.options.map((option) =>
        options.create({
          id: option.id,
          productId,
          name: optionalText(
            option.name,
            CATALOG_LIMITS.optionName,
            'option name',
          )!,
          normalizedName: canonicalComparison(option.name.trim()),
          position: option.position,
        }),
      ),
    );
    await values.save(
      desired.options.flatMap((option) =>
        option.values.map((value) =>
          values.create({
            id: value.id,
            optionId: option.id,
            label: optionalText(
              value.label,
              CATALOG_LIMITS.optionValueLabel,
              'option value label',
            )!,
            normalizedLabel: canonicalComparison(value.label.trim()),
            position: value.position,
          }),
        ),
      ),
    );
    await variants.save(
      desired.variants.map((variant) => {
        const sku = normalizeSku(variant.sku);
        return variants.create({
          id: variant.id,
          productId,
          status: variant.status as VariantLifecycleStatus,
          title: optionalText(
            variant.title,
            CATALOG_LIMITS.variantTitle,
            'variant title',
          ),
          sku: sku.display,
          normalizedSku: sku.canonical,
          fulfillmentClassification:
            variant.fulfillmentClassification as CatalogVariant['fulfillmentClassification'],
          position: variant.position,
          combinationKey: combinationKey(variant.selectionValueIds),
        });
      }),
    );
    await selections.save(
      desired.variants.flatMap((variant) =>
        variant.selectionValueIds.map((optionValueId) => {
          const option = desired.options.find((candidate) =>
            candidate.values.some((value) => value.id === optionValueId),
          );
          return selections.create({
            variantId: variant.id,
            optionId: option!.id,
            optionValueId,
          });
        }),
      ),
    );
  }

  private async replaceCanonicalSlug(
    manager: EntityManager,
    product: CatalogProduct,
    slug: string,
  ): Promise<void> {
    const slugs = manager.getRepository(CatalogProductSlug);
    const existing = await slugs.findOneBy({ slug });
    if (existing && existing.productId !== product.id)
      throw this.error('catalog.slug_conflict', 'slug is already reserved');
    await slugs.update(
      { productId: product.id, isCanonical: true },
      { isCanonical: false },
    );
    if (existing)
      await slugs.update({ id: existing.id }, { isCanonical: true });
    else
      await slugs.save(
        slugs.create({ productId: product.id, slug, isCanonical: true }),
      );
  }

  private async loadDetail(
    manager: EntityManager,
    product: CatalogProduct,
  ): Promise<ProductDetail> {
    const options = await manager.getRepository(CatalogProductOption).find({
      where: { productId: product.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    const values = options.length
      ? await manager.getRepository(CatalogOptionValue).find({
          where: { optionId: In(options.map((option) => option.id)) },
          order: { position: 'ASC', id: 'ASC' },
        })
      : [];
    const variants = await manager.getRepository(CatalogVariant).find({
      where: { productId: product.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    const selections = variants.length
      ? await manager
          .getRepository(CatalogVariantSelection)
          .findBy({ variantId: In(variants.map((variant) => variant.id)) })
      : [];
    return {
      ...this.productRow(product),
      options: options.map((option) => ({
        id: option.id,
        name: option.name,
        position: option.position,
        values: values
          .filter((value) => value.optionId === option.id)
          .map((value) => ({
            id: value.id,
            label: value.label,
            position: value.position,
          })),
      })),
      variants: variants.map((variant) => ({
        id: variant.id,
        status: variant.status,
        title: variant.title,
        sku: variant.sku,
        fulfillmentClassification: variant.fulfillmentClassification,
        position: variant.position,
        selectionValueIds: selections
          .filter((selection) => selection.variantId === variant.id)
          .map((selection) => selection.optionValueId)
          .sort(),
      })),
    };
  }

  private async listProducts(
    query: ProductListQuery,
    published: boolean,
  ): Promise<ProductListResult> {
    const limit = this.pageLimit(query.limit);
    const cursor = this.decodeCursor(query.cursor);
    const sku =
      query.sku === undefined ? undefined : normalizeSku(query.sku).canonical;
    const q =
      query.q === undefined ? undefined : canonicalComparison(query.q.trim());
    const rows = await this.persistence.withTransaction(async (manager) => {
      const products = manager
        .getRepository(CatalogProduct)
        .createQueryBuilder('product');
      if (published) {
        products
          .andWhere(
            'EXISTS (SELECT 1 FROM catalog_variants active_variant WHERE active_variant.product_id = product.id AND active_variant.status = :activeStatus)',
            { activeStatus: VariantLifecycleStatus.ACTIVE },
          )
          .andWhere('product.status = :publishedStatus', {
            publishedStatus: ProductLifecycleStatus.PUBLISHED,
          });
      } else if (query.status) {
        products.andWhere('product.status = :status', {
          status: query.status as ProductLifecycleStatus,
        });
      }
      if (sku !== undefined) {
        if (sku === null) return [];
        products.andWhere(
          'EXISTS (SELECT 1 FROM catalog_variants sku_variant WHERE sku_variant.product_id = product.id AND sku_variant.normalized_sku = :sku)',
          { sku },
        );
      }
      if (q) {
        products.andWhere(
          '(LOWER(product.title) LIKE :prefix OR product.slug LIKE :prefix)',
          { prefix: `${q}%` },
        );
      }
      const timestampColumn = published
        ? 'product.published_at'
        : 'product.updated_at';
      if (cursor) {
        products.andWhere(
          `(${timestampColumn} < :cursorTimestamp OR (${timestampColumn} = :cursorTimestamp AND product.id < :cursorId))`,
          { cursorTimestamp: cursor.timestamp, cursorId: cursor.id },
        );
      }
      products
        .orderBy(timestampColumn, 'DESC')
        .addOrderBy('product.id', 'DESC')
        .take(limit + 1);
      return products.getMany();
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((product) => this.productRow(product)),
      nextCursor:
        rows.length > limit ? this.encodeCursor(page.at(-1)!, published) : null,
    };
  }

  private async getPublicByProductId(
    productId: string,
  ): Promise<PublicProduct> {
    const detail = await this.getAdminDetail(productId);
    if (
      detail.status !== 'published' ||
      !detail.variants.some((variant) => variant.status === 'active')
    )
      throw this.error('catalog.not_found', 'Product was not found');
    return this.toPublic(detail);
  }

  private toPublic(detail: ProductDetail): PublicProduct {
    const product: Omit<PublicProduct, 'variants'> = {
      id: detail.id,
      title: detail.title,
      summary: detail.summary,
      description: detail.description,
      slug: detail.slug,
      publishedAt: detail.publishedAt,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      options: detail.options,
    };
    return {
      ...product,
      variants: detail.variants
        .filter((variant) => variant.status === 'active')
        .map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          fulfillmentClassification: variant.fulfillmentClassification,
          position: variant.position,
          selectionValueIds: variant.selectionValueIds,
        })),
    };
  }

  private productRow(product: CatalogProduct): ProductRow {
    return {
      id: product.id,
      version: product.version,
      status: product.status,
      title: product.title,
      summary: product.summary,
      description: product.description,
      slug: product.slug,
      everPublished: product.everPublished,
      publishedAt: product.publishedAt,
      archivedAt: product.archivedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private contractIds(variantIds: readonly string[]): readonly string[] {
    if (
      variantIds.length > CONTRACT_VARIANT_LIMIT ||
      new Set(variantIds).size !== variantIds.length ||
      variantIds.some((id) => !UUID.test(id))
    )
      throw this.error(
        'catalog.validation_failed',
        'variantIds must be a bounded deduplicated UUID list',
      );
    return variantIds;
  }

  private async readVariants(ids: readonly string[]) {
    return this.persistence.withTransaction(async (manager) => {
      const variants = await manager
        .getRepository(CatalogVariant)
        .findBy({ id: In(ids) });
      const products = await manager
        .getRepository(CatalogProduct)
        .findBy({ id: In(variants.map((variant) => variant.productId)) });
      const byProduct = new Map(
        products.map((product) => [product.id, product]),
      );
      return variants.flatMap((variant) => {
        const product = byProduct.get(variant.productId);
        return product ? [{ variant, product }] : [];
      });
    });
  }

  private pageLimit(limit?: number): number {
    if (limit === undefined) return CATALOG_LIMITS.pageSizeDefault;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > CATALOG_LIMITS.pageSizeMaximum
    )
      throw this.error('catalog.validation_failed', 'limit is invalid');
    return limit;
  }
  private encodeCursor(
    product: CatalogProduct | ProductRow,
    published: boolean,
  ): string {
    const timestamp = published ? product.publishedAt : product.updatedAt;
    return Buffer.from(
      JSON.stringify([timestamp?.toISOString(), product.id]),
    ).toString('base64url');
  }
  private decodeCursor(
    cursor?: string,
  ): { timestamp: string; id: string } | null {
    if (!cursor) return null;
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (
        !Array.isArray(parsed) ||
        typeof parsed[0] !== 'string' ||
        typeof parsed[1] !== 'string' ||
        Number.isNaN(Date.parse(parsed[0]))
      )
        throw new Error();
      return { timestamp: parsed[0], id: parsed[1] };
    } catch {
      throw this.error('catalog.validation_failed', 'cursor is invalid');
    }
  }
  private isAfterCursor(
    product: CatalogProduct,
    cursor: { timestamp: string; id: string },
    published: boolean,
  ): boolean {
    const value = (
      published ? product.publishedAt : product.updatedAt
    )?.toISOString();
    return (
      value !== undefined &&
      (value < cursor.timestamp ||
        (value === cursor.timestamp && product.id < cursor.id))
    );
  }
  private error(
    code: CatalogApplicationErrorCode,
    message: string,
    currentVersion?: number,
  ): CatalogApplicationError {
    return new CatalogApplicationError(code, message, currentVersion);
  }
  private translate(error: unknown): CatalogApplicationError {
    if (error instanceof CatalogApplicationError) return error;
    if (error instanceof CatalogRuleError)
      return this.error(
        error.code === 'validation'
          ? 'catalog.validation_failed'
          : `catalog.${error.code}`,
        error.message,
      );
    if (
      error instanceof QueryFailedError ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505')
    ) {
      const detail = JSON.stringify(error);
      return this.error(
        /sku/i.test(detail) ? 'catalog.sku_conflict' : 'catalog.slug_conflict',
        'Catalog identifier is already reserved',
      );
    }
    return this.error(
      'catalog.configuration_conflict',
      'Catalog operation could not be completed',
    );
  }
}
