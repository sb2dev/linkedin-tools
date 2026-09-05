/** The path parameter of `GET /api/profiles/:username`. */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** The shape the import layer normalises every LinkedIn slug to before it is stored. */
const LINKEDIN_USERNAME = /^[a-z0-9\-_%.]{3,120}$/;

export class ProfileParamsDto {
  @ApiProperty({
    description: "The slug of the person's linkedin.com/in/ URL, which is the business key.",
    example: 'jane-doe-1a2b3c',
    pattern: LINKEDIN_USERNAME.source,
  })
  // Express hands every path parameter over as a string, so there is no other shape to guard for.
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @Matches(LINKEDIN_USERNAME, { message: 'username is not a LinkedIn profile slug' })
  readonly username!: string;
}
