import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogProduct } from './product.entity';

export enum VariantLifecycleStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum VariantFulfillmentClassification {
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  SERVICE = 'service',
}

@Entity({ name: 'catalog_variants' })
@Check('CHK_catalog_variants_position_nonnegative', 'position >= 0')
@Index('UQ_catalog_variants_product_position', ['productId', 'position'], {
  unique: true,
})
@Index(
  'UQ_catalog_variants_product_combination',
  ['productId', 'combinationKey'],
  {
    unique: true,
  },
)
@Index('UQ_catalog_variants_normalized_sku', ['normalizedSku'], {
  unique: true,
  where: 'normalized_sku IS NOT NULL',
})
export class CatalogVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({
    type: 'enum',
    enum: VariantLifecycleStatus,
    enumName: 'catalog_variant_status',
    default: VariantLifecycleStatus.ACTIVE,
  })
  status: VariantLifecycleStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sku: string | null;

  @Column({
    name: 'normalized_sku',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  normalizedSku: string | null;

  @Column({
    name: 'fulfillment_classification',
    type: 'enum',
    enum: VariantFulfillmentClassification,
    enumName: 'catalog_variant_fulfillment_classification',
  })
  fulfillmentClassification: VariantFulfillmentClassification;

  @Column({ type: 'integer', default: 0 })
  position: number;

  /** Sorted selected Option-value IDs; the product-level unique index blocks races. */
  @Column({ name: 'combination_key', type: 'text', default: '' })
  combinationKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CatalogProduct, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  private readonly product?: CatalogProduct;
}
