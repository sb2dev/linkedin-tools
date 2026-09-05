/** Transport-free failures of the import use cases; ImportsController maps them to status codes. */

export class ImportNotFoundError extends Error {
  constructor(readonly importId: string) {
    super(`no import session ${importId}`);
    this.name = 'ImportNotFoundError';
  }
}

export class ImportAlreadyCommittedError extends Error {
  constructor(readonly importId: string) {
    super(`import ${importId} has already been committed`);
    this.name = 'ImportAlreadyCommittedError';
  }
}

export class PreviewExpiredError extends Error {
  constructor(readonly importId: string) {
    super(`the preview of import ${importId} has expired; upload it again`);
    this.name = 'PreviewExpiredError';
  }
}

/** The session is still on record but its bytes were released after the commit. */
export class ImportPayloadReleasedError extends Error {
  constructor(readonly importId: string) {
    super(`the uploaded file of import ${importId} is no longer stored, so its source lines cannot be read`);
    this.name = 'ImportPayloadReleasedError';
  }
}

/** No record of the upload starts on that line. Quoted fields span lines, so many numbers do not. */
export class SourceLineNotFoundError extends Error {
  constructor(
    readonly importId: string,
    readonly lineNumber: number,
  ) {
    super(`import ${importId} has no row on line ${lineNumber}`);
    this.name = 'SourceLineNotFoundError';
  }
}

export class NotAProfileExportError extends Error {
  constructor() {
    super('this file is not a LinkedIn profile export: no full_name and linkedin_url columns');
    this.name = 'NotAProfileExportError';
  }
}

/** The purge was asked for without the phrase that names what it destroys. */
export class PurgeNotConfirmedError extends Error {
  constructor(readonly expected: string) {
    super(`this deletes every profile in the corpus; send { "confirm": "${expected}" } to proceed`);
    this.name = 'PurgeNotConfirmedError';
  }
}
