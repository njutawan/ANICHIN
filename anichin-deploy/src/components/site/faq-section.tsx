'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { SectionHeading } from './latest-updates';
import { cn } from '@/lib/utils';

const FAQS = [
  {
    q: 'Apa itu AniChin?',
    a: 'AniChin adalah situs nonton dan download anime subtitle Indonesia terlengkap. Kami menyediakan streaming anime terbaru, movie, dan ongoing dengan kualitas HD 1080p gratis. Katalog kami mencakup 60+ anime dari berbagai genre — Action, Fantasy, Romance, Mecha, Supernatural, dan banyak lagi.',
  },
  {
    q: 'Apakah AniChin gratis?',
    a: 'Ya, AniChin 100% gratis. Anda dapat menonton dan mendownload anime subtitle Indonesia tanpa biaya apa pun. Tidak ada registrasi wajib, tidak ada paywall. Cukup buka situs, pilih anime, dan langsung tonton.',
  },
  {
    q: 'Berapa kualitas video yang tersedia di AniChin?',
    a: 'AniChin menyediakan anime dalam tiga pilihan kualitas: 360p (hemat kuota), 720p (HD), dan 1080p (Full HD). Semua video dilengkapi subtitle Bahasa Indonesia. Untuk download, tersedia link dengan ketiga kualitas tersebut untuk setiap episode.',
  },
  {
    q: 'Kapan update episode terbaru di AniChin?',
    a: 'Episode anime terbaru diupdate setiap hari. Kami memantau jadwal rilis dari studio Jepang dan menambahkan subtitle Indonesia secepat mungkin. Anda dapat melihat jadwal rilis harian di bagian "Jadwal Rilis" untuk mengetahui anime yang tayang setiap hari (Senin sampai Minggu).',
  },
  {
    q: 'Bagaimana cara mendownload anime di AniChin?',
    a: 'Untuk mendownload anime: 1) Pilih anime yang ingin Anda download dari daftar. 2) Klik tombol "Detail" pada poster anime. 3) Buka tab "Download" di modal detail. 4) Pilih episode yang ingin diunduh. 5) Klik link download sesuai kualitas yang diinginkan (360p/720p/1080p).',
  },
  {
    q: 'Apakah AniChin bisa diakses di mobile?',
    a: 'Ya, AniChin sepenuhnya responsif dan dapat diakses di semua perangkat — smartphone (Android/iOS), tablet, dan desktop. Tampilan otomatis menyesuaikan ukuran layar Anda dengan layout yang optimal. Tersedia juga fitur bookmark, continue watching, dan riwayat tontonan yang tersimpan di perangkat Anda.',
  },
  {
    q: 'Genre anime apa saja yang tersedia di AniChin?',
    a: 'AniChin memiliki 22+ genre anime: Action, Adventure, Comedy, Drama, Fantasy, Sci-Fi, Romance, Supernatural, Mystery, Slice of Life, Mecha, School, Historical, Horror, Psychological, Sports, Music, Thriller, Magic, Demons, dan lainnya. Gunakan filter genre di bagian "Daftar Anime" untuk menemukan anime sesuai preferensi Anda.',
  },
  {
    q: 'Apakah AniChin menyimpan file di server sendiri?',
    a: 'Tidak. AniChin tidak menyimpan file apa pun di server kami. Kami hanya menautkan ke media yang sudah tersedia di internet. Semua konten adalah hak cipta dari pemiliknya masing-masing. Jika Anda memiliki masalah hak cipta, silakan hubungi kami untuk penghapusan.',
  },
];

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="py-8 scroll-mt-24">
      <SectionHeading
        title="FAQ"
        subtitle="Pertanyaan yang sering masuk"
        icon={ChevronDown}
      />

      <div className="mt-5 max-w-3xl mx-auto space-y-2">
        {FAQS.map((faq, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/60 bg-card/40 overflow-hidden"
          >
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
            >
              <span className="text-sm font-semibold text-balance-fluid">{faq.q}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-brand shrink-0 transition-transform duration-300',
                  openIdx === i && 'rotate-180'
                )}
              />
            </button>
            {openIdx === i && (
              <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed animate-fade-up">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
