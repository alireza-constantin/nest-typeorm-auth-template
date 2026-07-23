/** Catalog's intentionally narrow cross-module entry point. */
export { CatalogModule } from './catalog.module';
export { CATALOG_MODULE_CONTRACT } from './application/catalog-contract';
export type {
  CatalogModuleContract,
  PurchasableVariantResolution,
  VariantSnapshotFact,
} from './application/catalog-contract';
