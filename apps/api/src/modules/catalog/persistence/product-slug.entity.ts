import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatalogProduct } from './product.entity';

/** A reservation includes the current canonical slug and every historical alias. */
@Entity({ name: 'catalog_product_slugs' })
@Index('UQ_catalog_product_slugs_slug', ['slug'], { unique: true })
@Index('UQ_catalog_product_slugs_canonical_per_product', ['productId'], {
  unique: true,
  where: 'is_canonical',
})
export class CatalogProductSlug {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ name: 'is_canonical', type: 'boolean', default: false })
  isCanonical: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => CatalogProduct, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  private readonly product?: CatalogProduct;
}
