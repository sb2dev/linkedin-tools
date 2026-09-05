import { INestApplicationContext, Logger } from '@nestjs/common';
import { PROFILE_SEARCH, ProfileSearchPort } from 'src/profiles/domain/ports/profile-search.port';

export async function ensureSearchIndex(
  app: INestApplicationContext,
  logger: Logger,
): Promise<void> {
  try {
    await app.get<ProfileSearchPort>(PROFILE_SEARCH).ensureIndex();
    // ensureIndex returns early once the alias exists; it does not compare the stored mapping.
    logger.log('The search index exists');
  } finally {
    await app.close();
  }
}
