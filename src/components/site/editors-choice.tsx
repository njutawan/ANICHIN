'use client';

import { AnimeImage } from './anime-image';
import { useQuery } from '@tanstack/react-query';
import { Quote, ChevronRight } from 'lucide-react';
import { SectionHeading } from './latest-updates';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import type { AnimeCardData } from '@/lib/types';
import { Star } from 'lucide-react';

interface EditorialPick {
  slug: string;
  quote: string;
  author: string;
  role: string;
  accent: string;
}

const EDITORIAL: EditorialPick[] = [
  {
    slug: 'shadow-blade',
    quote: 'Animasinya gila, ceritanya gelap tapi nggak berlebihan. Tiap episode nanggung buat berhenti.',
    author: 'Rina S.',
    role: 'Senior Editor',
    accent: 'from-red-500/20 to-transparent border-red-500/30',
  },
  {
    slug: 'demon-hunter',
    quote: 'Fight scene terbaik musim ini. Emosinya berasa banget, bukan cuma pukul-pukulan doang.',
    author: 'Arif P.',
    role: 'Action Specialist',
    accent: 'from-amber-500/20 to-transparent border-amber-500/30',
  },
  {
    slug: 'starlight-requiem',
    quote: 'Soundtrack-nya bikin merinding. Visual space-nya aesthetic parah. Nggak nyesel marathon.',
    author: 'Maya K.',
    role: 'Music Editor',
    accent: 'from-blue-500/20 to-transparent border-blue-500/30',
  },
  {
    slug: 'cherry-blossom',
    quote: 'Slow burn yang worth it. Romance-nya gentle, nggak cringe. Cocok buat healing.',
    author: 'Yuki T.',
    role: 'Romance Editor',
    accent: 'from-pink-500/20 to-transparent border-pink-500/30',
  },
];

export function EditorsChoice() {
  const openDetail = useUIStore((s) => s.openDetail);
  const { data, isLoading } = useQuery({
    queryKey: ['editorial-picks'],
    queryFn: async () => {
      const slugs = EDITORIAL.map((e) => e.slug).join(',');
      const res = await fetch(`/api/anime?slugs=${encodeURIComponent(slugs)}&limit=4`);
      if (!res.ok) throw new Error('editorial');
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const animes: AnimeCardData[] = data?.animes ?? [];

  if (!isLoading && animes.length === 0) return null;

  return (
    <section className="py-8">
      <SectionHeading
        title="Pilihan Editor"
        subtitle="Tim redaksi pilih buat kamu"
        icon={Quote}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {animes.map((anime, i) => {
            const editorial = EDITORIAL.find((e) => e.slug === anime.slug) ?? EDITORIAL[0];
            return (
              <button
                key={anime.id}
                onClick={() => openDetail(anime.slug)}
                className={cn(
                  'group relative flex gap-4 p-4 rounded-xl border bg-gradient-to-br hover:border-brand/40 transition-all text-left overflow-hidden',
                  editorial.accent
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Poster */}
                <div className="relative shrink-0 w-20 sm:w-24 aspect-[2/3] rounded-lg overflow-hidden border border-border/60">
                  <AnimeImage src={anime.poster} alt={anime.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 flex flex-col">
                  {/* Quote */}
                  <div className="flex-1">
                    <Quote className="h-4 w-4 text-brand/40 mb-1 shrink-0" />
                    <p className="text-xs sm:text-sm text-foreground/80 italic leading-relaxed line-clamp-3">
                      "{editorial.quote}"
                    </p>
                  </div>

                  {/* Author + Anime */}
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center text-brand-foreground text-xs font-bold shrink-0">
                        {editorial.author.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{editorial.author}</div>
                        <div className="text-xs text-muted-foreground">{editorial.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs font-bold truncate group-hover:text-brand transition-colors">{anime.title}</span>
                      <span className="flex items-center gap-0.5 text-xs text-brand font-semibold shrink-0">
                        <Star className="h-2.5 w-2.5 fill-brand" />{anime.score.toFixed(1)}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
