'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMounted } from '@/hooks/use-mounted';
import { toast } from 'sonner';
import {
  
  LogOut,
  LogIn,
  UserPlus,
  Shield,
  ShieldCheck,
  Bookmark,
  History,
  Loader2,
} from 'lucide-react';

/**
 * User menu button for the header.
 * - Loading state while session resolves
 * - "Masuk" + "Daftar" buttons when unauthenticated
 * - Avatar dropdown with profile/logout when authenticated
 */
export function UserMenu() {
  const { isAuthenticated, isAdmin, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const mounted = useMounted();
  const [signingOut, setSigningOut] = useState(false);

  // Loading skeleton (also prevents hydration mismatch)
  if (!mounted || isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 px-3 rounded-full bg-secondary/70 border border-border flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Unauthenticated — show login + register.
  // Both buttons are hidden below `sm` (mobile) because the mobile Sheet menu
  // exposes dedicated auth links there (see header.tsx MobileAuthButtons).
  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/auth/login"
          className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-secondary/70 hover:bg-secondary px-3 text-sm font-medium text-foreground transition-colors"
        >
          <LogIn className="h-3.5 w-3.5" />
          Masuk
        </Link>
        <Link
          href="/auth/register"
          className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 px-3 text-sm font-semibold transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Daftar
        </Link>
      </div>
    );
  }

  // Authenticated — avatar dropdown
  const initials = (user?.name ?? 'A')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout(true);
      toast.success('Berhasil keluar. Sampai jumpa!');
      router.push('/');
    } catch {
      toast.error('Gagal keluar. Coba lagi.');
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center gap-2 h-9 rounded-full border border-border bg-secondary/70 hover:bg-secondary pl-1 pr-3 transition-colors focus-brand"
          aria-label="Menu akun"
        >
          <Avatar className="h-7 w-7 border border-brand/30">
            <AvatarFallback className="bg-gradient-to-br from-brand to-amber-600 text-black text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm font-medium max-w-[80px] truncate">
            {user?.name}
          </span>
          {isAdmin && (
            <Badge
              variant="secondary"
              className="h-4 px-1 text-xs bg-brand/20 text-brand border-brand/30"
            >
              <Shield className="h-2.5 w-2.5 mr-0.5" />
              ADMIN
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-popover/95 backdrop-blur-xl border-border"
      >
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-sm font-semibold truncate">{user?.name}</span>
          <span className="text-xs text-muted-foreground font-normal truncate">
            {user?.email}
          </span>
          {isAdmin && (
            <Badge
              variant="secondary"
              className="w-fit mt-1 bg-brand/20 text-brand border-brand/30"
            >
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="#bookmark" className="cursor-pointer">
            <Bookmark className="h-4 w-4 mr-2" />
            Bookmark Saya
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="#history" className="cursor-pointer">
            <History className="h-4 w-4 mr-2" />
            Riwayat Tonton
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/auth/2fa" className="cursor-pointer">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Keamanan Akun (2FA)
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer text-brand focus:text-brand">
                <Shield className="h-4 w-4 mr-2" />
                Panel Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={signingOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
