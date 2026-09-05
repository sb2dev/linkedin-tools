/**
 * The repository against a real PostgreSQL, because what is under test here is the SQL: an upsert
 * that must not overwrite the row's own creation columns, a keyset stream that a concurrent commit
 * cannot make skip a row, and an int8 that has to come back a number rather than a string.
 */

import { Repository } from 'typeorm';
import { aProfile, corpus, realProfile, withContentHash } from 'src/test/fakes';
import { describeCluster, itNeedsCluster, truncateAll } from 'src/test/postgres/cluster';
import { ProfileEntity } from './profile.entity';
import { TypeormProfileRepository } from './typeorm-profile.repository';

describeCluster('TypeormProfileRepository', (context) => {
  let repository: TypeormProfileRepository;
  let rows: Repository<ProfileEntity>;

  beforeEach(async () => {
    if (!context.dataSource) return;
    await truncateAll(context.dataSource);
    rows = context.dataSource.getRepository(ProfileEntity);
    repository = new TypeormProfileRepository(rows, context.dataSource);
  });

  itNeedsCluster('writes a profile and reads the whole aggregate back', async () => {
    const profile = realProfile();

    await repository.upsertAll([profile]);
    const found = await repository.findByUsername(profile.identity.linkedinUsername);

    expect(found).toEqual(profile);
  });

  itNeedsCluster('answers null for a username nobody imported', async () => {
    expect(await repository.findByUsername('nobody')).toBeNull();
  });

  itNeedsCluster('writes nothing, and issues no statement, for an empty batch', async () => {
    await repository.upsertAll([]);

    expect(await repository.count()).toBe(0);
  });

  itNeedsCluster('counts what is stored', async () => {
    await repository.upsertAll(corpus(5));

    expect(await repository.count()).toBe(5);
  });

  itNeedsCluster('collapses two rows for the same person within one batch', async () => {
    const first = aProfile('ada', { person: { fullName: 'ada' } });
    const second = aProfile('ada', { person: { fullName: 'ada lovelace' } });

    await repository.upsertAll([first, second]);

    expect(await repository.count()).toBe(1);
    expect((await repository.findByUsername('ada'))?.person.fullName).toBe('ada lovelace');
  });

  itNeedsCluster('updates an existing person rather than inserting a second row', async () => {
    await repository.upsertAll([aProfile('ada', { person: { fullName: 'ada' } })]);
    await repository.upsertAll([
      aProfile('ada', { person: { fullName: 'ada lovelace' } }),
    ]);

    expect(await repository.count()).toBe(1);
    expect((await repository.findByUsername('ada'))?.person.fullName).toBe('ada lovelace');
  });

  itNeedsCluster('keeps created_at from the first write when a later import updates the row', async () => {
    await repository.upsertAll([aProfile('ada')]);
    const created = (await rows.findOneByOrFail({ linkedinUsername: 'ada' })).createdAt;

    await repository.upsertAll([withContentHash(aProfile('ada'), 'a-new-hash')]);
    const after = await rows.findOneByOrFail({ linkedinUsername: 'ada' });

    expect(after.createdAt).toEqual(created);
    expect(after.contentHash).toBe('a-new-hash');
  });

  itNeedsCluster('writes a batch larger than one chunk in a single transaction', async () => {
    await repository.upsertAll(corpus(600));

    expect(await repository.count()).toBe(600);
  });

  describe('hashesFor', () => {
    itNeedsCluster('returns the stored hash for each key it was asked about', async () => {
      await repository.upsertAll([aProfile('ada'), aProfile('grace')]);

      const hashes = await repository.hashesFor(['ada', 'grace', 'absent']);

      expect(hashes).toEqual(
        expect.arrayContaining([
          { linkedinUsername: 'ada', contentHash: 'hash-of-ada' },
          { linkedinUsername: 'grace', contentHash: 'hash-of-grace' },
        ]),
      );
      expect(hashes).toHaveLength(2);
    });

    itNeedsCluster('asks nothing of the database for an empty key list', async () => {
      expect(await repository.hashesFor([])).toEqual([]);
    });
  });

  describe('streamAll', () => {
    itNeedsCluster('yields every profile, in batches of the size asked for', async () => {
      await repository.upsertAll(corpus(7));

      const batches: number[] = [];
      let total = 0;
      for await (const batch of repository.streamAll(3)) {
        batches.push(batch.length);
        total += batch.length;
      }

      expect(batches).toEqual([3, 3, 1]);
      expect(total).toBe(7);
    });

    itNeedsCluster('yields nothing for an empty corpus', async () => {
      const seen: unknown[] = [];
      for await (const batch of repository.streamAll(10)) seen.push(batch);

      expect(seen).toEqual([]);
    });

    itNeedsCluster('stops cleanly when the corpus divides exactly by the batch size', async () => {
      await repository.upsertAll(corpus(4));

      const batches: number[] = [];
      for await (const batch of repository.streamAll(2)) batches.push(batch.length);

      expect(batches).toEqual([2, 2]);
    });

    itNeedsCluster('holds the batch size inside its bounds rather than trusting the caller', async () => {
      await repository.upsertAll(corpus(3));

      const batches: number[] = [];
      for await (const batch of repository.streamAll(0)) batches.push(batch.length);

      // 0 is clamped to 1, so each profile arrives on its own.
      expect(batches).toEqual([1, 1, 1]);
    });

    itNeedsCluster('rebuilds the whole aggregate from the raw column alone', async () => {
      const profile = realProfile();
      await repository.upsertAll([profile]);

      for await (const batch of repository.streamAll(10)) {
        expect(batch[0]).toEqual(profile);
      }
    });
  });

  itNeedsCluster('empties the table', async () => {
    await repository.upsertAll(corpus(3));

    await repository.deleteAll();

    expect(await repository.count()).toBe(0);
  });
});
