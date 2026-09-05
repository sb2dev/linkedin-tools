/** The upload control. It rejects the obvious mistakes before a multi-megabyte body is sent. */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test';
import { FileDropzone, MAX_UPLOAD_BYTES, validateFile } from './FileDropzone';

function fileOf(name: string, size: number): File {
  const file = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function show(props: Partial<Parameters<typeof FileDropzone>[0]> = {}) {
  const onSelect = vi.fn();
  const view = renderApp(
    <FileDropzone onSelect={onSelect} uploading={false} progress={0} {...props} />,
  );
  return { ...view, onSelect };
}

describe('validateFile', () => {
  it('accepts the two extensions the reader can parse', () => {
    expect(validateFile(fileOf('export.csv', 10))).toBeNull();
    expect(validateFile(fileOf('export.json', 10))).toBeNull();
  });

  it('names the file and the extensions it wanted', () => {
    expect(validateFile(fileOf('export.xlsx', 10))).toBe(
      'export.xlsx is not a .csv, .json file.',
    );
  });

  it('refuses an empty file', () => {
    expect(validateFile(fileOf('export.csv', 0))).toBe('export.csv is empty.');
  });

  it('refuses one past the limit, naming both sizes', () => {
    const problem = validateFile(fileOf('export.csv', MAX_UPLOAD_BYTES + 1));

    expect(problem).toContain('over the');
    expect(problem).toContain('32');
  });
});

describe('FileDropzone', () => {
  it('says what it accepts', () => {
    show();

    expect(screen.getByText('Drop the dataset export here')).toBeInTheDocument();
    expect(screen.getByText(/\.csv, \.json up to/)).toBeInTheDocument();
  });

  it('hands a chosen file to the caller', async () => {
    const { container, onSelect } = show();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, fileOf('export.csv', 100));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'export.csv' }));
  });

  it('refuses a file it cannot read, and says why instead of uploading it', () => {
    const { container, onSelect } = show();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // fireEvent, not userEvent.upload: the latter honours `accept` and would drop the file first.
    fireEvent.change(input, { target: { files: [fileOf('export.xlsx', 100)] } });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('export.xlsx is not a .csv, .json file.')).toBeInTheDocument();
  });

  it('opens the file picker from the button', async () => {
    const { container } = show();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Choose a file' }));

    expect(click).toHaveBeenCalled();
  });

  describe('dragging', () => {
    it('takes a dropped file', () => {
      const { onSelect } = show();
      const zone = screen.getByText('Drop the dataset export here').parentElement as HTMLElement;

      fireEvent.dragOver(zone);
      fireEvent.drop(zone, { dataTransfer: { files: [fileOf('export.csv', 100)] } });

      expect(onSelect).toHaveBeenCalled();
    });

    it('ignores a drop while an upload is already running', () => {
      const { onSelect } = show({ uploading: true });
      const zone = screen.getByText('Drop the dataset export here').parentElement as HTMLElement;

      fireEvent.drop(zone, { dataTransfer: { files: [fileOf('export.csv', 100)] } });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ignores a drop that carried no file', () => {
      const { onSelect } = show();
      const zone = screen.getByText('Drop the dataset export here').parentElement as HTMLElement;

      fireEvent.drop(zone, { dataTransfer: { files: [] } });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('lets go of the highlight when the file leaves again', () => {
      show();
      const zone = screen.getByText('Drop the dataset export here').parentElement as HTMLElement;

      fireEvent.dragOver(zone);
      expect(zone.className).toContain('border-accent');

      fireEvent.dragLeave(zone);
      expect(zone.className).not.toContain('border-accent');
    });
  });

  describe('while uploading', () => {
    it('shows how much has been sent', () => {
      show({ uploading: true, progress: 40 });

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
      expect(screen.getByText('Uploading 40%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
    });

    it('says it is analysing once the body is all sent', () => {
      show({ uploading: true, progress: 100 });

      expect(screen.getByText('Analysing the file…')).toBeInTheDocument();
    });
  });

  it('shows a failure the caller reports', () => {
    show({ error: 'the API refused the upload' });

    expect(screen.getByText('the API refused the upload')).toBeInTheDocument();
  });

  it('prefers its own rejection over the caller’s older error', () => {
    const { container } = show({ error: 'an older failure' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [fileOf('export.xlsx', 100)] } });

    expect(screen.getByText('export.xlsx is not a .csv, .json file.')).toBeInTheDocument();
    expect(screen.queryByText('an older failure')).not.toBeInTheDocument();
  });
});
