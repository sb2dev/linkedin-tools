/** The work `npm run search:reindex` does, and what POST /api/admin/reindex runs through the same use case. */

import { INestApplicationContext, Logger } from '@nestjs/common';
import { ReindexUseCase } from 'src/profiles/application/reindex.use-case';

/** A rejected profile names itself and the reason, so a handful is a report and a corpus is noise. */
const FAILURES_LOGGED = 10;

export async function reindexProfiles(
  app: INestApplicationContext,
  logger: Logger,
): Promise<void> {
  try {
    const { indexed, failures } = await app.get(ReindexUseCase).execute();
    logger.log(`Indexed ${indexed} profiles`);
    if (failures.length > 0) {
      logger.warn(
        `${failures.length} profiles were rejected: ${failures.slice(0, FAILURES_LOGGED).join(', ')}`,
      );
    }
  } finally {
    await app.close();
  }
}
