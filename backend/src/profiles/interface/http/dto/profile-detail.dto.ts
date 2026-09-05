/** OpenAPI shape of a whole profile. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CertificationEntry,
  Company,
  Contact,
  CurrentJob,
  DataQuality,
  EducationEntry,
  ExperienceEntry,
  GeoPoint,
  LanguageEntry,
  Metrics,
  Person,
  Place,
  ProfileIdentity,
  SocialHandles,
} from '../../../domain/profile';
import { ProfileDetail } from '../../../domain/profile-detail';

/** Schema for an array whose entries keep the source export's own key names. */
const SOURCE_SHAPED_ARRAY = {
  type: 'array',
  items: { type: 'object', additionalProperties: true },
} as const;

export class GeoPointDto implements GeoPoint {
  @ApiProperty({ example: 33.19 })
  readonly lat!: number;

  @ApiProperty({ example: -97.13 })
  readonly lon!: number;
}

export class PlaceDto implements Place {
  @ApiPropertyOptional({ example: 'denton, texas, united states' })
  readonly name?: string;

  @ApiPropertyOptional({ example: 'denton' })
  readonly locality?: string;

  @ApiPropertyOptional({ example: 'dallas' })
  readonly metro?: string;

  @ApiPropertyOptional({ example: 'texas' })
  readonly region?: string;

  @ApiPropertyOptional({ example: 'united states' })
  readonly country?: string;

  @ApiPropertyOptional({ example: 'north america' })
  readonly continent?: string;

  @ApiPropertyOptional({ type: GeoPointDto })
  readonly geo?: GeoPointDto;

  @ApiPropertyOptional()
  readonly streetAddress?: string;

  @ApiPropertyOptional()
  readonly postalCode?: string;

  @ApiPropertyOptional()
  readonly addressLine2?: string;

  @ApiPropertyOptional({ description: 'Partial ISO date.', example: '2020-10-01' })
  readonly lastUpdated?: string;
}

export class CompanyDto implements Company {
  @ApiPropertyOptional() readonly id?: string;
  @ApiPropertyOptional({ example: 'garver' }) readonly name?: string;
  @ApiPropertyOptional({ example: 'garverusa.com' }) readonly website?: string;
  @ApiPropertyOptional({ description: 'One of the eight size bands.', example: '501-1000' })
  readonly size?: string;
  @ApiPropertyOptional({ example: 1912 }) readonly founded?: number;
  @ApiPropertyOptional({ example: 'civil engineering' }) readonly industry?: string;
  @ApiPropertyOptional() readonly linkedinUrl?: string;
  @ApiPropertyOptional() readonly linkedinId?: number;
  @ApiPropertyOptional() readonly facebookUrl?: string;
  @ApiPropertyOptional() readonly twitterUrl?: string;
  @ApiPropertyOptional({ type: PlaceDto }) readonly location?: PlaceDto;
}

export class CurrentJobDto implements CurrentJob {
  @ApiPropertyOptional({ example: 'civil engineering' }) readonly industry?: string;
  @ApiPropertyOptional({ example: 'recruiting manager' }) readonly title?: string;
  @ApiPropertyOptional({ example: 'human resources' }) readonly role?: string;
  @ApiPropertyOptional() readonly subRole?: string;
  @ApiPropertyOptional({ type: [String], example: ['manager'] }) readonly levels?: string[];
  @ApiPropertyOptional() readonly summary?: string;
  @ApiPropertyOptional({ description: 'Partial ISO date.', example: '2019-10' })
  readonly startDate?: string;
  @ApiPropertyOptional({ description: 'Partial ISO date.' }) readonly lastUpdated?: string;
  @ApiPropertyOptional({ type: CompanyDto }) readonly company?: CompanyDto;
}

export class PersonDto implements Person {
  @ApiProperty({ example: 'joseph holland' }) readonly fullName!: string;
  @ApiPropertyOptional({ example: 'joseph' }) readonly firstName?: string;
  @ApiPropertyOptional({ example: 'holland' }) readonly lastName?: string;
  @ApiPropertyOptional() readonly middleName?: string;
  @ApiPropertyOptional() readonly middleInitial?: string;
  @ApiPropertyOptional({ enum: ['male', 'female'] }) readonly gender?: string;
  @ApiPropertyOptional({ description: 'Personal data: held but never indexed.' })
  readonly birthYear?: number;
  @ApiPropertyOptional({ description: 'Personal data: held but never indexed.' })
  readonly birthDate?: string;
}

export class ProfileIdentityDto implements ProfileIdentity {
  @ApiProperty({ description: 'The business key: the slug of the profile URL.', example: 'joeyholland' })
  readonly linkedinUsername!: string;

  @ApiProperty({ example: 'linkedin.com/in/joeyholland' })
  readonly linkedinUrl!: string;

  @ApiPropertyOptional() readonly linkedinId?: number;
}

export class SocialHandlesDto implements SocialHandles {
  @ApiPropertyOptional() readonly facebookUrl?: string;
  @ApiPropertyOptional() readonly facebookUsername?: string;
  @ApiPropertyOptional() readonly facebookId?: number;
  @ApiPropertyOptional() readonly twitterUrl?: string;
  @ApiPropertyOptional() readonly twitterUsername?: string;
  @ApiPropertyOptional() readonly githubUrl?: string;
  @ApiPropertyOptional() readonly githubUsername?: string;
}

export class MetricsDto implements Metrics {
  @ApiPropertyOptional({ example: 3761 }) readonly connections?: number;
  @ApiPropertyOptional({ description: 'One of the eleven bands.', example: '85,000-100,000' })
  readonly salaryBand?: string;
  @ApiPropertyOptional({ example: 12 }) readonly yearsExperience?: number;
}

export class ContactEmailDto {
  @ApiProperty({ example: 'j.holland@example.com' }) readonly address!: string;
  @ApiPropertyOptional({ example: 'personal' }) readonly type?: string;
}

/** Personal data. Returned only to a caller that presented a token, and never indexed. */
export class ContactDto implements Contact {
  @ApiPropertyOptional({ type: [ContactEmailDto] }) readonly emails?: ContactEmailDto[];
  @ApiPropertyOptional({ type: [String] }) readonly phones?: string[];
  @ApiPropertyOptional() readonly workEmail?: string;
  @ApiPropertyOptional({ type: [String] }) readonly mobilePhone?: string[];
}

/** What the import made of the row. */
export class DataQualityDto implements Omit<DataQuality, 'quarantined'> {
  @ApiProperty({ description: 'Fields that survived validation.', example: 59 })
  readonly fieldsPopulated!: number;

  @ApiProperty({ description: 'Supplied fields dropped for not matching their column.', example: 1 })
  readonly fieldsQuarantined!: number;

  @ApiProperty({ description: '0..1: populated as a share of what the row supplied.', example: 0.98 })
  readonly score!: number;

  @ApiProperty({ description: 'The row needed structural repair before it could be read.', example: false })
  readonly repaired!: boolean;

  @ApiProperty({ description: "The row's multi-value column block was detected as scrambled.", example: false })
  readonly drifted!: boolean;
}

export class CertificationEntryDto implements CertificationEntry {
  @ApiPropertyOptional({ example: 'sphr' }) readonly name?: string;
  @ApiPropertyOptional({ example: 'hrci' }) readonly organization?: string;
  @ApiPropertyOptional({ description: 'Partial ISO date.' }) readonly startDate?: string;
  @ApiPropertyOptional({ description: 'Partial ISO date.' }) readonly endDate?: string;
}

export class LanguageEntryDto implements LanguageEntry {
  @ApiPropertyOptional({ example: 'english' }) readonly name?: string;
  @ApiPropertyOptional({ description: 'The source gives either a level or a number.' })
  readonly proficiency?: number | string;
}

export class ProfileDetailDto implements ProfileDetail {
  @ApiProperty({ type: ProfileIdentityDto })
  readonly identity!: ProfileIdentityDto;

  @ApiProperty({ type: PersonDto })
  readonly person!: PersonDto;

  @ApiPropertyOptional({ type: CurrentJobDto })
  readonly job?: CurrentJobDto;

  @ApiPropertyOptional({ type: PlaceDto })
  readonly location?: PlaceDto;

  @ApiPropertyOptional({ type: SocialHandlesDto })
  readonly social?: SocialHandlesDto;

  @ApiPropertyOptional({ type: MetricsDto })
  readonly metrics?: MetricsDto;

  @ApiPropertyOptional({ description: "The person's own bio." })
  readonly summary?: string;

  @ApiPropertyOptional({ type: [String], example: ['leadership', 'b2b marketing'] })
  readonly skills?: string[];

  @ApiPropertyOptional({ type: [String], example: ['climate change', 'education'] })
  readonly interests?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Every place the source associated with them.' })
  readonly locationNames?: string[];

  @ApiPropertyOptional({ type: [String] })
  readonly regionNames?: string[];

  @ApiPropertyOptional({ type: [String] })
  readonly countryNames?: string[];

  @ApiPropertyOptional({
    ...SOURCE_SHAPED_ARRAY,
    description:
      'Past and current roles, in the source export\'s own shape: ' +
      '{ company: { name, size, industry }, title: { name, role, levels }, start_date, end_date, summary }.',
  })
  readonly experience?: ExperienceEntry[];

  @ApiPropertyOptional({
    ...SOURCE_SHAPED_ARRAY,
    description:
      "Schooling, in the source export's own shape: " +
      '{ school: { name, type }, degrees, majors, minors, gpa, start_date, end_date }.',
  })
  readonly education?: EducationEntry[];

  @ApiPropertyOptional({ type: [CertificationEntryDto] })
  readonly certifications?: CertificationEntryDto[];

  @ApiPropertyOptional({ type: [LanguageEntryDto] })
  readonly languages?: LanguageEntryDto[];

  @ApiPropertyOptional({ ...SOURCE_SHAPED_ARRAY, description: 'Other networks, as the source listed them.' })
  readonly socialProfiles?: Record<string, unknown>[];

  @ApiPropertyOptional({ ...SOURCE_SHAPED_ARRAY, description: 'Postal addresses, as the source listed them.' })
  readonly addresses?: Record<string, unknown>[];

  @ApiPropertyOptional({
    type: ContactDto,
    description: 'Personal data. Omitted entirely unless the request carries a valid bearer token.',
  })
  readonly contact?: ContactDto;

  @ApiPropertyOptional({ ...SOURCE_SHAPED_ARRAY, description: 'Provenance rows the export carried.' })
  readonly sourceVersion?: Record<string, unknown>[];

  @ApiProperty({
    description: 'sha256 of the normalised content. Two imports of the same person agree on it.',
    example: '9f2c1e6b4a...',
  })
  readonly contentHash!: string;

  @ApiProperty({ type: DataQualityDto })
  readonly quality!: DataQualityDto;
}
