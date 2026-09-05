/** Hand-written mirror of the backend API contract. Update it when the API changes. */

// Search schema

export type FilterKind = 'terms' | 'ordered_terms' | 'range' | 'date_range' | 'exists';

export interface SearchField {
  key: string;
  label: string;
  group: string;
  kind: FilterKind;
  facetable: boolean;
  typeahead?: boolean;
  options?: string[];
  primary?: boolean;
  hint?: string;
}

export type SortKey = 'relevance' | 'name' | 'connections' | 'experience' | 'quality';

export interface SortOption {
  key: SortKey;
  label: string;
}

export interface SearchSchema {
  fields: SearchField[];
  sorts: SortOption[];
  groups: string[];
}

// Search request

export type FilterValue =
  | { type: 'terms'; values: string[] }
  | { type: 'range'; min?: number; max?: number }
  | { type: 'date_range'; from?: string; to?: string }
  | { type: 'exists'; present: boolean };

export type FilterState = Record<string, FilterValue>;

/** The complete search state. It lives in the URL query string; see lib/query-state.ts. */
export interface SearchQuery {
  q: string;
  sort: SortKey;
  page: number;
  size: number;
  facets: string[];
  filters: FilterState;
}

// Search response

export interface FacetBucket {
  value: string;
  count: number;
}

export interface Facet {
  key: string;
  buckets: FacetBucket[];
  otherCount: number;
}

export interface ProfileSummary {
  linkedinUsername: string;
  fullName: string;
  jobTitle?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  yearsExperience?: number;
  skills: string[];
  totalSkills: number;
  qualityScore: number;
  repaired: boolean;
  /** Elasticsearch highlight fragments, keyed by field, wrapping matches in <em> tags. */
  highlights?: Record<string, string[]>;
  score?: number;
}

export interface SearchResult {
  items: ProfileSummary[];
  total: number;
  page: number;
  size: number;
  facets: Facet[];
  tookMs: number;
}

export interface SuggestResponse {
  values: string[];
}

// Profile detail

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Place {
  name?: string;
  locality?: string;
  metro?: string;
  region?: string;
  country?: string;
  continent?: string;
  geo?: GeoPoint;
  streetAddress?: string;
  postalCode?: string;
  addressLine2?: string;
  lastUpdated?: string;
}

export interface CompanyRef {
  id?: string;
  name?: string;
  website?: string;
  size?: string;
  founded?: number;
  industry?: string;
  linkedinUrl?: string;
  linkedinId?: number;
  facebookUrl?: string;
  twitterUrl?: string;
  location?: Place;
}

export interface JobInfo {
  industry?: string;
  title?: string;
  role?: string;
  subRole?: string;
  levels?: string[];
  summary?: string;
  startDate?: string;
  lastUpdated?: string;
  company?: CompanyRef;
}

export interface PersonInfo {
  fullName: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  middleInitial?: string;
  gender?: string;
  birthYear?: number;
  birthDate?: string;
}

export interface SocialInfo {
  facebookUrl?: string;
  facebookUsername?: string;
  facebookId?: number;
  twitterUrl?: string;
  twitterUsername?: string;
  githubUrl?: string;
  githubUsername?: string;
}

export interface ProfileMetrics {
  connections?: number;
  salaryBand?: string;
  yearsExperience?: number;
}

export interface EmailAddress {
  address: string;
  type?: string;
}

export interface QualityInfo {
  fieldsPopulated: number;
  fieldsQuarantined: number;
  score: number;
  repaired: boolean;
  /** The row's multi-value block was scrambled, so some columns could not be trusted. */
  drifted: boolean;
}

/** Personal data. Present only for a caller that presented a token, and never indexed. */
export interface ContactInfo {
  emails?: { address: string; type?: string }[];
  phones?: string[];
  workEmail?: string;
  mobilePhone?: string[];
}

/** Experience, education, certification and language entries keep the source export's own keys. */
export type SourceEntry = Record<string, unknown>;

export interface ProfileDetail {
  identity: {
    linkedinUsername: string;
    linkedinUrl: string;
    linkedinId?: number;
  };
  person: PersonInfo;
  job?: JobInfo;
  location?: Place;
  social?: SocialInfo;
  metrics?: ProfileMetrics;
  summary?: string;
  skills?: string[];
  interests?: string[];
  locationNames?: string[];
  regionNames?: string[];
  countryNames?: string[];
  experience?: SourceEntry[];
  education?: SourceEntry[];
  certifications?: SourceEntry[];
  languages?: SourceEntry[];
  socialProfiles?: SourceEntry[];
  addresses?: SourceEntry[];
  contact?: ContactInfo;
  sourceVersion?: SourceEntry[];
  contentHash: string;
  quality: QualityInfo;
}

// Imports

export type ImportStatus = 'previewed' | 'committed' | 'expired';

export interface ImportCounts {
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  /** Accepted rows describing a person another accepted row already described. */
  duplicatesCollapsed: number;
  profilesNew: number;
  profilesUpdated: number;
  profilesUnchanged: number;
  scrambledRows: number;
  /** Rows that parsed only after a source-dump prefix was stripped. Not the realignable rows. */
  repairableRows: number;
  realignedRows: number;
  fieldsQuarantined: number;
}

/** The same file under repair. It omits the counts realignment cannot move, such as the rejections. */
export interface RepairCounts {
  profilesNew: number;
  profilesUpdated: number;
  profilesUnchanged: number;
  rowsAccepted: number;
  scrambledRows: number;
  realignedRows: number;
  fieldsQuarantined: number;
}

export interface RejectionSample {
  lineNumber: number;
  excerpt: string;
}

export interface RejectionGroup {
  reason: string;
  label: string;
  count: number;
  samples: RejectionSample[];
}

/** A before/after example of the realignment, for the repair toggle to argue its case with. */
export interface RealignmentSample {
  linkedinUsername: string;
  fullName: string;
  offset: number;
  before: Record<string, string>;
  after: Record<string, string>;
}

/** What committing a row would do. */
export type ImportRowStatus = 'new' | 'updated' | 'unchanged' | 'duplicate' | 'rejected';

/** What one repair policy would do with one row. */
export interface ImportRowOutcome {
  status: ImportRowStatus;
  /** The multi-value block is still shifted out of alignment under this policy. */
  scrambled: boolean;
  realigned: boolean;
  /** How far the block was moved, when it was. */
  offset?: number;
  totalSkills: number;
  /** 0..1: populated fields as a share of the fields the row supplied. */
  qualityScore: number;
  /** Other rows for this person that collapsed into this one. */
  duplicateRows: number;
  /** The line whose profile was kept instead of this one's. */
  supersededByLine?: number;
}

export interface RowRejection {
  reason: string;
  label: string;
  excerpt: string;
}

/** One source line of the upload. */
export interface ImportRowReport {
  /** 1-based line number in the uploaded file. */
  lineNumber: number;
  linkedinUsername?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  location?: string;
  outcome: ImportRowOutcome;
  /** The same row with repair on; absent when the repair changes nothing for it. */
  withRepair?: ImportRowOutcome;
  rejection?: RowRejection;
}

/** What the validator did with one cell. */
export type ColumnVerdict = 'kept' | 'quarantined' | 'empty' | 'unmapped' | 'unread';

/** One cell of a source line, with what the validator did to it. */
export interface SourceColumn {
  /** 0-based position in the source header; a shift shows as a diagonal down this column. */
  index: number;
  /** Absent past the last column the header declares. */
  column?: string;
  /** The cell as the file held it, whitespace collapsed and truncated by the API. */
  value: string;
  /** Dot-path of the canonical field the column feeds. Absent for a column the catalog omits. */
  target?: string;
  verdict: ColumnVerdict;
  /** Why the cell was quarantined. */
  reason?: string;
}

/** One column realignment would rewrite, and what it would put there. */
export interface SourceRepairMove {
  column: string;
  from: string;
  to: string;
}

export interface SourceRepair {
  /** Columns the block is shifted by; negative means the true value sits that many places earlier. */
  offset: number;
  /** Populated block columns that validated at this offset, which is what proved it. */
  evidence: number;
  moves: SourceRepairMove[];
}

/** Why the line never became a person. `detail` is this line's own account, not the reason's. */
export interface SourceRejection {
  reason: string;
  label: string;
  detail: string;
}

export interface SourceIdentity {
  linkedinUsername: string;
  linkedinUrl: string;
  fullName: string;
}

/** One line of the upload, as the file wrote it and as the importer read it. */
export interface SourceRow {
  /** 1-based line number in the uploaded file. */
  lineNumber: number;
  /** The record verbatim, quoting and spanned lines included. */
  raw: string;
  /** The file's line is longer than the `raw` above. */
  rawTruncated: boolean;
  /** Fields the line parsed into. */
  fieldCount: number;
  /** Columns the header declares; a row that misses this is a shifted or damaged one. */
  expectedFieldCount: number;
  /** A source-dump path prefix was dropped before the record could be read. */
  recovered: boolean;
  /** The cells that prefix occupied, in file order; empty unless `recovered`. */
  droppedFields: string[];
  accepted: boolean;
  /** The multi-value block is shifted out of alignment, as the row stands. */
  scrambled: boolean;
  /** Absent on a rejected line, which names nobody. */
  identity?: SourceIdentity;
  rejection?: SourceRejection;
  /** Every header column in header order, plus any field beyond the header's end. */
  columns: SourceColumn[];
  /** What realignment would move; absent unless an offset was proven and survived. */
  repair?: SourceRepair;
}

/** The file behind one row of the preview. */
export interface ImportRowSource {
  importId: string;
  filename: string;
  line: SourceRow;
}

export interface ImportPreview {
  importId: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  status: ImportStatus;
  counts: ImportCounts;
  countsWithRepair: RepairCounts;
  rejections: RejectionGroup[];
  /** Every source line in file order, up to the API's cap. */
  rows: ImportRowReport[];
  /** Rows past that cap: counted everywhere, listed nowhere. */
  rowsOmitted: number;
  repairSample: RealignmentSample[];
}

export interface ImportCommitResult {
  importId: string;
  committed: {
    profilesInserted: number;
    profilesUpdated: number;
    indexed: number;
    indexFailures: string[];
  };
}

// Auth

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  username: string;
}

// Errors

/** RFC 7807 problem document, the error shape for every endpoint. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

/** Every failed request rejects with this, including transport failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail && problem.detail.length > 0 ? problem.detail : problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
  }

  get title(): string {
    return this.problem.title;
  }

  get fieldErrors(): Record<string, string[]> {
    return this.problem.errors ?? {};
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** A transport failure never reached the API, so retrying is worth offering. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}
