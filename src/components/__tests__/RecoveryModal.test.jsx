import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecoveryModal from '../RecoveryModal.jsx';

const originalClipboard = globalThis.navigator?.clipboard;

describe('RecoveryModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const clipboardMock = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: clipboardMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: originalClipboard,
    });
  });

  it('renders code and handles acknowledge flow', async () => {
    const onAck = vi.fn();
    const onCopy = vi.fn();
    render(
      <RecoveryModal
        open
        code="AAAAA-BBBBB-CCCCC-DDDDD"
        onAcknowledge={onAck}
        onCopy={onCopy}
        onDownload={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /save your recovery code/i }),
    ).toBeVisible();
    expect(screen.getByText('AAAAA-BBBBB-CCCCC-DDDDD')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith(
      'AAAAA-BBBBB-CCCCC-DDDDD',
    );

    await userEvent.click(
      screen.getByLabelText(
        /I understand that losing this code means losing access/i,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: /I saved the code/i }));
    expect(onAck).toHaveBeenCalled();
  });

  it('shows inline error when confirming without acknowledgement', async () => {
    const onAck = vi.fn();
    render(<RecoveryModal open code="FFFFF-GGGGG-HHHHH-IIIII" onAcknowledge={onAck} />);

    const checkbox = screen.getByLabelText(
      /I understand that losing this code means losing access/i,
    );
    const confirmButton = screen.getByRole('button', { name: /I saved the code/i });

    await userEvent.click(confirmButton);
    expect(onAck).not.toHaveBeenCalled();
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText(/Please confirm before continuing./i);
    expect(error).toBeVisible();
    expect(checkbox).toHaveAttribute('aria-describedby', error.id);

    await userEvent.click(checkbox);
    expect(checkbox).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Please confirm before continuing./i)).not.toBeInTheDocument();

    await userEvent.click(confirmButton);
    expect(onAck).toHaveBeenCalledTimes(1);
  });
});
