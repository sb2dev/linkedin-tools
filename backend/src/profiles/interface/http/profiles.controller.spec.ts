/** The one endpoint that can serve personal data. */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Contact, Profile, QuarantinedField } from '../../domain/profile';
import { ProfileDetail } from '../../domain/profile-detail';
import { PROFILE_REPOSITORY } from '../../domain/ports/profile-repository.port';
import { GetProfileUseCase } from '../../application/get-profile.use-case';
import { asProblem, createHttpApp } from 'src/test/http/app';
import { authWiring, bearerToken, expiredToken } from 'src/test/http/auth';
import { FakeProfileRepository, aProfile } from 'src/test/fakes';
import { ProfilesController } from './profiles.controller';

const EMAIL = 'ada.lovelace@analytical.example';
const PHONE = '+44 20 7946 0958';

const contact: Contact = {
  emails: [{ address: EMAIL, type: 'personal' }],
  phones: [PHONE],
  workEmail: 'ada@analytical.example',
  mobilePhone: ['+44 7700 900123'],
};

/** The wire shape drops the per-field list; the counts on either side of it stay. */
function qualityWithoutList(quality: Profile['quality']): ProfileDetail['quality'] {
  const { quarantined: _list, ...rest } = quality;
  return rest;
}

const quarantined: QuarantinedField = {
  column: 'twitter_username',
  target: 'social.twitterUsername',
  reason: 'looks like a phone number or an email address',
  rawExcerpt: '+44 7700 900123',
};

const stored: Profile = aProfile('ada-lovelace', {
  person: { fullName: 'ada lovelace' },
  contact,
  quality: {
    fieldsPopulated: 40,
    fieldsQuarantined: 1,
    score: 0.97,
    quarantined: [quarantined],
    repaired: false,
    drifted: false,
  },
});

describe('GET /api/profiles/:username', () => {
  let app: INestApplication;
  let profiles: FakeProfileRepository;

  beforeEach(async () => {
    profiles = new FakeProfileRepository([stored]);

    const wiring = authWiring();
    app = await createHttpApp({
      imports: wiring.imports,
      controllers: [ProfilesController],
      providers: [
        ...wiring.providers,
        GetProfileUseCase,
        { provide: PROFILE_REPOSITORY, useValue: profiles },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string, token?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  };

  describe('without a token', () => {
    it('answers the public profile with no contact object at all', async () => {
      const response = await get('/api/profiles/ada-lovelace');

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contact');
      expect(response.body).toMatchObject({
        identity: { linkedinUsername: 'ada-lovelace' },
        person: { fullName: 'ada lovelace' },
      });
    });

    it('lets no email address or phone number reach the wire by any route', async () => {
      const body = JSON.stringify((await get('/api/profiles/ada-lovelace')).body);

      expect(body).not.toContain(EMAIL);
      expect(body).not.toContain(PHONE);
      expect(body).not.toContain('@analytical.example');
      // The quarantined excerpt is a phone number too: it is the value the row misfiled.
      expect(body).not.toContain(quarantined.rawExcerpt);
    });

    it('reports how many fields were quarantined without publishing which, or their values', async () => {
      const anonymous = await get('/api/profiles/ada-lovelace');
      const authenticated = await get('/api/profiles/ada-lovelace', await bearerToken(app));

      // The counts survive exactly, and nothing says which fields they counted.
      for (const response of [anonymous, authenticated]) {
        expect((response.body as ProfileDetail).quality).toEqual(qualityWithoutList(stored.quality));
      }
      // The contact block is a separate gate: it reaches only the caller that presented a token.
      expect(JSON.stringify(anonymous.body)).not.toContain('+44 7700 900123');
    });

    it.each([
      ['a malformed token', 'not-a-jwt'],
      ['a token signed elsewhere', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.forged'],
    ])('answers 200 with contact masked when the caller presents %s', async (_label, token) => {
      const response = await get('/api/profiles/ada-lovelace', token);

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contact');
    });

    it('treats an expired token as no token, rather than as the caller it once named', async () => {
      const response = await get('/api/profiles/ada-lovelace', await expiredToken(app));

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contact');
    });
  });

  describe('with a token', () => {
    it('includes the contact object the corpus holds', async () => {
      const response = await get('/api/profiles/ada-lovelace', await bearerToken(app));

      expect(response.status).toBe(200);
      expect((response.body as ProfileDetail).contact).toEqual(contact);
    });

    it('omits contact rather than inventing one when the record has none', async () => {
      await profiles.upsertAll([aProfile('alan-turing')]);

      const response = await get('/api/profiles/alan-turing', await bearerToken(app));

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contact');
    });
  });

  describe('finding the profile', () => {
    it('is served from the record, so the answer carries what the index does not hold', async () => {
      const anonymous = await get('/api/profiles/ada-lovelace');
      const operator = await get('/api/profiles/ada-lovelace', await bearerToken(app));

      expect(anonymous.status).toBe(200);
      expect(anonymous.body).not.toHaveProperty('contact');
      expect((operator.body as ProfileDetail).contact).toEqual(contact);
    });

    it.each([
      ['upper case', '/api/profiles/ADA-LOVELACE'],
      ['surrounding spaces', '/api/profiles/%20ada-lovelace%20'],
    ])('normalises a username written with %s', async (_label, path) => {
      const response = await get(path);

      expect(response.status).toBe(200);
      expect((response.body as ProfileDetail).identity.linkedinUsername).toBe('ada-lovelace');
    });

    it('answers 404 as a problem document for a username nobody has', async () => {
      const response = await get('/api/profiles/grace-hopper');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(asProblem(response.body).detail).toContain('grace-hopper');
    });

    it('answers a malformed percent escape with a problem document, not a page of HTML', async () => {
      const response = await get('/api/profiles/%E0%A4%A');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it.each([
      ['too short to be a slug', '/api/profiles/ab'],
      ['carrying characters a slug never has', '/api/profiles/ada%20lovelace!'],
      ['far longer than any slug', `/api/profiles/${'a'.repeat(121)}`],
    ])('rejects a username %s with a 400, not a 404', async (_label, path) => {
      const response = await get(path);

      expect(response.status).toBe(400);
      expect(asProblem(response.body).errors?.username).toEqual([
        'username is not a LinkedIn profile slug',
      ]);
    });
  });
});

describe('a store that is down', () => {
  it('answers 500 rather than reporting the person as missing', async () => {
    const repository = new FakeProfileRepository([]);
    repository.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:5433');
    const wiring = authWiring();
    const app = await createHttpApp({
      imports: wiring.imports,
      controllers: [ProfilesController],
      providers: [
        ...wiring.providers,
        GetProfileUseCase,
        { provide: PROFILE_REPOSITORY, useValue: repository },
      ],
    });

    try {
      const response = await request(app.getHttpServer()).get('/api/profiles/ada-lovelace');

      expect(response.status).toBe(500);
      expect(asProblem(response.body).detail).toBe('An unexpected error occurred');
    } finally {
      await app.close();
    }
  });
});
