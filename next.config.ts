import type { NextConfig } from "next";
import { resolveImageRemotePatterns } from "./src/lib/image-hosts";

// Detect Vercel deployment (Vercel sets VERCEL=1 env var automatically)
const isVercel = process.env.VERCEL === "1";
// Detect Docker/standalone target (set via build arg or env)
const isStandalone = !isVercel && process.env.DEPLOY_TARGET === "standalone";

const nextConfig: NextConfig = {
  // Only use "standalone" output for Docker deployment.
  // Vercel has native Next.js support — standalone output would actually break Vercel deploys.
  ...(isStandalone ? { output: "standalone" as const } : {}),
  typescript: { ignoreBuildErrors: false },

  /**
   * P0-7: `/ja` dulu halaman salinan homepage berbahasa Indonesia dengan
   * metadata Jepang + `hreflang="ja-JP"` (duplikat konten & sinyal bahasa
   * bohong). Rutenya dihapus; URL lama diarahkan permanen (301) supaya tidak
   * menjadi 404 di hasil pencarian. Kalau nanti kamus `ja` benar-benar
   * ditambahkan: hapus redirect ini dan daftarkan `ja` di ROUTE_LOCALES
   * (src/lib/i18n.ts) + LOCALES sitemap.
   */
  async redirects() {
    return [
      { source: '/ja', destination: '/', permanent: true },
      { source: '/ja/:path*', destination: '/:path*', permanent: true },
    ];
  },
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  
  // Performance: optimize package imports (tree-shake large libs)
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
    ],
  },
  
  images: {
    formats: ['image/avif', 'image/webp'],
    /**
     * P1-5: sebelumnya `hostname: '**'` — siapa pun bisa memakai
     * `/_next/image?url=…` sebagai optimizer/proxy gratis untuk domain apa pun.
     * Sekarang hanya CDN yang dikenal (src/lib/image-hosts.ts) + tambahan dari
     * env NEXT_PUBLIC_IMAGE_HOSTS, mis.
     *   NEXT_PUBLIC_IMAGE_HOSTS="cdn.saya.id, *.bunnycdn.com"
     * Gambar dari host lain tetap tampil di browser (langsung dari sumbernya,
     * lihat `needsUnoptimized`) — hanya tidak dioptimasi server kita.
     */
    remotePatterns: resolveImageRemotePatterns(process.env.NEXT_PUBLIC_IMAGE_HOSTS),
    minimumCacheTTL: 3600,
    // Perf: limit generated widths so we never emit oversized variants
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

/**
 * Nama paket disimpan di variabel — bukan string literal — supaya `tsc`
 * (dijalankan `next build`) tidak wajib me-resolve tipe devDependency yang
 * memang tidak ada di instalasi produksi (`npm ci --omit=dev`). Dengan
 * spesifier literal, import dinamis tetap menabrak error TS2307.
 */
const ANALYZER_PACKAGE = "@next/bundle-analyzer";

/**
 * P1-12: `@next/bundle-analyzer` adalah **devDependency**. Kalau di-import di
 * top-level (seperti sebelumnya), `npm ci --omit=dev` / image produksi gagal
 * memuat `next.config.ts` sama sekali — padahal build produksi tidak pernah
 * butuh analyzer. Karena itu konfigurasi diekspor sebagai fungsi async yang
 * meng-`import()` analyzer secara **kondisional & lazy**: hanya saat
 * `ANALYZE=true`, dan kalau paketnya memang tidak terpasang kita lanjut build
 * tanpa analisis (peringatan, bukan crash).
 *
 * Next 16 mendukung ekspor fungsi: `config(phase, { defaultConfig })` di-await
 * sebelum dinormalisasi (lihat `normalizeConfig` di next/dist/server).
 */
export default async function config(): Promise<NextConfig> {
  if (process.env.ANALYZE !== 'true') return nextConfig;

  try {
    // Bentuk modul ditipekan manual karena spesifiernya bukan literal.
    const analyzer = (await import(ANALYZER_PACKAGE)) as unknown as {
      default: (options: { enabled: boolean }) => (config: NextConfig) => NextConfig;
    };
    return analyzer.default({ enabled: true })(nextConfig);
  } catch (error) {
    console.warn(
      '[next.config] ANALYZE=true diabaikan: devDependency @next/bundle-analyzer ' +
        'tidak terpasang. Jalankan `npm install` (tanpa --omit=dev) lalu coba lagi. ' +
        `Penyebab: ${error instanceof Error ? error.message : String(error)}`,
    );
    return nextConfig;
  }
}
