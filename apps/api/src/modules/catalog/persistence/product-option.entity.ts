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

@Entity({ name: 'catalog_product_options' })
@Check('CHK_catalog_product_options_position_nonnegative', 'position >= 0')
@Index(
  'UQ_catalog_product_options_product_position',
  ['productId', 'position'],
  {
    unique: true,
  },
)
@Index(
  'UQ_catalog_product_options_product_normalized_name',
  ['productId', 'normalizedName'],
  { unique: true },
)
export class CatalogProductOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 100 })
  normalizedName: string;

  @Column({ type: 'integer' })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CatalogProduct, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  private readonly product?: CatalogProduct;
}
