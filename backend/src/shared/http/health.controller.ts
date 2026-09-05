/** Answers 200 with a degraded status rather than throwing, so nothing restarts the process. */

import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from 'src/profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH, ProfileSearchPort } from 'src/profiles/domain/ports/profile-search.port';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  readonly status!: 'ok' | 'degraded';

  @ApiProperty({ description: 'The system of record answered a count query.' })
  readonly postgres!: boolean;

  @ApiProperty({ description: 'The bound search driver answered a read, whichever one it is.' })
  readonly search!: boolean;

  @ApiProperty({ description: 'Profiles held in Postgres; 0 when Postgres is unreachable.' })
  readonly profiles!: number;
}

/** A prefix chosen to match nothing, so the probe is a real round trip that returns no data. */
const PROBE_PREFIX = '__healthcheck__';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepositoryPort,
    @Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service and dependency status' })
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    const [count, search] = await Promise.all([this.countProfiles(), this.probeSearch()]);
    const postgres = count !== null;

    return {
      status: postgres && search ? 'ok' : 'degraded',
      postgres,
      search,
      profiles: count ?? 0,
    };
  }

  private async countProfiles(): Promise<number | null> {
    try {
      return await this.profiles.count();
    } catch (error) {
      this.logger.warn(`Postgres is unreachable: ${messageOf(error)}`);
      return null;
    }
  }

  private async probeSearch(): Promise<boolean> {
    try {
      await this.search.suggest('skills', PROBE_PREFIX, 1);
      return true;
    } catch (error) {
      this.logger.warn(`The search driver is unreachable: ${messageOf(error)}`);
      return false;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
