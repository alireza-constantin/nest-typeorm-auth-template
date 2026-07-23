import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CATALOG_RESERVED_ROUTES,
  DEFAULT_CATALOG_RESERVED_ROUTES,
} from './catalog.constants';
import { normalizeSlug } from './domain';
import { CatalogApplicationService } from './application/catalog-application.service';
import { CATALOG_MODULE_CONTRACT } from './application/catalog-contract';
import { CatalogPersistenceService } from './persistence/catalog-persistence.service';
import { CatalogAdminController, CatalogPublicController } from './http';
import {
  CatalogOptionValue,
  CatalogProduct,
  CatalogProductOption,
  CatalogProductSlug,
  CatalogVariant,
  CatalogVariantSelection,
} from './persistence';

function configuredReservedRoutes(config: ConfigService): readonly string[] {
  const raw = config.get<string>('CATALOG_RESERVED_ROUTES');
  const supplied =
    raw === undefined ? DEFAULT_CATALOG_RESERVED_ROUTES : raw.split(',');
  const routes = supplied.map((route) => normalizeSlug(route));
  if (new Set(routes).size !== routes.length) {
    throw new Error(
      'CATALOG_RESERVED_ROUTES contains duplicate normalized routes',
    );
  }
  return Object.freeze(routes);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogProduct,
      CatalogProductSlug,
      CatalogVariant,
      CatalogProductOption,
      CatalogOptionValue,
      CatalogVariantSelection,
    ]),
  ],
  providers: [
    {
      provide: CATALOG_RESERVED_ROUTES,
      inject: [ConfigService],
      useFactory: configuredReservedRoutes,
    },
    CatalogPersistenceService,
    CatalogApplicationService,
    {
      provide: CATALOG_MODULE_CONTRACT,
      useExisting: CatalogApplicationService,
    },
  ],
  controllers: [CatalogAdminController, CatalogPublicController],
  exports: [CATALOG_MODULE_CONTRACT],
})
export class CatalogModule {}
