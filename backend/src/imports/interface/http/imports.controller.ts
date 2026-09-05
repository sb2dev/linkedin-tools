/** The two-step upload. */

import { extname } from 'node:path';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/interface/jwt-auth.guard';
import { CommitImportUseCase } from '../../application/commit-import.use-case';
import { DescribeSourceRowUseCase } from '../../application/describe-source-row.use-case';
import {
  ImportAlreadyCommittedError,
  ImportNotFoundError,
  ImportPayloadReleasedError,
  NotAProfileExportError,
  PreviewExpiredError,
  SourceLineNotFoundError,
} from '../../application/import-errors';
import { ListImportsUseCase } from '../../application/list-imports.use-case';
import { PreviewImportUseCase } from '../../application/preview-import.use-case';
import { looksLikeJson } from '../../domain/dataset-format';
import { DatasetUnreadableError } from '../../domain/ports/dataset-reader.port';
import { BOUND_VALIDATION_PIPE } from 'src/profiles/interface/http/bound-validation.pipe';
import { CommitImportDto } from './dto/commit-import.dto';
import { ImportParamsDto, ImportRowParamsDto } from './dto/import-params.dto';
import { CommitResultDto } from './dto/commit-result.dto';
import { ImportPreviewDto, ImportRunListDto } from './dto/import-preview.dto';
import { ImportRowSourceDto } from './dto/import-row-source.dto';
import { UploadImportDto } from './dto/upload-import.dto';

/** Only what the bound DatasetReader can actually read: the comma-separated export, or JSON. */
const ALLOWED_EXTENSIONS = ['.csv', '.json'];
/** Comfortably past the 77-column header of the reference export. */
const SNIFF_BYTES = 8192;
/** Comma only: CsvDatasetReader parses no other delimiter. */
const DELIMITER = ',';
/** Uploading is expensive and rare; five a minute is generous for one operator. */
const UPLOAD_RATE = { default: { limit: 5, ttl: 60_000 } };

const SOURCE_ROW_RATE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('imports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly previewImport: PreviewImportUseCase,
    private readonly commitImport: CommitImportUseCase,
    private readonly listImports: ListImportsUseCase,
    private readonly describeSourceRow: DescribeSourceRowUseCase,
  ) {}

  @Post()
  @Throttle(UPLOAD_RATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Analyse a dataset and report what committing it would do' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadImportDto })
  @ApiCreatedResponse({ type: ImportPreviewDto, description: 'Nothing has been written yet.' })
  @ApiBadRequestResponse({ description: 'Not a readable LinkedIn profile export, CSV or JSON.' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a .csv or .json text export.' })
  @ApiPayloadTooLargeResponse({ description: 'Larger than the configured upload limit.' })
  async upload(@UploadedFile() file?: Express.Multer.File): Promise<ImportPreviewDto> {
    const dataset = assertReadableDataset(file);
    try {
      return await this.previewImport.execute({
        filename: dataset.originalname,
        buffer: dataset.buffer,
      });
    } catch (error) {
      throw asHttpError(error);
    }
  }

  @Get()
  @ApiOperation({ summary: 'The recent import runs, newest first' })
  @ApiOkResponse({ type: ImportRunListDto })
  list(): Promise<ImportRunListDto> {
    return this.listImports.execute();
  }

  @Get(':importId')
  @ApiOperation({ summary: 'Re-read a preview' })
  @ApiParam({ name: 'importId', format: 'uuid', description: 'The handle the upload returned.' })
  @ApiOkResponse({ type: ImportPreviewDto })
  @ApiBadRequestResponse({ description: 'The handle is not an import id.' })
  @ApiNotFoundResponse({ description: 'Unknown import.' })
  async detail(@Param(BOUND_VALIDATION_PIPE) params: ImportParamsDto): Promise<ImportPreviewDto> {
    try {
      return await this.previewImport.findById(params.importId);
    } catch (error) {
      throw asHttpError(error);
    }
  }

  @Get(':importId/rows/:lineNumber')
  @Throttle(SOURCE_ROW_RATE)
  @ApiOperation({ summary: 'The source line behind one row of the preview, column by column' })
  @ApiParam({ name: 'importId', format: 'uuid', description: 'The handle the upload returned.' })
  @ApiParam({ name: 'lineNumber', description: '1-based line in the uploaded file.' })
  @ApiOkResponse({ type: ImportRowSourceDto })
  @ApiBadRequestResponse({ description: 'The handle is not an import id, or the line is not a number.' })
  @ApiNotFoundResponse({ description: 'Unknown import, or no row starts on that line.' })
  @ApiConflictResponse({ description: 'The upload is no longer stored, so its lines cannot be read.' })
  async sourceRow(@Param(BOUND_VALIDATION_PIPE) params: ImportRowParamsDto): Promise<ImportRowSourceDto> {
    try {
      return await this.describeSourceRow.execute(params.importId, params.lineNumber);
    } catch (error) {
      throw asHttpError(error);
    }
  }

  @Post(':importId/commit')
  @HttpCode(HttpStatus.OK)
  @Throttle(UPLOAD_RATE)
  @ApiOperation({ summary: 'Write the previewed rows to Postgres and the search index' })
  @ApiParam({ name: 'importId', format: 'uuid', description: 'The handle the upload returned.' })
  @ApiOkResponse({ type: CommitResultDto })
  @ApiBadRequestResponse({ description: 'The handle is not an import id.' })
  @ApiNotFoundResponse({ description: 'Unknown import.' })
  @ApiConflictResponse({ description: 'Already committed, or the preview has expired.' })
  async commit(
    @Param(BOUND_VALIDATION_PIPE) params: ImportParamsDto,
    @Body() options: CommitImportDto,
  ): Promise<CommitResultDto> {
    try {
      return await this.commitImport.execute(params.importId, { repair: options.repair });
    } catch (error) {
      throw asHttpError(error);
    }
  }
}

/** The use cases and the dataset reader report transport-free failures; here they become statuses. */
function asHttpError(error: unknown): unknown {
  if (error instanceof ImportNotFoundError) return new NotFoundException(error.message);
  if (error instanceof SourceLineNotFoundError) return new NotFoundException(error.message);
  // The same 409 the other lifecycle refusals use: the import exists, its bytes no longer do.
  if (error instanceof ImportPayloadReleasedError) return new ConflictException(error.message);
  if (error instanceof ImportAlreadyCommittedError) return new ConflictException(error.message);
  if (error instanceof PreviewExpiredError) return new ConflictException(error.message);
  if (error instanceof NotAProfileExportError) return new BadRequestException(error.message);
  if (error instanceof DatasetUnreadableError) return new BadRequestException(error.message);
  return error;
}

/** Rejects up front what the parser could only fail on later. */
function assertReadableDataset(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file || file.buffer.length === 0) {
    throw new BadRequestException('Attach the dataset as a multipart field named "file"');
  }

  const extension = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new UnsupportedMediaTypeException(
      `"${file.originalname}" is not a supported dataset; expected ${ALLOWED_EXTENSIONS.join(', ')}`,
    );
  }

  const head = file.buffer.subarray(0, SNIFF_BYTES);
  if (head.includes(0)) {
    throw new UnsupportedMediaTypeException('The file is binary, not a text export');
  }

  const text = head.toString('utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new BadRequestException('The file is empty; it has no header row');
  }
  // A JSON export names its fields inside each record; only the reader can judge the rest of it.
  if (looksLikeJson(file.buffer)) return file;
  if (!lines[0].includes(DELIMITER)) {
    throw new BadRequestException('The first line is not a comma-separated header row');
  }
  // Only conclusive when the whole file fitted in the sniffed window.
  if (lines.length === 1 && file.buffer.length <= SNIFF_BYTES) {
    throw new BadRequestException('The file has a header row but no data rows');
  }

  return file;
}
