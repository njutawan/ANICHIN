// @vitest-environment jsdom
/**
 * Component tests for <Footer />.
 *
 * Covers:
 *   - Renders the brand name "ANICHIN" (split across spans)
 *   - Newsletter form validates email (empty / missing @ → toast.error)
 *   - Newsletter form accepts valid email → toast.success
 *   - All 4 social links are present and labelled
 *   - Footer accordion buttons exist (one per link section)
 *
 * Mocks:
 *   - sonner → spy on toast.error / toast.success
 *   - next/link → rendered as plain <a> (jsdom-safe, no router needed)
 *   - lucide-react → real (lightweight svg icons render fine in jsdom)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

// next/link → plain <a> so we can assert on href without a router.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ── Component under test ────────────────────────────────────────────────────

import { Footer } from './footer';

describe('<Footer />', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('renders the brand name "ANICHIN"', () => {
    render(<Footer />);
    // Brand link: <a href="#home"> <div>A</div> <span>ANI<span>CHIN</span></span> </a>
    // The link's total textContent is "AANICHIN" (logo mark + wordmark).
    // We assert both: the logo mark and the wordmark are present.
    const brandLink = document.querySelector('a[href="#home"]');
    expect(brandLink).not.toBeNull();
    expect(brandLink?.textContent).toContain('ANICHIN');
    // And the inner wordmark span contains exactly "ANICHIN".
    const wordmark = brandLink?.querySelector('span.text-lg.font-black');
    expect(wordmark?.textContent).toBe('ANICHIN');
  });

  it('renders all 4 social links with aria-labels', () => {
    render(<Footer />);
    // Social links are rendered with aria-label in the CTA strip.
    const labels = ['Telegram', 'YouTube', 'Twitter', 'Discord'];
    for (const label of labels) {
      const link = screen.getByRole('link', { name: label });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('renders one accordion toggle button per footer link section', () => {
    render(<Footer />);
    // Each of the 3 link sections has a toggle button with its title text.
    const sections = ['Navigasi', 'Tipe Anime', 'Bantuan'];
    for (const title of sections) {
      // The button contains an h4 with the title text.
      const btn = screen.getByRole('button', { name: new RegExp(title) });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-expanded');
    }
  });

  describe('newsletter form', () => {
    it('renders an email input and a submit button', () => {
      render(<Footer />);
      // The email input is the only input of type email in the footer.
      const input = screen.getByPlaceholderText(/email kamu/i);
      expect(input).toHaveAttribute('type', 'email');
      // Submit button reads "Langganan".
      expect(screen.getByRole('button', { name: /langganan/i })).toBeInTheDocument();
    });

    it('shows an error toast when the email is empty', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const submit = screen.getByRole('button', { name: /langganan/i });
      await user.click(submit);
      expect(toastMock.error).toHaveBeenCalledWith('Email salah');
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it('shows an error toast when the email is missing an @', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const input = screen.getByPlaceholderText(/email kamu/i);
      await user.type(input, 'notanemail');
      // user-event enforces HTML5 form validation, which would block submit on a
      // type="email" input with an invalid value. We bypass it with fireEvent.submit
      // so we can exercise the component's own validation logic.
      fireEvent.submit(input.closest('form')!);
      expect(toastMock.error).toHaveBeenCalledWith('Email salah');
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it('shows a success toast for a valid email and clears the input', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const input = screen.getByPlaceholderText(/email kamu/i) as HTMLInputElement;
      const submit = screen.getByRole('button', { name: /langganan/i });
      await user.type(input, 'weeb@anichin.id');
      await user.click(submit);
      expect(toastMock.success).toHaveBeenCalledWith(
        'Berhasil langganan!',
        expect.objectContaining({
          description: expect.stringContaining('notifikasi'),
        })
      );
      expect(toastMock.error).not.toHaveBeenCalled();
      // Input should be cleared after a successful submit.
      expect(input.value).toBe('');
    });

    it('shows an error toast when the email contains only whitespace', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const input = screen.getByPlaceholderText(/email kamu/i);
      const submit = screen.getByRole('button', { name: /langganan/i });
      await user.type(input, '   ');
      await user.click(submit);
      expect(toastMock.error).toHaveBeenCalledWith('Email salah');
    });
  });

  describe('accordion toggle behaviour', () => {
    it('expands a section when its button is clicked and collapses when clicked again', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const btn = screen.getByRole('button', { name: /Navigasi/ });

      // Initially no section is open (aria-expanded="false").
      expect(btn).toHaveAttribute('aria-expanded', 'false');

      await user.click(btn);
      expect(btn).toHaveAttribute('aria-expanded', 'true');

      await user.click(btn);
      expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    it('only one section is open at a time', async () => {
      const user = userEvent.setup();
      render(<Footer />);
      const navBtn = screen.getByRole('button', { name: /Navigasi/ });
      const tipeBtn = screen.getByRole('button', { name: /Tipe Anime/ });

      await user.click(navBtn);
      expect(navBtn).toHaveAttribute('aria-expanded', 'true');
      expect(tipeBtn).toHaveAttribute('aria-expanded', 'false');

      await user.click(tipeBtn);
      expect(navBtn).toHaveAttribute('aria-expanded', 'false');
      expect(tipeBtn).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
