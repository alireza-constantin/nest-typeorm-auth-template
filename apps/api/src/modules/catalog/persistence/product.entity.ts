import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProductLifecycleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity({ name: 'catalog_products' })
@Check('CHK_catalog_products_version_positive', 'version > 0')
@Index('UQ_catalog_products_slug', ['slug'], { unique: true })
export class CatalogProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({
    type: 'enum',
    enum: ProductLifecycleStatus,
    enumName: 'catalog_product_status',
    default: ProductLifecycleStatus.DRAFT,
  })
  status: ProductLifecycleStatus;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Canonical normalized slug. Historical and canonical reservations live together. */
  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ name: 'ever_published', type: 'boolean', default: false })
  everPublished: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
