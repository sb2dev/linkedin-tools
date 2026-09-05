/** One profile as the API publishes it: the whole aggregate, minus what a reader may not see. */

import { Profile } from './profile';

/**
 * `contact` is personal data, present only for an authenticated caller. `quarantined` is dropped:
 * the counts stay, but the offending cell values are an operator's concern, not a reader's.
 */
export type ProfileDetail = Omit<Profile, 'contact' | 'quality'> & {
  readonly contact?: Profile['contact'];
  readonly quality: Omit<Profile['quality'], 'quarantined'>;
};
