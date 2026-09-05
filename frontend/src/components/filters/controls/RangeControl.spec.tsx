import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RangeControl } from './RangeControl';
import { DateRangeControl } from './DateRangeControl';
import { fieldNamed } from '@/test';
import type { FilterValue, SearchField } from '@/types/api';

const years = fieldNamed('yearsExperience');
const graduated = fieldNamed('graduationYear');

/** The popover holds the draft value and feeds it back; these controls only work that way. */
function Draft({
  control,
  field,
  initial,
  onChange,
}: {
  control: 'range' | 'date';
  field: SearchField;
  initial?: FilterValue;
  onChange: (value: FilterValue | undefined) => void;
}): ReactElement {
  const [draft, setDraft] = useState<FilterValue | undefined>(initial);
  const commit = (next: FilterValue | undefined): void => {
    setDraft(next);
    onChange(next);
  };
  return control === 'range' ? (
    <RangeControl field={field} value={draft} onChange={commit} />
  ) : (
    <DateRangeControl field={field} value={draft} onChange={commit} />
  );
}

describe('RangeControl', () => {
  it('accepts a lower bound on its own, leaving the top open', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="range" field={years} onChange={onChange} />);

    await user.type(screen.getByLabelText('Minimum Years of experience'), '12');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', min: 12 });
    expect(screen.getByLabelText('Maximum Years of experience')).toHaveValue(null);
  });

  it('accepts an upper bound on its own, leaving the bottom open', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="range" field={years} onChange={onChange} />);

    await user.type(screen.getByLabelText('Maximum Years of experience'), '5');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', max: 5 });
  });

  it('clears the filter when both ends are emptied again', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="range" field={years} initial={{ type: 'range', min: 5 }} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Minimum Years of experience'));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the bounds the filter already carries', () => {
    render(<RangeControl field={years} value={{ type: 'range', min: 3, max: 12 }} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Minimum Years of experience')).toHaveValue(3);
    expect(screen.getByLabelText('Maximum Years of experience')).toHaveValue(12);
  });

  it('warns when the bounds are the wrong way round rather than letting a dead range through quietly', async () => {
    const user = userEvent.setup();
    render(<Draft control="range" field={years} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText('Minimum Years of experience'), '12');
    expect(screen.queryByText(/lower bound is above/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Maximum Years of experience'), '3');
    expect(screen.getByText('The lower bound is above the upper bound.')).toBeInTheDocument();
  });

  it('leaves the bound unset rather than sending a number the API cannot read', async () => {
    const onChange = vi.fn();
    render(<Draft control="range" field={years} onChange={onChange} />);

    // A number box accepts exponent notation, and 1e999 overflows to Infinity.
    fireEvent.change(screen.getByLabelText('Minimum Years of experience'), { target: { value: '1e999' } });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('follows a bound changed from outside instead of keeping the text it had', () => {
    const { rerender } = render(<RangeControl field={years} value={{ type: 'range', min: 3, max: 12 }} onChange={vi.fn()} />);

    rerender(<RangeControl field={years} value={{ type: 'range', min: 5 }} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Minimum Years of experience')).toHaveValue(5);
    expect(screen.getByLabelText('Maximum Years of experience')).toHaveValue(null);
  });

  it('survives a decimal typed one character at a time, as the quality score needs', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="range" field={fieldNamed('qualityScore')} onChange={onChange} />);
    const min = screen.getByLabelText<HTMLInputElement>('Minimum Data quality');

    await user.type(min, '0.5');

    expect(min.value).toBe('0.5');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', min: 0.5 });
  });
});

describe('DateRangeControl', () => {
  it('accepts an earliest year on its own, leaving the latest open', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="date" field={graduated} onChange={onChange} />);

    await user.type(screen.getByLabelText('Earliest Graduated'), '2004');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'date_range', from: '2004' });
  });

  it('accepts a latest year on its own', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="date" field={graduated} onChange={onChange} />);

    await user.type(screen.getByLabelText('Latest Graduated'), '2010');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'date_range', to: '2010' });
  });

  it('takes the partial dates the export actually stores', () => {
    render(<DateRangeControl field={graduated} value={{ type: 'date_range', from: '2004-09', to: '2008-06-01' }} onChange={vi.fn()} />);

    expect(screen.queryByText(/Use a year/)).not.toBeInTheDocument();
  });

  it('says what a year should look like when the bound is not a date at all', () => {
    render(<DateRangeControl field={graduated} value={{ type: 'date_range', from: 'last summer' }} onChange={vi.fn()} />);

    expect(screen.getByText('Use a year, or yyyy-MM / yyyy-MM-dd.')).toBeInTheDocument();
  });

  it('clears the filter when both ends are emptied', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Draft control="date" field={graduated} initial={{ type: 'date_range', from: '2004' }} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Earliest Graduated'));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
