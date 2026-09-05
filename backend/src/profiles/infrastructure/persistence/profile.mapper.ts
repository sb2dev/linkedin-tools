/** Asymmetric by design: the row keeps the whole aggregate, the columns only what is queried. */

import { Profile } from '../../domain/profile';
import { ProfileEntity } from './profile.entity';

/** Every column except the ones the database fills in. */
export type ProfileRow = Omit<ProfileEntity, 'id' | 'createdAt' | 'updatedAt'>;

export class ProfileMapper {
  static toRow(profile: Profile): ProfileRow {
    const job = profile.job;
    const company = job?.company;
    const place = profile.location;
    const social = profile.social;
    const metrics = profile.metrics;

    return {
      linkedinUsername: profile.identity.linkedinUsername,
      linkedinUrl: profile.identity.linkedinUrl,
      linkedinId: profile.identity.linkedinId ?? null,

      fullName: profile.person.fullName,
      firstName: profile.person.firstName ?? null,
      lastName: profile.person.lastName ?? null,
      middleName: profile.person.middleName ?? null,
      middleInitial: profile.person.middleInitial ?? null,
      gender: profile.person.gender ?? null,
      birthYear: profile.person.birthYear ?? null,
      birthDate: profile.person.birthDate ?? null,

      jobTitle: job?.title ?? null,
      jobRole: job?.role ?? null,
      jobSubRole: job?.subRole ?? null,
      jobIndustry: job?.industry ?? null,
      jobLevels: job?.levels ?? [],
      jobSummary: job?.summary ?? null,
      jobStartDate: job?.startDate ?? null,
      jobLastUpdated: job?.lastUpdated ?? null,

      companyId: company?.id ?? null,
      companyName: company?.name ?? null,
      companyWebsite: company?.website ?? null,
      companySize: company?.size ?? null,
      companyIndustry: company?.industry ?? null,
      companyFounded: company?.founded ?? null,
      companyLinkedinUrl: company?.linkedinUrl ?? null,
      companyLinkedinId: company?.linkedinId ?? null,
      companyFacebookUrl: company?.facebookUrl ?? null,
      companyTwitterUrl: company?.twitterUrl ?? null,
      companyLocation: company?.location ?? null,

      locationName: place?.name ?? null,
      locality: place?.locality ?? null,
      metro: place?.metro ?? null,
      region: place?.region ?? null,
      country: place?.country ?? null,
      continent: place?.continent ?? null,
      streetAddress: place?.streetAddress ?? null,
      postalCode: place?.postalCode ?? null,
      addressLine2: place?.addressLine2 ?? null,
      locationLastUpdated: place?.lastUpdated ?? null,
      geo: place?.geo ?? null,

      facebookUrl: social?.facebookUrl ?? null,
      facebookUsername: social?.facebookUsername ?? null,
      facebookId: social?.facebookId ?? null,
      twitterUrl: social?.twitterUrl ?? null,
      twitterUsername: social?.twitterUsername ?? null,
      githubUrl: social?.githubUrl ?? null,
      githubUsername: social?.githubUsername ?? null,

      connections: metrics?.connections ?? null,
      salaryBand: metrics?.salaryBand ?? null,
      yearsExperience: metrics?.yearsExperience ?? null,

      summary: profile.summary ?? null,
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      locationNames: profile.locationNames ?? [],
      regionNames: profile.regionNames ?? [],
      countryNames: profile.countryNames ?? [],

      experience: profile.experience ?? null,
      education: profile.education ?? null,
      certifications: profile.certifications ?? null,
      languages: profile.languages ?? null,
      socialProfiles: profile.socialProfiles ?? null,
      addresses: profile.addresses ?? null,
      contact: profile.contact ?? null,
      sourceVersion: profile.sourceVersion ?? null,

      quality: profile.quality,
      contentHash: profile.contentHash,
      raw: profile,
    };
  }

  static toDomain(row: Pick<ProfileEntity, 'raw'>): Profile {
    return row.raw;
  }
}
