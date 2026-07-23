import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatalogOptionValue } from './option-value.entity';
import { CatalogProductOption } from './product-option.entity';
import { CatalogVariant } from './variant.entity';

/** Option ID is persisted as well, so the database guarantees one value per option. */
@Entity({ name: 'catalog_variant_selections' })
@Index(
  'UQ_catalog_variant_selections_variant_option',
  ['variantId', 'optionId'],
  {
    unique: true,
  },
)
@Index(
  'UQ_catalog_variant_selections_variant_value',
  ['variantId', 'optionValueId'],
  { unique: true },
)
export class CatalogVariantSelection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'option_id', type: 'uuid' })
  optionId: string;

  @Column({ name: 'option_value_id', type: 'uuid' })
  optionValueId: string;

  @ManyToOne(() => CatalogVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  private readonly variant?: CatalogVariant;

  @ManyToOne(() => CatalogProductOption, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'option_id' })
  private readonly option?: CatalogProductOption;

  @ManyToOne(() => CatalogOptionValue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'option_value_id' })
  private readonly optionValue?: CatalogOptionValue;
}
