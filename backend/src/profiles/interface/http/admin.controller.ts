/** Operator-only maintenance: the index is rebuilt from Postgres, the system of record. */

import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/interface/jwt-auth.guard';
import { ReindexUseCase } from '../../application/reindex.use-case';
import { ReindexResultDto } from './dto/reindex-result.dto';

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly reindex: ReindexUseCase) {}

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recreate the search index from Postgres' })
  @ApiOkResponse({ type: ReindexResultDto })
  execute(): Promise<ReindexResultDto> {
    return this.reindex.execute();
  }
}
