import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiCsrfProtected,
  ApiSessionAuthenticated,
} from '../../../platform/openapi';
import { Public } from '../../../platform/http/authentication';
import { PermissionKey } from '../../authorization/data';
import { AdminApi, RequirePermissions } from '../../authorization/enforcement';
import { CatalogApplicationError } from '../application/catalog-application.error';
import { CatalogApplicationService } from '../application/catalog-application.service';
import {
  CreateProductDto,
  EditProductDto,
  ReplaceConfigurationDto,
  ProductTransitionDto,
  AdminProductQueryDto,
  PublicProductQueryDto,
} from './catalog.dto';

const errorStatus: Record<CatalogApplicationError['code'], HttpStatus> = {
  'catalog.validation_failed': HttpStatus.BAD_REQUEST,
  'catalog.not_found': HttpStatus.NOT_FOUND,
  'catalog.slug_conflict': HttpStatus.CONFLICT,
  'catalog.sku_conflict': HttpStatus.CONFLICT,
  'catalog.version_conflict': HttpStatus.CONFLICT,
  'catalog.invalid_product_transition': HttpStatus.CONFLICT,
  'catalog.configuration_conflict': HttpStatus.CONFLICT,
};
function translateCatalogError(error: unknown): never {
  if (error instanceof CatalogApplicationError) {
    throw new HttpException(
      {
        message: error.message,
        code: error.code,
        ...(error.currentVersion === undefined
          ? {}
          : { currentVersion: error.currentVersion }),
      },
      errorStatus[error.code],
    );
  }
  throw error;
}

@AdminApi()
@ApiTags('Catalog administration')
@ApiSessionAuthenticated()
@Controller('admin/catalog')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogApplicationService) {}
  @Post('products')
  @ApiCsrfProtected()
  @ApiCreatedResponse()
  @ApiOperation({
    summary: 'Create a draft Product and default Variant',
    description: 'Requires admin.access and catalog.products.write.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_WRITE)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiConflictResponse()
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async create(@Body() dto: CreateProductDto) {
    try {
      return await this.catalog.createProduct(dto);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Get('products')
  @ApiOperation({
    summary: 'List Products with bounded cursor pagination',
    description: 'Requires admin.access and catalog.products.read.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_READ)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async list(@Query() dto: AdminProductQueryDto) {
    try {
      return await this.catalog.listAdmin(dto);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Get('products/:productId')
  @ApiOperation({
    summary: 'Return the complete administrative Product aggregate',
    description: 'Requires admin.access and catalog.products.read.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_READ)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async detail(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    try {
      return await this.catalog.getAdminDetail(id);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Patch('products/:productId')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Edit Product merchandising fields',
    description: 'Requires admin.access and catalog.products.write.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_WRITE)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async edit(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: EditProductDto,
  ) {
    try {
      return await this.catalog.editMerchandising(id, dto);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Put('products/:productId/configuration')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Atomically replace allowed Product configuration',
    description:
      'Requires admin.access and catalog.products.write; catalog.products.archive is also required when restoring or archiving an existing Variant.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_WRITE)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async configuration(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReplaceConfigurationDto,
    @Req() request: Request,
  ) {
    try {
      await this.requireArchiveForExistingVariantTransitions(id, dto, request);
      return await this.catalog.replaceConfiguration(id, dto);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Post('products/:productId/publish')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Publish Product',
    description: 'Requires admin.access and catalog.products.publish.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_PUBLISH)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async publish(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProductTransitionDto,
  ) {
    return this.transition('publish', id, dto.expectedVersion);
  }
  @Post('products/:productId/unpublish')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Return Product to draft',
    description: 'Requires admin.access and catalog.products.publish.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_PUBLISH)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async unpublish(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProductTransitionDto,
  ) {
    return this.transition('unpublish', id, dto.expectedVersion);
  }
  @Post('products/:productId/archive')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Archive Product',
    description: 'Requires admin.access and catalog.products.archive.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_ARCHIVE)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async archive(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProductTransitionDto,
  ) {
    return this.transition('archive', id, dto.expectedVersion);
  }
  @Post('products/:productId/restore')
  @ApiCsrfProtected()
  @ApiOperation({
    summary: 'Restore Product to draft',
    description: 'Requires admin.access and catalog.products.archive.',
  })
  @RequirePermissions(PermissionKey.CATALOG_PRODUCTS_ARCHIVE)
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async restore(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProductTransitionDto,
  ) {
    return this.transition('restore', id, dto.expectedVersion);
  }
  private async transition(
    operation: 'publish' | 'unpublish' | 'archive' | 'restore',
    id: string,
    expectedVersion: number,
  ) {
    try {
      return await this.catalog[operation](id, expectedVersion);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  private async requireArchiveForExistingVariantTransitions(
    id: string,
    dto: ReplaceConfigurationDto,
    request: Request,
  ) {
    const current = await this.catalog.getAdminDetail(id);
    const prior = new Map(
      current.variants.map((variant) => [variant.id, variant.status]),
    );
    const changed = dto.variants.some(
      (variant) =>
        variant.id &&
        prior.has(variant.id) &&
        prior.get(variant.id) !== variant.status,
    );
    if (
      changed &&
      !request.authorization?.permissions.includes(
        PermissionKey.CATALOG_PRODUCTS_ARCHIVE,
      )
    )
      throw new ForbiddenException();
  }
}

@ApiTags('Catalog')
@Public()
@Controller('catalog')
export class CatalogPublicController {
  constructor(private readonly catalog: CatalogApplicationService) {}
  @Get('products')
  @ApiOperation({
    summary: 'List published Products with bounded cursor pagination',
  })
  @ApiResponse({ status: 400, description: 'catalog.validation_failed' })
  async list(@Query() dto: PublicProductQueryDto) {
    try {
      return await this.catalog.listPublished(dto);
    } catch (error) {
      translateCatalogError(error);
    }
  }
  @Get('products/:slug')
  @ApiOperation({
    summary: 'Resolve a published Product by canonical or historical slug',
  })
  @ApiNotFoundResponse({
    description:
      'catalog.not_found; hidden, archived, draft, and unknown Products are indistinguishable.',
  })
  async detail(@Param('slug') slug: string) {
    try {
      return await this.catalog.resolvePublishedSlug(slug);
    } catch (error) {
      translateCatalogError(error);
    }
  }
}
