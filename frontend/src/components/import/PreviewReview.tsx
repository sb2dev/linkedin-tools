import { useState } from 'react';
import type { JSX } from 'react';
import type { ImportPreview } from '@/types/api';
import { PreviewSummary } from './PreviewSummary';
import { PreviewTable } from './PreviewTable';
import { RejectionAccordion } from './RejectionAccordion';
import { RepairToggle } from './RepairToggle';
import { NO_FILTER, type RowFilter } from './preview-rows';

export interface PreviewReviewProps {
  preview: ImportPreview;
  /** Whether the reader has asked for the provable realignments; owned by the panel that commits. */
  repair: boolean;
  onRepairChange: (repair: boolean) => void;
}

/** The review step: what the file holds, and what committing it would do. */
export function PreviewReview({ preview, repair, onRepairChange }: PreviewReviewProps): JSX.Element {
  const [filter, setFilter] = useState<RowFilter>(NO_FILTER);

  return (
    <>
      <PreviewSummary
        preview={preview}
        repair={repair}
        filter={filter}
        onFilterChange={setFilter}
      />
      <RepairToggle preview={preview} repair={repair} onRepairChange={onRepairChange} />
      <PreviewTable
        importId={preview.importId}
        rows={preview.rows}
        rowsOmitted={preview.rowsOmitted}
        repair={repair}
        filter={filter}
        onFilterChange={setFilter}
      />
      <RejectionAccordion rejections={preview.rejections} />
    </>
  );
}
