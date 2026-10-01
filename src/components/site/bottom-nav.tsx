'use client';

import { useState, useEffect } from 'react';
import { Home, Film, CalendarDays, Bookmark, Search } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { useI18n } from '@/lib/i18n-context';

const NAV_ITEMS = [
  { labelKey: 'nav.home', href: '#home', icon: Home },
  { labelKey: 'nav.anime', href: '#list', icon: Film },
  { labelKey: 'nav.searchShort', href: 'search', icon: Search },
  { labelKey: 'nav.schedule', href: '#schedule', icon: CalendarDays },
  { labelKey: 'nav.bookmark', href: '#bookmark', icon: Bookmark },
];

export function BottomNav() {
  const { t } = useI18n();
  const mounted = useMounted();
  const openSearchModal = useUIStore((s) => s.openSearchModal);
  const bookmarkCount = useUIStore((s) => s.bookmarks.length);
  const [activeHash, setActiveHash] = useState('#home');

  useEffect(() => {
    const onHashChange = () => setActiveHash(window.location.hash || '#home');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleClick = (item: typeof NAV_ITEMS[number]) => {
    if (item.href === 'search') {
      openSearchModal();
      return;
    }
    // Smooth scroll to section
    const el = document.querySelector(item.href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveHash(item.href);
    }
  };

  if (!mounted) return null;

  return (
    <nav className="bottom-nav lg:hidden" aria-label={t('nav.mainNav')}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeHash === item.href;
        const label = t(item.labelKey);
        return (
          <button
            key={item.labelKey}
            onClick={() => handleClick(item)}
            className={cn('bottom-nav-item', isActive && 'active')}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className="h-5 w-5" />
            <span>{label}</span>
            {item.labelKey === 'nav.bookmark' && bookmarkCount > 0 && (
              <span className="absolute -top-0.5 right-1 h-3.5 min-w-3.5 px-1 rounded-full bg-brand text-brand-foreground text-xs font-bold flex items-center justify-center">
                {bookmarkCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
