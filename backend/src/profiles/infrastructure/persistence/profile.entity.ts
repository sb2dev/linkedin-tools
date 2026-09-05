/** One row per person. */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import {
  CertificationEntry,
  Contact,
  DataQuality,
  EducationEntry,
  ExperienceEntry,
  GeoPoint,
  LanguageEntry,
  Place,
  Profile,
} from '../../domain/profile';

/** node-postgres returns int8 as a string to protect precision; LinkedIn ids fit a JS number. */
const bigintAsNumber: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

@Entity('profiles')
@Index('profiles_username_uq', ['linkedinUsername'], { unique: true })
@Index('profiles_content_hash_idx', ['contentHash'])
export class ProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'linkedin_username', type: 'varchar', length: 255 })
  linkedinUsername!: string;

  @Column({ name: 'linkedin_url', type: 'text' })
  linkedinUrl!: string;

  @Column({ name: 'linkedin_id', type: 'bigint', nullable: true, transformer: bigintAsNumber })
  linkedinId!: number | null;

  @Column({ name: 'full_name', type: 'text' })
  fullName!: string;

  @Column({ name: 'first_name', type: 'text', nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'text', nullable: true })
  lastName!: string | null;

  @Column({ name: 'middle_name', type: 'text', nullable: true })
  middleName!: string | null;

  @Column({ name: 'middle_initial', type: 'text', nullable: true })
  middleInitial!: string | null;

  @Column({ type: 'text', nullable: true })
  gender!: string | null;

  @Column({ name: 'birth_year', type: 'integer', nullable: true })
  birthYear!: number | null;

  @Column({ name: 'birth_date', type: 'text', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'job_title', type: 'text', nullable: true })
  jobTitle!: string | null;

  @Column({ name: 'job_role', type: 'text', nullable: true })
  jobRole!: string | null;

  @Column({ name: 'job_sub_role', type: 'text', nullable: true })
  jobSubRole!: string | null;

  @Column({ name: 'job_industry', type: 'text', nullable: true })
  jobIndustry!: string | null;

  @Column({ name: 'job_levels', type: 'text', array: true, default: () => "'{}'" })
  jobLevels!: string[];

  @Column({ name: 'job_summary', type: 'text', nullable: true })
  jobSummary!: string | null;

  @Column({ name: 'job_start_date', type: 'text', nullable: true })
  jobStartDate!: string | null;

  @Column({ name: 'job_last_updated', type: 'text', nullable: true })
  jobLastUpdated!: string | null;

  @Column({ name: 'company_id', type: 'text', nullable: true })
  companyId!: string | null;

  @Column({ name: 'company_name', type: 'text', nullable: true })
  companyName!: string | null;

  @Column({ name: 'company_website', type: 'text', nullable: true })
  companyWebsite!: string | null;

  @Column({ name: 'company_size', type: 'text', nullable: true })
  companySize!: string | null;

  @Column({ name: 'company_industry', type: 'text', nullable: true })
  companyIndustry!: string | null;

  @Column({ name: 'company_founded', type: 'integer', nullable: true })
  companyFounded!: number | null;

  @Column({ name: 'company_linkedin_url', type: 'text', nullable: true })
  companyLinkedinUrl!: string | null;

  @Column({ name: 'company_linkedin_id', type: 'bigint', nullable: true, transformer: bigintAsNumber })
  companyLinkedinId!: number | null;

  @Column({ name: 'company_facebook_url', type: 'text', nullable: true })
  companyFacebookUrl!: string | null;

  @Column({ name: 'company_twitter_url', type: 'text', nullable: true })
  companyTwitterUrl!: string | null;

  @Column({ name: 'company_location', type: 'jsonb', nullable: true })
  companyLocation!: Place | null;

  @Column({ name: 'location_name', type: 'text', nullable: true })
  locationName!: string | null;

  @Column({ type: 'text', nullable: true })
  locality!: string | null;

  @Column({ type: 'text', nullable: true })
  metro!: string | null;

  @Column({ type: 'text', nullable: true })
  region!: string | null;

  @Column({ type: 'text', nullable: true })
  country!: string | null;

  @Column({ type: 'text', nullable: true })
  continent!: string | null;

  @Column({ name: 'street_address', type: 'text', nullable: true })
  streetAddress!: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode!: string | null;

  @Column({ name: 'address_line2', type: 'text', nullable: true })
  addressLine2!: string | null;

  @Column({ name: 'location_last_updated', type: 'text', nullable: true })
  locationLastUpdated!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  geo!: GeoPoint | null;

  @Column({ name: 'facebook_url', type: 'text', nullable: true })
  facebookUrl!: string | null;

  @Column({ name: 'facebook_username', type: 'text', nullable: true })
  facebookUsername!: string | null;

  @Column({ name: 'facebook_id', type: 'bigint', nullable: true, transformer: bigintAsNumber })
  facebookId!: number | null;

  @Column({ name: 'twitter_url', type: 'text', nullable: true })
  twitterUrl!: string | null;

  @Column({ name: 'twitter_username', type: 'text', nullable: true })
  twitterUsername!: string | null;

  @Column({ name: 'github_url', type: 'text', nullable: true })
  githubUrl!: string | null;

  @Column({ name: 'github_username', type: 'text', nullable: true })
  githubUsername!: string | null;

  @Column({ type: 'integer', nullable: true })
  connections!: number | null;

  @Column({ name: 'salary_band', type: 'text', nullable: true })
  salaryBand!: string | null;

  @Column({ name: 'years_experience', type: 'real', nullable: true })
  yearsExperience!: number | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skills!: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  interests!: string[];

  @Column({ name: 'location_names', type: 'text', array: true, default: () => "'{}'" })
  locationNames!: string[];

  @Column({ name: 'region_names', type: 'text', array: true, default: () => "'{}'" })
  regionNames!: string[];

  @Column({ name: 'country_names', type: 'text', array: true, default: () => "'{}'" })
  countryNames!: string[];

  @Column({ type: 'jsonb', nullable: true })
  experience!: ExperienceEntry[] | null;

  @Column({ type: 'jsonb', nullable: true })
  education!: EducationEntry[] | null;

  @Column({ type: 'jsonb', nullable: true })
  certifications!: CertificationEntry[] | null;

  @Column({ type: 'jsonb', nullable: true })
  languages!: LanguageEntry[] | null;

  @Column({ name: 'social_profiles', type: 'jsonb', nullable: true })
  socialProfiles!: Record<string, unknown>[] | null;

  @Column({ type: 'jsonb', nullable: true })
  addresses!: Record<string, unknown>[] | null;

  /** Personal data, never sent to Elasticsearch. */
  @Column({ type: 'jsonb', nullable: true })
  contact!: Contact | null;

  @Column({ name: 'source_version', type: 'jsonb', nullable: true })
  sourceVersion!: Record<string, unknown>[] | null;

  @Column({ type: 'jsonb' })
  quality!: DataQuality;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  /** Authoritative: the aggregate is read back from this column alone. */
  @Column({ type: 'jsonb' })
  raw!: Profile;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
