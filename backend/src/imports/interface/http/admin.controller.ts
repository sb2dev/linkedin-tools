/** The operator's view of the corpus, and the one way to empty it. */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from 'src/auth/interface/current-user.decorator';
import { AuthenticatedUser } from 'src/auth/domain/authenticated-user';
import { JwtAuthGuard } from 'src/auth/interface/jwt-auth.guard';
import { DescribeCorpusUseCase } from '../../application/describe-corpus.use-case';
import { PurgeNotConfirmedError } from '../../application/import-errors';
import { PurgeCorpusUseCase } from '../../application/purge-corpus.use-case';
import { CorpusStatusDto } from './dto/corpus-status.dto';
import { PurgeCorpusDto } from './dto/purge-corpus.dto';
import { PurgeResultDto } from './dto/purge-result.dto';

/** Emptying a corpus is a once-a-day act at most. */
const PURGE_RATE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@Controller('admin/corpus')
export class CorpusAdminController {
  constructor(
    private readonly describeCorpus: DescribeCorpusUseCase,
    private readonly purgeCorpus: PurgeCorpusUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'What the corpus holds, and which import last filled it' })
  @ApiOkResponse({ type: CorpusStatusDto })
  status(): Promise<CorpusStatusDto> {
    return this.describeCorpus.execute();
  }

  @Post('purge')
  @HttpCode(HttpStatus.OK)
  @Throttle(PURGE_RATE)
  @ApiOperation({ summary: 'Delete every profile, keeping the import history' })
  @ApiOkResponse({ type: PurgeResultDto })
  @ApiBadRequestResponse({ description: 'The confirmation phrase was missing or wrong.' })
  async purge(
    @Body() body: PurgeCorpusDto,
    // The guard put it there; a request that reached this line carries a caller.
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurgeResultDto> {
    try {
      return await this.purgeCorpus.execute({
        confirmation: body.confirm,
        actor: caller.username,
      });
    } catch (error) {
      if (error instanceof PurgeNotConfirmedError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
