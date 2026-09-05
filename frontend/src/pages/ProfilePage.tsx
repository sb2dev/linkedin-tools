import type { ReactElement } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { PageContainer, focusRing } from '@/components/layout';
import {
  CertificationsSection,
  EducationSection,
  ExperienceSection,
  InterestsSection,
  LanguagesSection,
  ProfileAbout,
  ProfileHeader,
  ProfileSection,
  SkillsSection,
} from '@/components/profile';
import { ErrorState, ResultSkeleton } from '@/components/results';
import { useProfile } from '@/hooks/use-search';
import { formatNumber, formatQualityScore, joinParts } from '@/lib/format';
import { ApiError, type ProfileDetail } from '@/types/api';

function Fact({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/** What the importer made of the row. */
function DataQuality({ profile }: { profile: ProfileDetail }): ReactElement {
  const { quality } = profile;
  const flags = joinParts([
    quality.repaired ? 'row realigned' : undefined,
    quality.drifted ? 'column drift detected' : undefined,
  ]);

  return (
    <ProfileSection title="Data quality">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label="Score" value={formatQualityScore(quality.score)} />
        <Fact label="Fields populated" value={formatNumber(quality.fieldsPopulated)} />
        <Fact label="Quarantined" value={formatNumber(quality.fieldsQuarantined)} />
        <Fact label="Import" value={flags.length > 0 ? flags : 'clean'} />
      </dl>
    </ProfileSection>
  );
}

export function ProfilePage(): ReactElement {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useProfile(username);

  const goBack = (): void => {
    // A default key means this page is the first entry, so there is no search to return to.
    if (location.key === 'default') void navigate('/');
    else void navigate(-1);
  };

  if (query.isPending) {
    return (
      <PageContainer narrow>
        <ResultSkeleton count={3} />
      </PageContainer>
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.isNotFound;
    return (
      <PageContainer narrow>
        <ErrorState
          error={query.error}
          title={notFound ? 'No such profile' : undefined}
          onRetry={
            notFound
              ? undefined
              : () => {
                  void query.refetch();
                }
          }
        />
        <p className="mt-4">
          <Link to="/" className={clsx('text-sm text-accent hover:underline', focusRing)}>
            Back to search
          </Link>
        </p>
      </PageContainer>
    );
  }

  const profile = query.data;

  return (
    <PageContainer narrow className="space-y-4">
      <button type="button" onClick={goBack} className={clsx('text-sm text-accent hover:underline', focusRing)}>
        ← Back to results
      </button>

      <ProfileHeader profile={profile} />

      {profile.summary === undefined ? null : <ProfileAbout text={profile.summary} />}

      <ExperienceSection entries={profile.experience ?? []} />

      <EducationSection entries={profile.education ?? []} />

      <CertificationsSection entries={profile.certifications ?? []} />

      <SkillsSection skills={profile.skills ?? []} />

      <LanguagesSection entries={profile.languages ?? []} />

      <InterestsSection interests={profile.interests ?? []} />

      <DataQuality profile={profile} />
    </PageContainer>
  );
}
