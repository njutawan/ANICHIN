import { ImageResponse } from 'next/og';

export const alt = 'AniChin — Nonton Anime Subtitle Indonesia Terlengkap';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
        {/* Logo */}
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
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

        {/* Tagline */}
        <div
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#fff',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.3,
          }}
        >
          Nonton Anime Subtitle Indonesia Terlengkap
        </div>

        {/* Features */}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginTop: '32px',
          }}
        >
          {['HD 1080p', 'Sub Indo', 'Gratis', 'Update Tiap Hari'].map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 20px',
                borderRadius: '999px',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                color: '#fbbf24',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
