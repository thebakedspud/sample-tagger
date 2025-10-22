import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecoveryModal from '../RecoveryModal.jsx';

const originalClipboard = globalThis.navigator?.clipboard;

describe('RecoveryModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(globalThis.navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      globalThis.navigator.clipboard = originalClipboard;
    }
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
});
