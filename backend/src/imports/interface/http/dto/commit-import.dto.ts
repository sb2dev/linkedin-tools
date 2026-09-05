import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CommitImportDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Apply the proven realignment to scrambled rows before committing. The same rows commit either way; omitted, their scrambled values stay quarantined.',
  })
  @IsOptional()
  @IsBoolean()
  readonly repair: boolean = false;
}
