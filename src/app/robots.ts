import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /admin & /auth tidak boleh diindeks (halaman admin juga di-noindex
        // lewat metadata di src/app/admin/layout.tsx sebagai defense in depth).
        disallow: ['/api/', '/admin', '/admin/', '/auth/', '/offline'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/admin', '/auth/', '/offline'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/api/', '/admin', '/auth/', '/offline'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
