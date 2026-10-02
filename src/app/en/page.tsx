import { HomeContent } from '@/components/home/home-content';

/**
 * English homepage.
 *
 * Kontennya sama dengan `/` (judul anime tetap bahasa aslinya), tetapi
 * metadata/`<html lang>` per-rute memberi sinyal bahasa yang benar ke Google
 * (hreflang `en-US` → `/en`).
 */
export default function EnHome() {
  return <HomeContent />;
}
