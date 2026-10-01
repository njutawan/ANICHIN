import { ImageResponse } from 'next/og';

export const alt = 'AniChin — Nonton Anime Subtitle Indonesia Terlengkap';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0d0d12 0%, #1a1a24 50%, #0d0d12 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              fontSize: '48px',
              fontWeight: 900,
              color: '#0d0d12',
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: '56px',
                fontWeight: 900,
                color: '#fbbf24',
                letterSpacing: '-1px',
              }}
            >
              ANICHIN
            </div>
            <div
              style={{
                fontSize: '18px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '4px',
                marginTop: '4px',
              }}
            >
              Anime Sub Indo
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#fff',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          Nonton Anime Subtitle Indonesia Terlengkap
        </div>
      </div>
    ),
    size
  );
}
