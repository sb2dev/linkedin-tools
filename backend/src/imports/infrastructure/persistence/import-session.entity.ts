/** One upload, with its counts and the bytes a commit re-reads. */

import { Column, Entity, Index, PrimaryColumn, ValueTransformer } from 'typeorm';
import { ImportCounts, ImportPreview, ImportStatus } from '../../domain/import-summary';

/** node-postgres returns int8 as a string; an upload size is comfortably a JS number. */
const bigintAsNumber: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity('import_sessions')
@Index('import_sessions_created_at_idx', ['createdAt'])
export class ImportSessionEntity {
  /** Assigned by the application: the preview payload names the import before it is stored. */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'text' })
  filename!: string;

  @Column({ name: 'size_bytes', type: 'bigint', transformer: bigintAsNumber })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 64 })
  checksum!: string;

  @Column({ type: 'text' })
  status!: ImportStatus;

  @Column({ type: 'jsonb' })
  counts!: ImportCounts;

  @Column({ type: 'jsonb' })
  preview!: ImportPreview;

  @Column({ type: 'bytea' })
  file!: Buffer;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'committed_at', type: 'timestamptz', nullable: true })
  committedAt!: Date | null;
}
