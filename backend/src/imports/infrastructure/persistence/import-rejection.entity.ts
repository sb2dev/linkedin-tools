/** One rejected source line, kept per line so a reader can find it in the file. */

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('import_rejections')
@Index('import_rejections_session_reason_idx', ['sessionId', 'reason'])
export class ImportRejectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'import_session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber!: number;

  /** The RejectionReason enum value, stored as its string so the enum can grow without a migration. */
  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ name: 'raw_excerpt', type: 'text' })
  rawExcerpt!: string;
}
