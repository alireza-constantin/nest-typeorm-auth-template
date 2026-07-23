export type CatalogApplicationErrorCode =
  | 'catalog.validation_failed'
  | 'catalog.not_found'
  | 'catalog.slug_conflict'
  | 'catalog.sku_conflict'
  | 'catalog.version_conflict'
  | 'catalog.invalid_product_transition'
  | 'catalog.configuration_conflict';

/** A transport-neutral, stable error surface for Catalog application callers. */
export class CatalogApplicationError extends Error {
  constructor(
    readonly code: CatalogApplicationErrorCode,
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
  }
}
