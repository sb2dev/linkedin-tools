/** The PostgreSQL side of ProfileRepositoryPort, keyed throughout on `linkedin_username`. */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { chunk } from 'src/shared/collections';
import { Profile } from '../../domain/profile';
import { ProfileRepositoryPort, StoredHash } from '../../domain/ports/profile-repository.port';
import { ProfileEntity } from './profile.entity';
import { ProfileMapper, ProfileRow } from './profile.mapper';

/** A row binds 68 parameters, so 500 rows send 34000 of Postgres' 65535 per-statement limit. */
const UPSERT_CHUNK = 500;
const MAX_STREAM_BATCH = 1000;

/** Written once, on insert, and never overwritten by a later upload of the same person. */
const NEVER_OVERWRITTEN = new Set(['id', 'linkedin_username', 'created_at']);

interface HashRow {
  readonly linkedin_username: string;
  readonly content_hash: string;
}

@Injectable()
export class TypeormProfileRepository implements ProfileRepositoryPort {
  private readonly overwrittenColumns: string[];
  private readonly hashQuery: string;

  constructor(
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
  ) {
    this.overwrittenColumns = this.profiles.metadata.columns
      .map((column) => column.databaseName)
      .filter((name) => !NEVER_OVERWRITTEN.has(name));
    this.hashQuery = `SELECT linkedin_username, content_hash FROM ${this.profiles.metadata.tableName}
       WHERE linkedin_username = ANY($1)`;
  }

  async upsertAll(profiles: readonly Profile[]): Promise<void> {
    if (profiles.length === 0) return;

    const byUsername = new Map<string, ProfileRow>();
    for (const profile of profiles) {
      byUsername.set(profile.identity.linkedinUsername, ProfileMapper.toRow(profile));
    }
    const rows = [...byUsername.values()];

    await this.dataSource.transaction(async (manager: EntityManager) => {
      for (const batch of chunk(rows, UPSERT_CHUNK)) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(ProfileEntity)
          .values(batch as QueryDeepPartialEntity<ProfileEntity>[])
          .orUpdate(this.overwrittenColumns, ['linkedin_username'])
          .updateEntity(false)
          .execute();
      }
    });
  }

  async findByUsername(username: string): Promise<Profile | null> {
    const row = await this.profiles.findOne({ where: { linkedinUsername: username } });
    return row ? ProfileMapper.toDomain(row) : null;
  }

  async hashesFor(usernames: readonly string[]): Promise<readonly StoredHash[]> {
    if (usernames.length === 0) return [];

    // `query` is untyped, so the row shape is asserted once here rather than at each use.
    const rows: readonly HashRow[] = await this.profiles.query(this.hashQuery, [usernames]);
    return rows.map((row) => ({ linkedinUsername: row.linkedin_username, contentHash: row.content_hash }));
  }

  /** Keyset, not OFFSET: OFFSET is quadratic and skips rows if an import commits mid-rebuild. */
  async *streamAll(batchSize: number): AsyncIterableIterator<readonly Profile[]> {
    const size = Math.min(Math.max(Math.trunc(batchSize) || 1, 1), MAX_STREAM_BATCH);
    let cursor = '';

    for (;;) {
      const rows = await this.profiles
        .createQueryBuilder('profile')
        .select(['profile.linkedinUsername', 'profile.raw'])
        .where('profile.linkedinUsername > :cursor', { cursor })
        .orderBy('profile.linkedinUsername', 'ASC')
        .limit(size)
        .getMany();

      if (rows.length === 0) return;

      yield rows.map((row) => ProfileMapper.toDomain(row));

      if (rows.length < size) return;
      cursor = rows[rows.length - 1].linkedinUsername;
    }
  }

  count(): Promise<number> {
    return this.profiles.count();
  }

  /** TRUNCATE rather than DELETE: no row triggers, and the table is reset in one statement. */
  deleteAll(): Promise<void> {
    return this.profiles.clear();
  }
}
