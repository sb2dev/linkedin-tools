import { toProfileDocument } from '../domain/search/profile-document';
import { ProfileDetail } from '../domain/profile-detail';
import { GetProfileUseCase, ProfileNotFoundError } from './get-profile.use-case';
import {
  DAMAGED_PERSONAL_VALUES,
  FakeProfileRepository,
  PERSONAL_VALUES,
  damagedProfile,
  realProfile,
} from 'src/test/fakes';

function useCase(stored = [realProfile()]) {
  const repository = new FakeProfileRepository(stored);
  return { repository, subject: new GetProfileUseCase(repository) };
}

function serialised(detail: ProfileDetail): string {
  return JSON.stringify(detail);
}

/**
 * The endpoint publishes the whole aggregate, so it is served from the system of record. The index
 * holds a deliberately narrower projection, and answering from it used to drop these fields
 * silently - taking the profile page's social links and company website down with them.
 */
describe('the fields the search index does not hold', () => {
  it('are published all the same, because the read goes to the record', async () => {
    const stored = realProfile();
    const { subject } = useCase([stored]);

    const detail = await subject.execute('joeyholland', { includeContact: false });

    expect(detail.social?.facebookUrl).toBe(stored.social?.facebookUrl);
    expect(detail.identity.linkedinId).toBe(stored.identity.linkedinId);
    expect(detail.locationNames).toEqual(stored.locationNames);
    expect(detail.socialProfiles).toEqual(stored.socialProfiles);
  });

  it('really are absent from the projection, so the test above is not vacuous', () => {
    const document = toProfileDocument(realProfile());

    expect(document).not.toHaveProperty('facebookUrl');
    expect(document).not.toHaveProperty('linkedinId');
    expect(document).not.toHaveProperty('locationNames');
    expect(document).not.toHaveProperty('socialProfiles');
  });
});

describe('contact details', () => {
  it('reach a caller that presented a token', async () => {
    const { subject } = useCase();

    const detail = await subject.execute('joeyholland', { includeContact: true });

    expect(detail.contact?.emails?.map((email) => email.address)).toContain('j3holland@yahoo.com');
    expect(detail.contact?.phones).toContain('+19402058928');
    expect(detail.contact?.workEmail).toBe('jjholland@garverusa.com');
  });

  it('are absent for an anonymous caller, key and all', async () => {
    const { subject } = useCase();

    const detail = await subject.execute('joeyholland', { includeContact: false });

    // Not `contact: null`, which a client would render as "this person has no contact details".
    expect('contact' in detail).toBe(false);
  });

  it('leave no email address or phone number anywhere in an anonymous answer', async () => {
    const { subject } = useCase();

    const body = serialised(await subject.execute('joeyholland', { includeContact: false }));

    for (const personal of PERSONAL_VALUES) expect(body).not.toContain(personal);
  });

  it('are not invented as an empty object for a record that holds none', async () => {
    const { subject } = useCase([{ ...realProfile(), contact: undefined }]);

    const detail = await subject.execute('joeyholland', { includeContact: true });

    expect('contact' in detail).toBe(false);
  });
});

describe('lookup', () => {
  it('normalises the username, so a link that kept its capitals still resolves', async () => {
    const { repository, subject } = useCase();

    const detail = await subject.execute('  JoeyHolland  ', { includeContact: false });

    expect(detail.identity.linkedinUsername).toBe('joeyholland');
    expect(repository.lookups).toEqual(['joeyholland']);
  });

  it('costs exactly one query, whoever is asking', async () => {
    const { repository, subject } = useCase();

    await subject.execute('joeyholland', { includeContact: true });

    expect(repository.lookups).toHaveLength(1);
  });

  it('refuses an unknown username with a domain error naming it, not a store error', async () => {
    const { subject } = useCase([]);

    const error = await subject
      .execute('nobody-here', { includeContact: true })
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ProfileNotFoundError);
    expect((error as ProfileNotFoundError).username).toBe('nobody-here');
  });
});

/** The counts are public, because they tell a sparse profile from a misparsed one. The list is not. */
describe('the quarantine audit trail on a row the scrambling damaged', () => {
  function damaged() {
    const stored = damagedProfile();
    return { key: stored.identity.linkedinUsername, subject: useCase([stored]).subject };
  }

  it('gives an anonymous caller no phone number through the audit trail', async () => {
    const { key, subject } = damaged();

    const body = serialised(await subject.execute(key, { includeContact: false }));

    for (const personal of DAMAGED_PERSONAL_VALUES) expect(body).not.toContain(personal);
  });

  it('publishes the counts but not the list, so a misfiled phone number is not handed back', async () => {
    const { key, subject } = damaged();

    const detail = await subject.execute(key, { includeContact: true });

    expect(detail.quality.fieldsQuarantined).toBeGreaterThan(0);
    // The entries themselves stay in PostgreSQL:
    expect(JSON.stringify(detail)).not.toContain('+18016738180');
  });
});
