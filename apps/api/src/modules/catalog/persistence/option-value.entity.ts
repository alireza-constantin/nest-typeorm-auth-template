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
import { CatalogProductOption } from './product-option.entity';

@Entity({ name: 'catalog_option_values' })
@Check('CHK_catalog_option_values_position_nonnegative', 'position >= 0')
@Index('UQ_catalog_option_values_option_position', ['optionId', 'position'], {
  unique: true,
})
@Index(
  'UQ_catalog_option_values_option_normalized_label',
  ['optionId', 'normalizedLabel'],
  { unique: true },
)
export class CatalogOptionValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'option_id', type: 'uuid' })
  optionId: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ name: 'normalized_label', type: 'varchar', length: 100 })
  normalizedLabel: string;

  @Column({ type: 'integer' })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CatalogProductOption, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'option_id' })
  private readonly option?: CatalogProductOption;
}
