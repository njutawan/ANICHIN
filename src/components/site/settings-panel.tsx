'use client';

import { useUIStore } from '@/lib/store';
import { ACCENT_COLORS, FONT_SIZES, ACCENT_OKLCH, type AccentColor } from '@/lib/theme-config';
import { useMounted } from '@/hooks/use-mounted';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Sun, Moon, Palette, Type, Layout, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentProtectionToggle } from './content-protection';

export function SettingsButton({ className }: { className?: string } = {}) {
  const mounted = useMounted();
  const openSettings = useUIStore((s) => s.openSettings);

  if (!mounted) {
    return <div className={cn('h-11 w-11 rounded-full bg-secondary/70 border border-border', className)} />;
  }

  return (
    <button
      onClick={openSettings}
      aria-label="Pengaturan tampilan"
      title="Pengaturan tampilan"
      className={cn(
        'relative h-11 w-11 rounded-full border border-border bg-secondary/70 hover:bg-secondary text-foreground hover:text-amber-400 transition-colors flex items-center justify-center overflow-hidden focus-brand',
        className
      )}
    >
      <Palette className="h-4 w-4" />
    </button>
  );
}

export function SettingsPanel() {
  const mounted = useMounted();
  const {
    settingsOpen,
    closeSettings,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    fontSize,
    setFontSize,
    compactMode,
    setCompactMode,
    autoplayHero,
    setAutoplayHero,
  } = useUIStore();

  if (!mounted) return null;

  const handleAccentChange = (color: AccentColor) => {
    setAccentColor(color);
    const config = ACCENT_COLORS[color];
    const oklch = ACCENT_OKLCH[color];
    document.documentElement.style.setProperty('--brand', `oklch(${oklch})`);
    document.documentElement.style.setProperty('--accent', `oklch(${oklch})`);
    document.documentElement.style.setProperty('--ring', `oklch(${oklch})`);
    toast.success(`Warna aksen: ${config.label}`);
  };

  const handleFontChange = (size: 'sm' | 'md' | 'lg') => {
    setFontSize(size);
    const sizeMap: Record<string, string> = { sm: '14px', md: '16px', lg: '18px' };
    // eslint-disable-next-line react-hooks/immutability -- DOM style write is intentional here
    document.documentElement.style.fontSize = sizeMap[size];
    toast.success(`Ukuran font: ${FONT_SIZES[size].label}`);
  };

  const handleReset = () => {
    setTheme('dark');
    setAccentColor('amber');
    setFontSize('md');
    setCompactMode(false);
    setAutoplayHero(true);
    document.documentElement.style.fontSize = '16px';
    document.documentElement.style.setProperty('--brand', 'oklch(0.82 0.16 80)');
    document.documentElement.style.setProperty('--accent', 'oklch(0.82 0.16 80)');
    document.documentElement.style.setProperty('--ring', 'oklch(0.82 0.16 80)');
    toast.success('Pengaturan direset ke default');
  };

  return (
    <Sheet open={settingsOpen} onOpenChange={(o) => !o && closeSettings()}>
      <SheetContent side="right" className="w-[min(92vw,400px)] bg-background border-l border-border p-0 overflow-y-auto">
        <SheetHeader className="px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <SheetTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-amber-400" />
            Pengaturan Tampilan
          </SheetTitle>
          <SheetDescription className="sr-only">
            Kustomisasi tampilan AniChin sesuai preferensimu
          </SheetDescription>
        </SheetHeader>

        <div className="p-5 space-y-6">
          {/* Theme */}
          <section>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-amber-400" />
              Tema
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setTheme('dark'); toast.success('Mode gelap'); }}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all',
                  theme === 'dark' ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:border-foreground/30'
                )}
              >
                <Moon className="h-4 w-4" />
                <span className="text-sm font-medium">Gelap</span>
                {theme === 'dark' && <Check className="h-4 w-4 ml-auto text-amber-400" />}
              </button>
              <button
                onClick={() => { setTheme('light'); toast.success('Mode terang'); }}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all',
                  theme === 'light' ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:border-foreground/30'
                )}
              >
                <Sun className="h-4 w-4" />
                <span className="text-sm font-medium">Terang</span>
                {theme === 'light' && <Check className="h-4 w-4 ml-auto text-amber-400" />}
              </button>
            </div>
          </section>

          {/* Accent Color */}
          <section>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-amber-400" />
              Warna Aksen
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(ACCENT_COLORS).map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleAccentChange(color.name as AccentColor)}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all',
                    accentColor === color.name ? 'border-foreground/40 bg-secondary' : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className="h-8 w-8 rounded-full shadow-lg" style={{ backgroundColor: color.swatch }} />
                  <span className="text-xs font-medium">{color.label}</span>
                  {accentColor === color.name && (
                    <Check className="h-3 w-3 absolute top-2 right-2" style={{ color: color.swatch }} />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Font Size */}
          <section>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Type className="h-4 w-4 text-amber-400" />
              Ukuran Font
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => handleFontChange(size)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
                    fontSize === size ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:border-foreground/30'
                  )}
                >
                  <span className={cn('font-bold', size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg')}>A</span>
                  <span className="text-xs">{FONT_SIZES[size].label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Preferences */}
          <section>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Layout className="h-4 w-4 text-amber-400" />
              Preferensi
            </h3>
            <div className="space-y-2">
              <ContentProtectionToggle />
              <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-foreground/30 cursor-pointer transition-all">
                <div>
                  <div className="text-sm font-medium">Mode Kompak</div>
                  <div className="text-xs text-foreground/60 mt-0.5">Tampilkan lebih banyak anime per baris</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCompactMode(!compactMode)}
                  className={cn('relative h-6 w-11 rounded-full transition-colors', compactMode ? 'bg-amber-500' : 'bg-secondary')}
                >
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', compactMode ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-foreground/30 cursor-pointer transition-all">
                <div>
                  <div className="text-sm font-medium">Auto-play Hero</div>
                  <div className="text-xs text-foreground/60 mt-0.5">Putar slider hero otomatis</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoplayHero(!autoplayHero)}
                  className={cn('relative h-6 w-11 rounded-full transition-colors', autoplayHero ? 'bg-amber-500' : 'bg-secondary')}
                >
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', autoplayHero ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </label>
            </div>
          </section>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-lg border border-border text-sm font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            Reset ke Default
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
