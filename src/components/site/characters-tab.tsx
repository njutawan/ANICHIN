'use client';

import Image from 'next/image';
import { needsUnoptimized } from '@/lib/image-hosts';
import { Users, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharacterData, StaffData } from '@/lib/types';

interface CharactersTabProps {
  characters: CharacterData[];
  staff: StaffData[];
  animePoster: string;
  animeAccent: string;
}

export function CharactersTab({ characters, staff }: CharactersTabProps) {

  return (
    <div className="space-y-5">
      {/* Characters section */}
      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" /> Karakter
          <span className="text-xs text-muted-foreground font-normal">({characters.length})</span>
        </h3>

        {characters.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Belum ada karakter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {characters.map((c) => (
              <CharacterCard key={c.id} character={c} />
            ))}
          </div>
        )}
      </div>

      {/* Staff section */}
      {staff.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Staff & Produksi
            <span className="text-xs text-muted-foreground font-normal">({staff.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {staff.map((s) => (
              <StaffCard key={s.id} staff={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character }: { character: CharacterData }) {
  const roleColor: Record<string, string> = {
    'Main Protagonist': 'bg-brand/20 text-brand border-brand/40',
    'Main Heroine': 'bg-pink-500/20 text-pink-400 border-pink-500/40',
    'Supporting': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    'Antagonist': 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  const roleClass = roleColor[character.role ?? ''] ?? 'bg-secondary text-muted-foreground border-border';

  return (
    <div className="group flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 hover:bg-brand/5 transition-all">
      {/* Avatar: use anime poster as fallback since characters have no images */}
      <div className="relative shrink-0 h-14 w-14 rounded-lg overflow-hidden border border-border/60">
        {character.image ? (
          <Image
            src={character.image}
            unoptimized={needsUnoptimized(character.image)}
            alt={character.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-secondary to-card flex items-center justify-center">
            <span className="text-lg font-black text-brand">
              {character.name.charAt(0)}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate">{character.name}</span>
          {character.nameJp && (
            <span className="text-xs text-muted-foreground">{character.nameJp}</span>
          )}
        </div>
        {character.role && (
          <span className={cn('inline-block mt-1 text-xs px-1.5 py-0.5 rounded border font-semibold', roleClass)}>
            {character.role}
          </span>
        )}
        {character.description && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
            {character.description}
          </p>
        )}
      </div>
    </div>
  );
}

function StaffCard({ staff }: { staff: StaffData }) {
  return (
    <div className="group flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 hover:bg-brand/5 transition-all">
      <div className="relative shrink-0 h-12 w-12 rounded-lg overflow-hidden border border-border/60">
        {staff.image ? (
          <Image
            src={staff.image}
            unoptimized={needsUnoptimized(staff.image)}
            alt={staff.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-secondary to-card flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate">{staff.name}</span>
          {staff.nameJp && (
            <span className="text-xs text-muted-foreground">{staff.nameJp}</span>
          )}
        </div>
        {staff.role && (
          <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-secondary/70 border border-border/60 text-muted-foreground font-medium">
            {staff.role}
          </span>
        )}
      </div>
    </div>
  );
}
