import type {
  FulfillmentClassification,
  ProductStatus,
  VariantStatus,
} from '../domain';

export const CATALOG_MODULE_CONTRACT = Symbol('catalog-module-contract');

export interface PurchasableVariantResolution {
  readonly productId: string;
  readonly variantId: string;
  readonly productStatus: ProductStatus;
  readonly variantStatus: VariantStatus;
  readonly eligible: boolean;
  readonly title: string;
  readonly sku: string | null;
  readonly fulfillmentClassification: FulfillmentClassification;
}

export interface VariantSnapshotFact {
  readonly productId: string;
  readonly variantId: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly sku: string | null;
  readonly productStatus: ProductStatus;
  readonly variantStatus: VariantStatus;
  readonly fulfillmentClassification: FulfillmentClassification;
}

/** The only supported in-process dependency surface for other modules. */
export interface CatalogModuleContract {
  resolvePurchasableVariants(
    variantIds: readonly string[],
  ): Promise<readonly PurchasableVariantResolution[]>;
  getVariantSnapshotFacts(
    variantIds: readonly string[],
  ): Promise<readonly VariantSnapshotFact[]>;
}
