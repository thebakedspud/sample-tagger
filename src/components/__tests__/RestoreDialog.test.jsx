import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RestoreDialog from '../RestoreDialog.jsx';

describe('RestoreDialog', () => {
  it('submits code when confirmed', () => {
    const onSubmit = vi.fn();
    render(
      <RestoreDialog
        open
        onSubmit={onSubmit}
        onClose={vi.fn()}
        onRequestBackup={vi.fn()}
        hasLocalNotes={false}
      />,
    );

    const input = screen.getByRole('textbox', { name: /Recovery code/i });
    fireEvent.change(input, { target: { value: 'aaaaa-bbbbb-ccccc-ddddd' } });
    fireEvent.click(screen.getByRole('button', { name: /restore/i }));

    expect(onSubmit).toHaveBeenCalledWith('AAAAA-BBBBB-CCCCC-DDDDD');
  });

  it('requires confirmation when local notes exist', () => {
    const onSubmit = vi.fn();
    render(
      <RestoreDialog
        open
        onSubmit={onSubmit}
        onClose={vi.fn()}
        onRequestBackup={vi.fn()}
        hasLocalNotes
      />,
    );

    const restoreButton = screen.getByRole('button', { name: /restore/i });
    fireEvent.change(screen.getByRole('textbox', { name: /Recovery code/i }), {
      target: { value: 'AAAAA-BBBBB-CCCCC-DDDDD' },
    });

    expect(restoreButton).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(/I’m okay replacing the notes on this device/i),
    );
    expect(restoreButton).not.toBeDisabled();
  });
});
