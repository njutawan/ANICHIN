// @vitest-environment jsdom
/**
 * Component tests for <UserMenu />.
 *
 * Covers:
 *   - Shows the "Daftar" (and "Masuk") button when unauthenticated
 *   - Shows a loading state while mounted=false OR session is loading
 *   - Shows the avatar dropdown with user name + email when authenticated
 *   - Shows an ADMIN badge when the session user has the admin role
 *
 * Mocks:
 *   - @/hooks/use-auth → returns controllable { isAuthenticated, isAdmin, isLoading, user, logout }
 *   - @/hooks/use-mounted → returns true by default (overridden per-test for the loading test)
 *   - next/navigation → useRouter stub (push spy)
 *   - next/link → plain <a>
 *   - sonner → spy on toast.success / toast.error
 *   - @tanstack/react-query → not used by UserMenu directly, but imported
 *     transitively by some hooks — stubbed as a defensive no-op
 *   - lucide-react → real (lightweight svg icons render fine in jsdom)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { routerPush } = vi.hoisted(() => ({
  routerPush: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

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

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

// Defensive stub: providers transitively import react-query. We never call
// its hooks here, but stubbing ensures no real network state leaks in.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Defensive stub: next-auth/react is used by use-auth but not by UserMenu directly.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// useAuth is the main lever for these tests — controlled per-test via authState.
const { authState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false as boolean,
    isAdmin: false as boolean,
    isLoading: false as boolean,
    user: null as { name: string; email: string; role: 'user' | 'admin'; id: string } | null,
    logout: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    session: null as unknown,
    status: 'unauthenticated' as 'loading' | 'authenticated' | 'unauthenticated',
  },
}));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

// useMounted defaults to true so the loading branch is driven by isLoading.
// Tests that need to assert the !mounted branch override this locally.
const { mountedRef } = vi.hoisted(() => ({
  // `current` is mutated by tests; useMock returns current.value
  mountedRef: { current: true as boolean },
}));
vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => mountedRef.current,
}));

// ── Component under test ────────────────────────────────────────────────────

import { UserMenu } from './user-menu';

describe('<UserMenu />', () => {
  beforeEach(() => {
    mountedRef.current = true;
    authState.isAuthenticated = false;
    authState.isAdmin = false;
    authState.isLoading = false;
    authState.user = null;
    authState.status = 'unauthenticated';
    authState.logout = vi.fn().mockResolvedValue(undefined);
    routerPush.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  describe('loading state', () => {
    it('renders a spinner while the component is mounting (useMounted=false)', () => {
      mountedRef.current = false;
      const { container } = render(<UserMenu />);
      // Loader2 is the lucide spinner icon — it has an `animate-spin` class.
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      // No auth buttons should be visible during loading.
      expect(screen.queryByText(/Daftar/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Masuk/)).not.toBeInTheDocument();
    });

    it('renders a spinner when the session is loading', () => {
      authState.isLoading = true;
      authState.status = 'loading';
      const { container } = render(<UserMenu />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.queryByText(/Daftar/)).not.toBeInTheDocument();
    });
  });

  describe('unauthenticated state', () => {
    it('shows the "Daftar" button when unauthenticated', () => {
      render(<UserMenu />);
      const daftar = screen.getByRole('link', { name: /Daftar/i });
      expect(daftar).toBeInTheDocument();
      expect(daftar).toHaveAttribute('href', '/auth/register');
    });

    it('shows the "Masuk" button when unauthenticated', () => {
      render(<UserMenu />);
      const masuk = screen.getByRole('link', { name: /Masuk/i });
      expect(masuk).toBeInTheDocument();
      expect(masuk).toHaveAttribute('href', '/auth/login');
    });

    it('does not render any avatar trigger button', () => {
      render(<UserMenu />);
      // When unauthenticated there is no "Menu akun" button.
      expect(screen.queryByRole('button', { name: /menu akun/i })).not.toBeInTheDocument();
    });
  });

  describe('authenticated state', () => {
    beforeEach(() => {
      authState.isAuthenticated = true;
      authState.status = 'authenticated';
      authState.user = {
        id: 'u-1',
        name: 'Siti Rahmawati',
        email: 'siti@example.com',
        role: 'user',
      };
    });

    it('renders an avatar trigger button labelled "Menu akun"', () => {
      render(<UserMenu />);
      expect(screen.getByRole('button', { name: /menu akun/i })).toBeInTheDocument();
    });

    it('shows the user name and email inside the opened dropdown', async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByRole('button', { name: /menu akun/i }));
      // The user name appears twice (truncated in the trigger, full in the
      // dropdown label) and the email appears once (dropdown only). We just
      // assert at least one match for each — the menu is open.
      expect(screen.getAllByText('Siti Rahmawati').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('siti@example.com')).toBeInTheDocument();
    });

    it('shows the "Keluar" menu item that triggers logout + redirect', async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByRole('button', { name: /menu akun/i }));
      const keluar = screen.getByRole('menuitem', { name: /Keluar/i });
      await user.click(keluar);

      expect(authState.logout).toHaveBeenCalledTimes(1);
      expect(authState.logout).toHaveBeenCalledWith(true);
      // Toast + redirect only fire after the logout promise resolves.
      await vi.waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith('Berhasil keluar. Sampai jumpa!');
      });
      expect(routerPush).toHaveBeenCalledWith('/');
    });

    it('renders the ADMIN badge in the trigger when the user is an admin', () => {
      authState.isAdmin = true;
      authState.user = { ...authState.user!, role: 'admin' };
      render(<UserMenu />);
      // The trigger button contains an ADMIN badge.
      const trigger = screen.getByRole('button', { name: /menu akun/i });
      expect(trigger).toHaveTextContent('ADMIN');
    });

    it('shows the "Panel Admin" menu item only for admins', async () => {
      authState.isAdmin = true;
      authState.user = { ...authState.user!, role: 'admin' };
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByRole('button', { name: /menu akun/i }));
      expect(screen.getByRole('menuitem', { name: /Panel Admin/i })).toBeInTheDocument();
    });

    it('does not show the "Panel Admin" menu item for regular users', async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByRole('button', { name: /menu akun/i }));
      expect(screen.queryByRole('menuitem', { name: /Panel Admin/i })).not.toBeInTheDocument();
    });
  });
});
