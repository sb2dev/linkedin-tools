/** The canonical profile shape, free of framework types. */

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface Place {
  readonly name?: string;
  readonly locality?: string;
  readonly metro?: string;
  readonly region?: string;
  readonly country?: string;
  readonly continent?: string;
  readonly geo?: GeoPoint;
  readonly streetAddress?: string;
  readonly postalCode?: string;
  readonly addressLine2?: string;
  readonly lastUpdated?: string;
}

export interface Company {
  readonly id?: string;
  readonly name?: string;
  readonly website?: string;
  readonly size?: string;
  readonly founded?: number;
  readonly industry?: string;
  readonly linkedinUrl?: string;
  readonly linkedinId?: number;
  readonly facebookUrl?: string;
  readonly twitterUrl?: string;
  readonly location?: Place;
}

export interface CurrentJob {
  readonly industry?: string;
  readonly title?: string;
  readonly role?: string;
  readonly subRole?: string;
  readonly levels?: string[];
  readonly summary?: string;
  readonly startDate?: string;
  readonly lastUpdated?: string;
  readonly company?: Company;
}

export interface Person {
  readonly fullName: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly middleName?: string;
  readonly middleInitial?: string;
  readonly gender?: string;
  readonly birthYear?: number;
  readonly birthDate?: string;
}

export interface ProfileIdentity {
  /** The business key: the slug of the person's linkedin.com/in/ URL. */
  readonly linkedinUsername: string;
  readonly linkedinUrl: string;
  readonly linkedinId?: number;
}

export interface SocialHandles {
  readonly facebookUrl?: string;
  readonly facebookUsername?: string;
  readonly facebookId?: number;
  readonly twitterUrl?: string;
  readonly twitterUsername?: string;
  readonly githubUrl?: string;
  readonly githubUsername?: string;
}

export interface Metrics {
  readonly connections?: number;
  readonly salaryBand?: string;
  readonly yearsExperience?: number;
}

/** Personal data. Persisted in PostgreSQL, never projected into the search index. */
export interface Contact {
  readonly emails?: { address: string; type?: string }[];
  readonly phones?: string[];
  readonly workEmail?: string;
  readonly mobilePhone?: string[];
}

export interface QuarantinedField {
  readonly column: string;
  /** Canonical field the value would have populated. */
  readonly target: string;
  readonly reason: string;
  /** First 80 characters of the offending value. */
  readonly rawExcerpt?: string;
}

export interface DataQuality {
  readonly fieldsPopulated: number;
  readonly fieldsQuarantined: number;
  /** 0..1: populated fields as a share of the fields the row actually supplied. */
  readonly score: number;
  readonly quarantined: readonly QuarantinedField[];
  /** True when the row needed structural repair before it could be read. */
  readonly repaired: boolean;
  /** True when this row's multi-value column block was detected as scrambled. */
  readonly drifted: boolean;
}

export interface Profile {
  readonly identity: ProfileIdentity;
  readonly person: Person;
  readonly job?: CurrentJob;
  readonly location?: Place;
  readonly social?: SocialHandles;
  readonly metrics?: Metrics;
  readonly summary?: string;
  readonly skills?: string[];
  readonly interests?: string[];
  readonly locationNames?: string[];
  readonly regionNames?: string[];
  readonly countryNames?: string[];
  readonly experience?: ExperienceEntry[];
  readonly education?: EducationEntry[];
  readonly certifications?: CertificationEntry[];
  readonly languages?: LanguageEntry[];
  readonly socialProfiles?: Record<string, unknown>[];
  readonly addresses?: Record<string, unknown>[];
  readonly contact?: Contact;
  readonly sourceVersion?: Record<string, unknown>[];
  /** sha256 of the normalised content, excluding quality metadata. Drives new/updated/unchanged. */
  readonly contentHash: string;
  readonly quality: DataQuality;
}

/** Stored as the export wrote them, so the runtime keys are snake_case (`start_date`, `is_primary`). */
export interface ExperienceEntry {
  readonly title?: { name?: string; role?: string; subRole?: string; levels?: string[] };
  readonly company?: { name?: string; size?: string; industry?: string; founded?: string; location?: Place };
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isPrimary?: boolean;
  readonly summary?: string;
}

export interface EducationEntry {
  readonly school?: { name?: string; type?: string; location?: Place };
  readonly degrees?: string[];
  readonly majors?: string[];
  readonly minors?: string[];
  readonly gpa?: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly summary?: string;
}

export interface CertificationEntry {
  readonly name?: string;
  readonly organization?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface LanguageEntry {
  readonly name?: string;
  readonly proficiency?: number | string;
}
