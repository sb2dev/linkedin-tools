import type { ReactElement } from 'react';
import type { ContactInfo } from '@/types/api';

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/** The details behind the Contact info control. */
export function ContactPanel({ contact }: { contact: ContactInfo }): ReactElement {
  const emails = contact.emails ?? [];
  const phones = [...(contact.phones ?? []), ...(contact.mobilePhone ?? [])];

  return (
    <dl className="mt-4 space-y-2 rounded border border-line bg-surface px-3 py-2.5">
      {contact.workEmail === undefined ? null : <Detail label="Work email" value={contact.workEmail} />}
      {emails.length === 0 ? null : (
        <Detail label="Email" value={emails.map((email) => email.address).join(', ')} />
      )}
      {phones.length === 0 ? null : <Detail label="Phone" value={phones.join(', ')} />}
    </dl>
  );
}
