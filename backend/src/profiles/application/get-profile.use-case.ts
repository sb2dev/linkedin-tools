/** Reads one profile by its LinkedIn username. */

import { Inject, Injectable } from '@nestjs/common';
import { compact } from 'src/shared/objects';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from '../domain/ports/profile-repository.port';
import { Profile } from '../domain/profile';
import { ProfileDetail } from '../domain/profile-detail';

export class ProfileNotFoundError extends Error {
  constructor(readonly username: string) {
    super(`No profile with the LinkedIn username "${username}"`);
    this.name = 'ProfileNotFoundError';
  }
}

export interface GetProfileOptions {
  /** True only for a caller that presented a valid token; otherwise contact is not published. */
  readonly includeContact: boolean;
}

/**
 * Served from PostgreSQL, the system of record, because this endpoint publishes the whole
 * aggregate. The search index deliberately holds a projection - no contact block, no source-shaped
 * histories, no provenance - so answering from it would quietly return a narrower profile than
 * ProfileDetailDto documents. Elasticsearch answers search, filters, facets and suggestions.
 */
@Injectable()
export class GetProfileUseCase {
  constructor(@Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort) {}

  async execute(username: string, options: GetProfileOptions): Promise<ProfileDetail> {
    const key = username.trim().toLowerCase();

    const stored = await this.repository.findByUsername(key);
    if (!stored) throw new ProfileNotFoundError(key);

    const published = onTheWire(stored);
    return options.includeContact ? published : forAnonymous(published);
  }
}

/** The stored aggregate as the API publishes it: the quarantined cell values stay internal. */
function onTheWire(profile: Profile): ProfileDetail {
  const { quarantined: _list, ...quality } = profile.quality;
  // compact, so a key the record left undefined is absent rather than present-and-empty. A client
  // renders `contact: undefined` as "this person has no contact details", which is a different claim.
  return compact({ ...profile, quality });
}

/** Everything an anonymous caller may see: the published profile without the contact block. */
function forAnonymous({ contact: _contact, ...rest }: ProfileDetail): ProfileDetail {
  return rest;
}
