import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { ThemeManager } from "@/components/site/theme-manager";
import { ClientEnhancements } from "@/components/client-enhancements";
import { EmailVerificationBanner } from "@/components/site/email-verification-banner";
import { sanitizeForJSONLD } from "@/lib/security";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { SITE_URL } from '@/lib/site';

/**
 * Every route is rendered per-request.
 *
 * Two reasons (both verified against Next 16):
 * 1. CSP: `src/proxy.ts` issues a per-request nonce. Nonces can only be
 *    injected into HTML that is rendered per-request — a prerendered page is
 *    generated once at build time, never gets a nonce, and `'strict-dynamic'`
 *    then blocks every script in production (page renders but never hydrates).
 * 2. Build isolation: the home/en pages query PostgreSQL through server
 *    components. Prerendering them would require a reachable database during
 *    `next build` (which the Dockerfile/CI build stages do not have).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AniChin — Nonton Anime Subtitle Indonesia Terlengkap",
    template: "%s",
  },
  description:
    "AniChin adalah situs nonton dan download anime subtitle Indonesia terlengkap. Streaming anime terbaru, movie, dan ongoing dengan kualitas HD 1080p gratis. Update episode setiap hari.",
  keywords: [
    "anichin", "anime sub indo", "nonton anime", "download anime sub indo",
    "streaming anime", "anime terbaru", "anime ongoing", "anime HD 1080p",
    "anime sub indonesia", "nonton anime gratis", "anime batch", "samehadaku alternatif",
  ],
  authors: [{ name: "Tim Editorial AniChin", url: SITE_URL }],
  creator: "AniChin",
  publisher: "AniChin",
  applicationName: "AniChin",
  category: "Entertainment",
  classification: "Anime Streaming & Download",
  icons: {
    icon: "/logo.svg",
    apple: "/apple-touch-icon.png",
    other: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
    languages: {
      "id-ID": "/",
      "en-US": "/en",
      "x-default": "/",
    },
  },
  openGraph: {
    title: "AniChin — Nonton Anime Subtitle Indonesia Terlengkap",
    description:
      "Streaming dan download anime sub Indo terlengkap. Update episode terbaru setiap hari, kualitas HD 1080p gratis.",
    siteName: "AniChin",
    type: "website",
    url: SITE_URL,
    locale: "id_ID",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AniChin — Anime Subtitle Indonesia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AniChin — Nonton Anime Subtitle Indonesia",
    description: "Streaming dan download anime sub Indo terlengkap, kualitas HD gratis.",
    images: ["/og-image.png"],
    creator: "@anichin",
    site: "@anichin",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  other: {
    "theme-color": "#fbbf24",
    "msapplication-TileColor": "#fbbf24",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce CSP per-request dari src/proxy.ts. Script JSON-LD inline WAJIB
  // memakai nonce ini: CSP produksi memakai 'strict-dynamic' sehingga script
  // tanpa nonce diblokir browser (structured data hilang di produksi).
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // `<html lang>`: sebelumnya hardcoded "id" sehingga /en menyatakan bahasa
  // yang salah ke Google & screen reader. Header ini di-set proxy dari
  // pathname, jadi HTML pertama sudah benar.
  const locale = requestHeaders.get("x-locale") === "en" ? "en" : "id";

  return (
    <html lang={locale} suppressHydrationWarning className="dark">
      <head>
        {/* JSON-LD: WebSite + Organization + SearchAction */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: sanitizeForJSONLD(JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  "url": SITE_URL,
                  "name": "AniChin",
                  "alternateName": "AniChin — Anime Subtitle Indonesia",
                  "description": "Situs nonton dan download anime subtitle Indonesia terlengkap dengan kualitas HD 1080p gratis.",
                  "inLanguage": "id-ID",
                  "publisher": { "@id": `${SITE_URL}/#organization` },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": `${SITE_URL}/?q={search_term_string}`,
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  "name": "AniChin",
                  "url": SITE_URL,
                  "logo": {
                    "@type": "ImageObject",
                    "url": `${SITE_URL}/logo.svg`,
                    "width": 512,
                    "height": 512,
                  },
                  "description": "Platform streaming dan download anime subtitle Indonesia terlengkap dengan kualitas HD 1080p gratis.",
                  "sameAs": [
                    "https://twitter.com/anichin",
                    "https://youtube.com/@anichin",
                    "https://t.me/anichin",
                    "https://discord.gg/anichin",
                    "https://github.com/anichin",
                  ],
                  "areaServed": {
                    "@type": "Country",
                    "name": "Indonesia",
                  },
                  "knowsAbout": [
                    "Anime",
                    "Anime Streaming",
                    "Anime Download",
                    "Subtitle Indonesia",
                    "Japanese Animation",
                    "Anime Series",
                    "Anime Movie",
                    "Anime OVA",
                    "Anime Soundtrack",
                    "Anime News",
                  ],
                },
                {
                  "@type": "WebPage",
                  "@id": `${SITE_URL}/#webpage`,
                  "url": SITE_URL,
                  "name": "AniChin — Nonton Anime Subtitle Indonesia Terlengkap",
                  "description": "Streaming dan download anime sub Indo terlengkap. Update episode terbaru setiap hari, kualitas HD 1080p gratis.",
                  "isPartOf": { "@id": `${SITE_URL}/#website` },
                  "about": { "@id": `${SITE_URL}/#organization` },
                  "inLanguage": "id-ID",
                },
              ],
            })),
          }}
        />
        {/* JSON-LD: BreadcrumbList for homepage */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: sanitizeForJSONLD(JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Beranda", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Anime List", item: `${SITE_URL}/#list` },
                { "@type": "ListItem", position: 3, name: "Jadwal Rilis", item: `${SITE_URL}/#schedule` },
                { "@type": "ListItem", position: 4, name: "Genre", item: `${SITE_URL}/#genres` },
              ],
            })),
          }}
        />
        {/* DNS prefetch for external resources (AniList CDN images) */}
        <link rel="dns-prefetch" href="https://s4.anilist.co" />
        <link rel="preconnect" href="https://s4.anilist.co" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-dvh overflow-x-hidden`}
      >
        {/* Skip-to-content link for keyboard/screen reader users (WCAG AA) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Lewati ke konten utama
        </a>
        <Providers>
          <ThemeManager />
          <EmailVerificationBanner />
          {children}
          <ClientEnhancements />
        </Providers>
        <SonnerToaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
