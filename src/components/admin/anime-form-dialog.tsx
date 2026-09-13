'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

export interface AnimeFormValues {
  title: string;
  titleEn?: string | null;
  titleJp?: string | null;
  alternativeTitle?: string | null;
  synopsis: string;
  poster: string;
  banner?: string | null;
  type: string;
  status: string;
  studio?: string | null;
  source?: string | null;
  releasedYear?: number | null;
  season?: string | null;
  score?: number;
  rating?: string | null;
  views?: number;
  duration?: string | null;
  airedDay?: string | null;
  trailer?: string | null;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  rank?: number | null;
  totalEpisodes?: number | null;
  releasedEpisodes?: number | null;
  genres: string[];
  slug?: string;
}

interface AnimeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, edit mode. When null, create mode. */
  anime?: Partial<AnimeFormValues> & { id?: string } | null;
}

const EMPTY_FORM: AnimeFormValues = {
  title: '',
  titleEn: '',
  titleJp: '',
  alternativeTitle: '',
  synopsis: '',
  poster: '',
  banner: '',
  type: 'TV',
  status: 'Ongoing',
  studio: '',
  source: '',
  releasedYear: null,
  season: '',
  score: 0,
  rating: '',
  views: 0,
  duration: '',
  airedDay: '',
  trailer: '',
  featured: false,
  trending: false,
  popular: false,
  rank: null,
  totalEpisodes: null,
  releasedEpisodes: null,
  genres: [],
  slug: '',
};

const ANIME_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
const ANIME_STATUSES = ['Ongoing', 'Completed', 'Upcoming'];
const ANIME_SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
const AIRED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function AnimeFormDialog({ open, onOpenChange, anime }: AnimeFormDialogProps) {
  const qc = useQueryClient();
  const isEdit = !!anime?.id;

  const [values, setValues] = useState<AnimeFormValues>(EMPTY_FORM);
  const [genresText, setGenresText] = useState('');

  useEffect(() => {
    if (!open) return;
    if (anime) {
      setValues({
        ...EMPTY_FORM,
        ...anime,
        genres: anime.genres ?? [],
      } as AnimeFormValues);
      setGenresText((anime.genres ?? []).join(', '));
    } else {
      setValues(EMPTY_FORM);
      setGenresText('');
    }
  }, [open, anime]);

  function update<K extends keyof AnimeFormValues>(key: K, value: AnimeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const genres = genresText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: AnimeFormValues = {
        ...values,
        // Convert empty strings to null where appropriate — server normalises too
        releasedYear: values.releasedYear || null,
        totalEpisodes: values.totalEpisodes || null,
        releasedEpisodes: values.releasedEpisodes || null,
        rank: values.rank || null,
        genres,
      };

      const url = isEdit
        ? `/api/admin/anime/${anime!.id}`
        : '/api/admin/anime';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan anime.');
      }
      return data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Anime diperbarui.' : 'Anime ditambahkan.');
      qc.invalidateQueries({ queryKey: ['admin-anime'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      toast.error('Judul wajib diisi.');
      return;
    }
    if (!values.synopsis.trim()) {
      toast.error('Sinopsis wajib diisi.');
      return;
    }
    if (!values.poster.trim()) {
      toast.error('URL poster wajib diisi.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Anime' : 'Tambah Anime Baru'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Perbarui informasi anime. Perubahan langsung tersimpan ke database.'
              : 'Lengkapi form berikut untuk menambahkan anime baru ke katalog.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Judul" required className="sm:col-span-2">
              <Input
                value={values.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Contoh: Shadow Blade Chronicles"
                required
                maxLength={200}
              />
            </Field>

            <Field label="Judul (Inggris)">
              <Input
                value={values.titleEn ?? ''}
                onChange={(e) => update('titleEn', e.target.value)}
                placeholder="English title"
              />
            </Field>

            <Field label="Judul (Jepang)">
              <Input
                value={values.titleJp ?? ''}
                onChange={(e) => update('titleJp', e.target.value)}
                placeholder="Japanese title (romaji/kanji)"
              />
            </Field>

            <Field label="Sinopsis" required className="sm:col-span-2">
              <Textarea
                value={values.synopsis}
                onChange={(e) => update('synopsis', e.target.value)}
                placeholder="Deskripsi singkat anime…"
                required
                rows={4}
                className="resize-y"
              />
            </Field>

            <Field label="URL Poster" required>
              <Input
                value={values.poster}
                onChange={(e) => update('poster', e.target.value)}
                placeholder="https://…/poster.jpg"
                required
              />
            </Field>

            <Field label="URL Banner">
              <Input
                value={values.banner ?? ''}
                onChange={(e) => update('banner', e.target.value)}
                placeholder="https://…/banner.jpg"
              />
            </Field>

            <Field label="Tipe">
              <SelectNative
                value={values.type}
                onChange={(v) => update('type', v)}
                options={ANIME_TYPES}
              />
            </Field>

            <Field label="Status">
              <SelectNative
                value={values.status}
                onChange={(v) => update('status', v)}
                options={ANIME_STATUSES}
              />
            </Field>

            <Field label="Studio">
              <Input
                value={values.studio ?? ''}
                onChange={(e) => update('studio', e.target.value)}
                placeholder="Studio animasi"
              />
            </Field>

            <Field label="Sumber">
              <Input
                value={values.source ?? ''}
                onChange={(e) => update('source', e.target.value)}
                placeholder="Manga, Light Novel, Original…"
              />
            </Field>

            <Field label="Tahun Rilis">
              <Input
                type="number"
                min={1900}
                max={2100}
                value={values.releasedYear ?? ''}
                onChange={(e) =>
                  update('releasedYear', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="2024"
              />
            </Field>

            <Field label="Musim">
              <SelectNative
                value={values.season ?? ''}
                onChange={(v) => update('season', v || null)}
                options={['', ...ANIME_SEASONS]}
                placeholder="—"
              />
            </Field>

            <Field label="Skor (0–10)">
              <Input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={values.score ?? 0}
                onChange={(e) => update('score', Number(e.target.value) || 0)}
              />
            </Field>

            <Field label="Rating">
              <Input
                value={values.rating ?? ''}
                onChange={(e) => update('rating', e.target.value)}
                placeholder="PG-13, R, G…"
              />
            </Field>

            <Field label="Total Episode">
              <Input
                type="number"
                min={0}
                value={values.totalEpisodes ?? ''}
                onChange={(e) =>
                  update('totalEpisodes', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="12"
              />
            </Field>

            <Field label="Episode Dirilis">
              <Input
                type="number"
                min={0}
                value={values.releasedEpisodes ?? ''}
                onChange={(e) =>
                  update('releasedEpisodes', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="8"
              />
            </Field>

            <Field label="Peringkat (Rank)">
              <Input
                type="number"
                min={1}
                value={values.rank ?? ''}
                onChange={(e) =>
                  update('rank', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="#1"
              />
            </Field>

            <Field label="Views">
              <Input
                type="number"
                min={0}
                value={values.views ?? 0}
                onChange={(e) => update('views', Number(e.target.value) || 0)}
              />
            </Field>

            <Field label="Durasi">
              <Input
                value={values.duration ?? ''}
                onChange={(e) => update('duration', e.target.value)}
                placeholder="24 min"
              />
            </Field>

            <Field label="Hari Tayang">
              <SelectNative
                value={values.airedDay ?? ''}
                onChange={(v) => update('airedDay', v || null)}
                options={['', ...AIRED_DAYS]}
                placeholder="—"
              />
            </Field>

            <Field label="URL Trailer" className="sm:col-span-2">
              <Input
                value={values.trailer ?? ''}
                onChange={(e) => update('trailer', e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
              />
            </Field>

            <Field label="Slug (opsional)" className="sm:col-span-2">
              <Input
                value={values.slug ?? ''}
                onChange={(e) => update('slug', e.target.value)}
                placeholder="Otomatis dari judul bila kosong"
              />
            </Field>

            <Field label="Genre (pisahkan dengan koma)" className="sm:col-span-2">
              <Input
                value={genresText}
                onChange={(e) => setGenresText(e.target.value)}
                placeholder="Action, Fantasy, Drama"
              />
            </Field>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ToggleCheck
                label="Featured"
                checked={values.featured}
                onChange={(v) => update('featured', v)}
              />
              <ToggleCheck
                label="Trending"
                checked={values.trending}
                onChange={(v) => update('trending', v)}
              />
              <ToggleCheck
                label="Popular"
                checked={values.popular}
                onChange={(v) => update('popular', v)}
              />
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Tambah Anime'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Field wrapper ──
function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ''}`}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Toggle checkbox row ──
function ToggleCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border"
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

// ── Native styled select ──
function SelectNative({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-background text-foreground">
          {opt || placeholder || '—'}
        </option>
      ))}
    </select>
  );
}
