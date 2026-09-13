'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Menu, Home, Film, CalendarDays, Bookmark, Flame, ChevronDown, Sun, Moon, Shuffle, X, LogIn, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/site/user-menu';
import { LanguageToggle } from '@/components/site/language-toggle';
import { PwaInstallButton } from '@/components/site/pwa-install-button';
import { SettingsButton } from '@/components/site/settings-panel';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n-context';

const NAV = [
  { labelKey: 'nav.home', href: '#home', icon: Home },
  { labelKey: 'nav.animeList', href: '#list', icon: Film },
  { labelKey: 'nav.schedule', href: '#schedule', icon: CalendarDays },
  { labelKey: 'nav.bookmark', href: '#bookmark', icon: Bookmark },
];

export function Header() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openSearchModal = useUIStore((s) => s.openSearchModal);
  const mounted = useMounted();
  const bookmarkCount = useUIStore((s) => s.bookmarks.length);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      role="banner"
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300 safe-top',
        scrolled
          ? 'bg-background/90 backdrop-blur-xl border-b border-border shadow-lg shadow-black/30'
          : 'bg-background/60 backdrop-blur-md border-b border-transparent'
      )}
    >
      {/* Top ticker / announcement */}
      <div className="bg-gradient-to-r from-brand/20 via-brand/10 to-brand/20 border-b border-brand/20 overflow-hidden">
        <div className="container-fluid py-1.5 flex items-center gap-2 text-fluid-xs overflow-hidden">
          <Badge variant="secondary" className="shrink-0 bg-brand/20 text-brand border-brand/30">
            <Flame className="h-3 w-3 mr-1" /> HOT
          </Badge>
          <div className="flex-1 overflow-hidden min-w-0">
            <div className="flex gap-8 whitespace-nowrap animate-marquee text-muted-foreground">
              {TICKERS.concat(TICKERS).map((tk, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="text-brand">•</span> {tk}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container-fluid">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <Link href="#home" className="flex items-center gap-2 shrink-0 group">
            <div className="relative">
              <div className="absolute inset-0 bg-brand blur-xl opacity-50 group-hover:opacity-80 transition-opacity" />
              <div className="relative h-11 w-11 rounded-lg bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center font-black text-black text-lg shadow-lg shadow-brand/30">
                A
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-black tracking-tight">
                ANI<span className="text-brand text-glow">CHIN</span>
              </span>
              <span className="hidden xs:block text-xs text-muted-foreground tracking-[0.2em] uppercase">
                {t('nav.brandTagline')}
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav role="navigation" aria-label={t('nav.mainNav')} className="hidden lg:flex items-center gap-1">
            {NAV.map((item) => {
              const label = t(item.labelKey);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors group"
                >
                  <item.icon className="h-4 w-4 group-hover:text-brand transition-colors" />
                  {label}
                  {item.labelKey === 'nav.bookmark' && mounted && bookmarkCount > 0 && (
                    <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-brand text-brand-foreground text-xs font-bold flex items-center justify-center">
                      {bookmarkCount}
                    </span>
                  )}
                </Link>
              );
            })}
            <GenreDropdown />
          </nav>

          {/* Search + theme toggle + random + user menu + mobile toggle
              Mobile layout (375px): [search-icon] [user-menu] [hamburger]
              Desktop layout (lg):   [random] [theme] [lang] [settings] [pwa] [user] [search-box] */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <RandomButton className="hidden lg:inline-flex" />
            <ThemeToggle className="hidden lg:inline-flex" />
            <LanguageToggle className="hidden lg:inline-flex" />
            <SettingsButton className="hidden lg:inline-flex" />
            <PwaInstallButton className="hidden lg:inline-flex" />
            <UserMenu />

            <button
              onClick={() => openSearchModal()}
              className="flex items-center gap-2 rounded-full bg-secondary/70 hover:bg-secondary border border-border text-muted-foreground transition-colors justify-start w-11 h-11 p-0 md:w-56 md:px-3 lg:w-64 lg:px-3 lg:py-2 lg:text-sm"
              aria-label={t('nav.searchAnime')}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline truncate">{t('nav.search')}</span>
              <kbd className="ml-auto hidden lg:inline-flex items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                /
              </kbd>
            </button>

            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-md bg-secondary/70 border border-border text-foreground focus-brand"
                  aria-label={t('nav.openMenu')}
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(92vw,320px)] bg-background border-r border-border p-0 overflow-y-auto safe-bottom">
                <SheetHeader className="px-4 py-4 border-b border-border sticky top-0 bg-background z-10">
                  <SheetTitle className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center font-black text-black">
                      A
                    </div>
                    <span className="font-black">ANI<span className="text-brand">CHIN</span></span>
                    <button
                      onClick={() => setMobileOpen(false)}
                      className="ml-auto h-8 w-8 rounded-md hover:bg-secondary flex items-center justify-center lg:hidden"
                      aria-label={t('common.close')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </SheetTitle>
                </SheetHeader>

                {/* Navigation section */}
                <div className="px-4 pt-4 pb-2">
                  <p className="px-1 mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('header.menuNavSection')}
                  </p>
                </div>
                <nav role="navigation" aria-label={t('nav.mainNav')} className="flex flex-col px-2 pb-2">
                  {NAV.map((item) => {
                    const label = t(item.labelKey);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
                      >
                        <item.icon className="h-4 w-4 text-brand" />
                        <span>{label}</span>
                        {item.labelKey === 'nav.bookmark' && mounted && bookmarkCount > 0 && (
                          <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-brand text-brand-foreground text-xs font-bold flex items-center justify-center">
                            {bookmarkCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  <Link
                    href="#genres"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
                  >
                    <Film className="h-4 w-4 text-brand" />
                    <span>{t('nav.genre')}</span>
                  </Link>
                </nav>

                {/* Quick actions section (replaces desktop-only header buttons on mobile) */}
                <div className="px-4 pt-4 pb-2 border-t border-border mt-2">
                  <p className="px-1 mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('header.menuActionsSection')}
                  </p>
                </div>
                <div className="flex flex-col px-2 pb-4 gap-1">
                  {/* Random anime */}
                  <MobileRandomButton onDone={() => setMobileOpen(false)} />

                  {/* Theme toggle (inline, full width) */}
                  <MobileThemeToggle />

                  {/* Language toggle (inline, full width) */}
                  <MobileLanguageToggle />

                  {/* Settings */}
                  <MobileSettingsButton onDone={() => setMobileOpen(false)} />

                  {/* Search */}
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      openSearchModal();
                    }}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
                  >
                    <Search className="h-4 w-4 text-brand" />
                    <span>{t('header.menuSearchLabel')}</span>
                  </button>

                  {/* PWA install (only renders when installable / iOS) */}
                  <MobilePwaInstall onDone={() => setMobileOpen(false)} />
                </div>

                {/* Auth section — only visible when unauthenticated. When the user
                    is logged in, their avatar is already in the header bar. */}
                <MobileAuthSection onDone={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Shared button style for header icon buttons (44×44px touch target). */
const ICON_BTN_CLASS =
  'relative h-11 w-11 rounded-full border border-border bg-secondary/70 hover:bg-secondary text-foreground hover:text-brand transition-colors items-center justify-center overflow-hidden focus-brand';

function RandomButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const openDetail = useUIStore((s) => s.openDetail);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/random');
      if (!res.ok) throw new Error('random failed');
      const data = await res.json();
      if (data?.slug) {
        openDetail(data.slug);
        toast.success(data.title);
      }
    } catch {
      toast.error(t('header.randomFail'));
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label={t('header.randomAnime')}
      title={t('header.randomAnime')}
      className={cn(ICON_BTN_CLASS, 'hover:bg-brand hover:text-brand-foreground hover:border-brand flex', className)}
    >
      <Shuffle className={cn('h-4 w-4 transition-transform', loading && 'animate-spin')} />
    </button>
  );
}

function MobileRandomButton({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const openDetail = useUIStore((s) => s.openDetail);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/random');
      if (!res.ok) throw new Error('random failed');
      const data = await res.json();
      if (data?.slug) {
        openDetail(data.slug);
        toast.success(data.title);
        onDone();
      }
    } catch {
      toast.error(t('header.randomFail'));
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90 disabled:opacity-60"
    >
      <Shuffle className={cn('h-4 w-4 text-brand transition-transform', loading && 'animate-spin')} />
      <span>{t('header.menuRandomLabel')}</span>
    </button>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  // Avoid hydration mismatch: render a stable placeholder until mounted.
  const mounted = useMounted();
  const isDark = mounted ? theme === 'dark' : true;
  const handleToggle = () => {
    toggleTheme();
    toast.success(theme === 'dark' ? t('header.themeLight') : t('header.themeDark'));
  };
  return (
    <button
      onClick={handleToggle}
      aria-label={isDark ? t('header.enableLight') : t('header.enableDark')}
      title={isDark ? t('header.themeLight') : t('header.themeDark')}
      className={cn(ICON_BTN_CLASS, 'flex', className)}
    >
      <Sun
        className={cn(
          'absolute h-4 w-4 transition-all duration-500',
          isDark ? 'opacity-0 -rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100 text-brand'
        )}
      />
      <Moon
        className={cn(
          'absolute h-4 w-4 transition-all duration-500',
          isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'
        )}
      />
    </button>
  );
}

function MobileThemeToggle() {
  const { t } = useI18n();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const mounted = useMounted();
  const isDark = mounted ? theme === 'dark' : true;
  const handleToggle = () => {
    toggleTheme();
    toast.success(theme === 'dark' ? t('header.themeLight') : t('header.themeDark'));
  };
  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
    >
      {isDark ? <Moon className="h-4 w-4 text-brand" /> : <Sun className="h-4 w-4 text-brand" />}
      <span>{t('header.menuThemeLabel')}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {isDark ? t('header.themeDark') : t('header.themeLight')}
      </span>
    </button>
  );
}

function MobileLanguageToggle() {
  const { t, locale, setLocale } = useI18n();
  const mounted = useMounted();
  const current = mounted ? locale : 'id';
  const next = current === 'id' ? 'en' : 'id';
  return (
    <button
      onClick={() => setLocale(next)}
      className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
      aria-label={t('header.menuLanguageLabel')}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <span className="text-brand font-bold text-[11px]">{(current || 'id').toUpperCase()}</span>
      </span>
      <span>{t('header.menuLanguageLabel')}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {current === 'id' ? t('header.menuLanguageId') : t('header.menuLanguageEn')}
      </span>
    </button>
  );
}

function MobileSettingsButton({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const openSettings = useUIStore((s) => s.openSettings);
  return (
    <button
      onClick={() => {
        openSettings();
        onDone();
      }}
      className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
      aria-label={t('header.menuSettingsLabel')}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center text-brand">⚙</span>
      <span>{t('header.menuSettingsLabel')}</span>
    </button>
  );
}

function MobilePwaInstall({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true);
      return;
    }
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as any);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast.success(t('header.menuInstallLabel'));
    };
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [t]);

  // Show only when relevant: installable (Chrome/Android) or iOS (manual flow).
  if (isInstalled) return null;
  if (!isIOS && !deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // iOS — no auto install, just close so user can use Safari share
      onDone();
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success(t('header.menuInstallLabel'));
    }
    setDeferredPrompt(null);
    onDone();
  };

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium hover:bg-secondary text-foreground/90"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center text-brand">📱</span>
      <span>{t('header.menuInstallLabel')}</span>
    </button>
  );
}

function GenreDropdown() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['genres-list'],
    queryFn: async () => {
      const res = await fetch('/api/genres');
      if (!res.ok) throw new Error('genres');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const genres: any[] = data?.genres ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Film className="h-4 w-4" /> {t('nav.genre')}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,520px)] p-3 bg-popover/95 backdrop-blur-xl" align="center">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
            {t('header.selectGenre')}
          </span>
          <span className="text-xs text-foreground/60">{t('common.genreCount').replace('{n}', String(genres.length))}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[320px] overflow-y-auto scrollbar-anichin">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 rounded shimmer" />
              ))
            : genres.map((g) => (
            <Link
              key={g.id}
              href={`#genres`}
              className="flex items-center justify-between px-2.5 py-1.5 rounded text-xs hover:bg-amber-500/15 hover:text-amber-400 transition-colors border border-transparent hover:border-amber-500/30"
            >
              <span className="truncate">{g.name}</span>
              <span className="text-xs text-foreground/60 ml-1">{g.count}</span>
            </Link>
            ))
          }
        </div>
      </PopoverContent>
    </Popover>
  );
}

const TICKERS = [
  'Shadow Blade EP 12 sudah tayang!',
  'Demon Hunter EP 18 — duel akhir para Pemburu',
  'Neon Samurai: new episode tiap Sabtu',
  "Dragon's Legacy — skor 8.7 minggu ini",
  'Celestial Academy — sub Indo HD 1080p',
  'Jadwal rilis harian sudah diperbarui',
];

/**
 * Mobile-only auth section — rendered inside the mobile Sheet menu.
 * Shows Login + Daftar buttons side-by-side when the user is unauthenticated.
 * When authenticated, the header avatar already gives access, so this renders null.
 */
function MobileAuthSection({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { isAuthenticated, isLoading } = useAuth();
  const mounted = useMounted();

  // Wait for session to resolve before deciding to render.
  if (!mounted || isLoading || isAuthenticated) return null;

  return (
    <div className="px-4 pt-4 pb-6 border-t border-border mt-2 space-y-2">
      <Link
        href="/auth/login"
        onClick={onDone}
        className="flex items-center justify-center gap-2 h-11 rounded-md border border-border bg-secondary/70 hover:bg-secondary text-sm font-medium text-foreground transition-colors"
      >
        <LogIn className="h-4 w-4" />
        {t('header.menuLoginLabel')}
      </Link>
      <Link
        href="/auth/register"
        onClick={onDone}
        className="flex items-center justify-center gap-2 h-11 rounded-md bg-brand text-brand-foreground hover:bg-brand/90 text-sm font-semibold transition-colors"
      >
        <UserPlus className="h-4 w-4" />
        {t('header.menuRegisterLabel')}
      </Link>
    </div>
  );
}

