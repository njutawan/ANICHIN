'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log full error server-side only (Next.js captures this); never expose to user
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
  }, [error]);

  // In production, hide error.message — only show digest (Next.js error ID)
  const isProd = process.env.NODE_ENV === 'production';
  const displayMessage = isProd
    ? 'Terjadi kesalahan tak terduga. Tim kami sudah diberi notifikasi.'
    : (error?.message || 'Unknown error');

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#fbbf24', background: '#0d0d12', minHeight: '100vh' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Terjadi kesalahan
          </h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.5 }}>
            {displayMessage}
          </pre>
          {error?.digest && (
            <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '1rem' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#fbbf24',
              color: '#000',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
