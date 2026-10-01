'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Flame, Github, Twitter, Youtube, Send, Heart, Mail, Bell, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

interface FooterLinkCol {
  titleKey: string;
  links: { labelKey: string; href: string }[];
}

const FOOTER_LINKS: FooterLinkCol[] = [
  {
    titleKey: 'footer.colNavigation',
    links: [
      { labelKey: 'footer.linkHome', href: '#home' },
      { labelKey: 'footer.linkAnimeList', href: '#list' },
      { labelKey: 'footer.linkSchedule', href: '#schedule' },
      { labelKey: 'footer.linkGenre', href: '#genres' },
      { labelKey: 'footer.linkBookmark', href: '#bookmark' },
    ],
  },
  {
    titleKey: 'footer.colTypes',
    links: [
      // Anime-type names — kept literal (industry standard proper nouns).
      { labelKey: '', href: '#list' }, // TV Series
      { labelKey: '', href: '#list' }, // Movie
      { labelKey: '', href: '#list' }, // OVA
      { labelKey: '', href: '#list' }, // ONA
      { labelKey: '', href: '#list' }, // Special
    ],
  },
  {
    titleKey: 'footer.colHelp',
    links: [
      { labelKey: 'footer.linkHowToDownload', href: '#' },
      { labelKey: 'footer.linkReportBroken', href: '#' },
      { labelKey: 'footer.linkRequestAnime', href: '#' },
      { labelKey: 'footer.linkFaq', href: '#' },
      { labelKey: 'footer.linkDmca', href: '#' },
    ],
  },
];

// Anime-type names are the same across locales (industry proper nouns).
const TYPE_LABELS = ['TV Series', 'Movie', 'OVA', 'ONA', 'Special'];

export function Footer() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.error(t('footer.emailInvalid'));
      return;
    }
    toast.success(t('footer.subscribeSuccess'), {
      description: t('footer.subscribeSuccessDesc'),
      duration: 3000,
    });
    setEmail('');
  };

  const toggleSection = (title: string) => {
    setOpenSection(openSection === title ? null : title);
  };

  return (
    <footer role="contentinfo" className="mt-auto border-t border-border bg-card/40 backdrop-blur">
      {/* CTA strip — compact */}
      <div className="border-b border-border/60 bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/10">
        <div className="container-fluid py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              {t('footer.updateNotification')}
            </h3>
            <p className="text-xs text-foreground/60 mt-1">
              {t('footer.newsletterDesc')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <form onSubmit={handleSubscribe} className="flex items-center gap-1.5">
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40" />
                <input
                  type="email"
                  placeholder={t('footer.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-44 sm:w-52 rounded-md border border-border bg-background/60 pl-8 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-amber-400 focus:outline-none transition-colors"
                  maxLength={50}
                />
              </div>
              <button
                type="submit"
                className="h-10 bg-amber-500 text-black hover:bg-amber-400 transition-colors rounded-md px-4 text-sm font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Bell className="h-3.5 w-3.5" /> {t('footer.subscribe')}
              </button>
            </form>
            <div className="flex items-center gap-1">
              {[
                { href: 'https://t.me/anichin', icon: Send, label: 'Telegram' },
                { href: 'https://youtube.com/@anichin', icon: Youtube, label: 'YouTube' },
                { href: 'https://twitter.com/anichin', icon: Twitter, label: 'Twitter' },
                { href: 'https://discord.gg/anichin', icon: Github, label: 'Discord' },
              ].map(({ href, icon: Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="h-10 w-10 rounded-md border border-border bg-background/60 hover:bg-amber-500 hover:text-black hover:border-amber-500 transition-colors flex items-center justify-center"
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main footer — accordion on mobile, grid on desktop */}
      <div className="container-fluid py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-8">
          {/* Brand — always visible */}
          <div className="lg:col-span-1">
            <Link href="#home" className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-black">
                A
              </div>
              <span className="text-lg font-black">
                ANI<span className="text-amber-400">CHIN</span>
              </span>
            </Link>
            <p className="text-sm text-foreground/70 leading-relaxed mb-3">
              {t('footer.description')}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-secondary/70 border border-border/60 text-foreground/80">{t('footer.badgeHD')}</span>
              <span className="px-2 py-0.5 rounded bg-secondary/70 border border-border/60 text-foreground/80">{t('footer.badgeSubIndo')}</span>
              <span className="px-2 py-0.5 rounded bg-secondary/70 border border-border/60 text-foreground/80">{t('footer.badgeFree')}</span>
            </div>
          </div>

          {/* Link sections — accordion on mobile, expanded on desktop */}
          {FOOTER_LINKS.map((col) => {
            const title = t(col.titleKey);
            return (
              <div key={col.titleKey} className="border-b border-border/40 lg:border-0">
                {/* Header button (mobile: toggle, desktop: static) */}
                <button
                  onClick={() => toggleSection(col.titleKey)}
                  className="w-full lg:cursor-default flex items-center justify-between py-3 lg:py-0 lg:mb-3"
                  aria-expanded={openSection === col.titleKey}
                >
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span className="h-3 w-1 rounded-full bg-amber-400" />
                    {title}
                  </h4>
                  {/* Chevron only on mobile */}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-foreground/60 transition-transform lg:hidden',
                      openSection === col.titleKey && 'rotate-180'
                    )}
                  />
                </button>
                {/* Links — hidden on mobile unless open, always visible on desktop */}
                <ul
                  className={cn(
                    'space-y-2 overflow-hidden transition-all',
                    openSection === col.titleKey ? 'max-h-96 pb-4 lg:pb-0' : 'max-h-0 lg:max-h-96'
                  )}
                >
                  {col.links.map((l, i) => (
                    <li key={`${l.labelKey}-${i}`}>
                      <Link
                        href={l.href}
                        className="text-sm text-foreground/70 hover:text-amber-400 transition-colors"
                      >
                        {col.titleKey === 'footer.colTypes' ? TYPE_LABELS[i] : t(l.labelKey)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Disclaimer — compact */}
        <div className="mt-6 p-3 rounded-lg border border-border/60 bg-background/40 text-xs text-foreground/60 leading-relaxed">
          <strong className="text-foreground/80">{t('footer.disclaimerLabel')}</strong>{' '}
          {t('footer.disclaimerFull')}
        </div>
      </div>

      {/* Bottom bar — compact */}
      <div className="border-t border-border/60 bg-background/60">
        <div className="container-fluid py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-foreground/60">
          <p>
            © {new Date().getFullYear()} <span className="text-amber-400 font-bold">AniChin</span>.
            {t('footer.madeWith')} <Heart className="h-3 w-3 inline fill-amber-400 text-amber-400" /> {t('footer.forAnimeLovers')}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/#faq" className="hover:text-amber-400 transition-colors">{t('footer.privacyPolicy')}</Link>
            <span className="opacity-30">|</span>
            <Link href="/#faq" className="hover:text-amber-400 transition-colors">{t('footer.terms')}</Link>
            <span className="opacity-30">|</span>
            <Link href="https://t.me/anichin" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">{t('footer.contact')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
