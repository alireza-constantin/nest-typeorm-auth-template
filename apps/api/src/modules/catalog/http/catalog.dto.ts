import { Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
const VARIANT_STATUSES = ['active', 'archived'] as const;
const FULFILLMENT = ['physical', 'digital', 'service'] as const;

export class CreateProductDto {
  @ApiProperty({ maxLength: 200, minLength: 1 })
  @IsString() title!: string;
  @ApiProperty({ maxLength: 160, minLength: 1 })
  @IsString() slug!: string;
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() summary?: string | null;
  @ApiPropertyOptional({ maxLength: 50_000, nullable: true })
  @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @IsString() defaultVariantTitle?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional() @IsString() defaultVariantSku?: string | null;
  @ApiProperty({ enum: FULFILLMENT })
  @IsIn(FULFILLMENT) fulfillmentClassification!: (typeof FULFILLMENT)[number];
}

export class EditProductDto {
  @ApiProperty({ minimum: 1, type: Number })
  @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ maxLength: 200, minLength: 1 })
  @IsString() title!: string;
  @ApiProperty({ maxLength: 160, minLength: 1 })
  @IsString() slug!: string;
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() summary?: string | null;
  @ApiPropertyOptional({ maxLength: 50_000, nullable: true })
  @IsOptional() @IsString() description?: string | null;
}

export class OptionValueDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ maxLength: 100, minLength: 1 })
  @IsString() label!: string;
  @ApiProperty({ minimum: 0, type: Number })
  @IsInt() @Min(0) position!: number;
}

export class ConfigurationOptionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ maxLength: 100, minLength: 1 })
  @IsString() name!: string;
  @ApiProperty({ minimum: 0, type: Number })
  @IsInt() @Min(0) position!: number;
  @ApiProperty({ type: () => [OptionValueDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OptionValueDto)
  values!: OptionValueDto[];
}

export class ConfigurationVariantDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ enum: VARIANT_STATUSES })
  @IsIn(VARIANT_STATUSES) status!: (typeof VARIANT_STATUSES)[number];
  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @IsString() title?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional() @IsString() sku?: string | null;
  @ApiProperty({ minimum: 0, type: Number })
  @IsInt() @Min(0) position!: number;
  @ApiProperty({ enum: FULFILLMENT })
  @IsIn(FULFILLMENT) fulfillmentClassification!: (typeof FULFILLMENT)[number];
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  selectionValueIds!: string[];
}

export class ReplaceConfigurationDto {
  @ApiProperty({ minimum: 1, type: Number })
  @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ type: () => [ConfigurationOptionDto], maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ConfigurationOptionDto)
  options!: ConfigurationOptionDto[];
  @ApiProperty({ type: () => [ConfigurationVariantDto], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfigurationVariantDto)
  variants!: ConfigurationVariantDto[];
}

export class ProductTransitionDto {
  @ApiProperty({ minimum: 1, type: Number })
  @IsInt() @Min(1) expectedVersion!: number;
}

export class AdminProductQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, type: Number })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class PublicProductQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, type: Number })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
