import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ErrorMessage from '../ErrorMessage.jsx';

describe('ErrorMessage', () => {
  it('renders role alert and spreads data-type', () => {
    render(
      <ErrorMessage id="err" data-type="cancel">
        Problem
      </ErrorMessage>,
    );
    const node = screen.getByRole('alert');
    expect(node).toHaveAttribute('id', 'err');
    expect(node).toHaveAttribute('data-type', 'cancel');
    expect(node).toHaveTextContent('Problem');
  });

  it('returns null when no children provided', () => {
    const { container } = render(<ErrorMessage id="empty" />);
    expect(container.firstChild).toBeNull();
  });
});
