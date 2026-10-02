/**
 * Pilihan editor — data statis (bukan dari DB) yang dipakai dua tempat:
 * komponen `EditorsChoice` (client) dan prefetch RSC (butuh daftar slug untuk
 * memanggil `/api/anime?slugs=…`).
 *
 * Dipisah dari komponen supaya server tidak perlu mengimpor modul client.
 */

export interface EditorialPick {
  slug: string;
  quote: string;
  author: string;
  role: string;
  accent: string;
}

export const EDITORIAL_PICKS: EditorialPick[] = [
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

/** Daftar slug untuk query `/api/anime?slugs=…&limit=4`. */
export const EDITORIAL_SLUGS = EDITORIAL_PICKS.map((e) => e.slug).join(',');
