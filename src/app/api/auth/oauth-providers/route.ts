import { NextResponse } from 'next/server';

/**
 * GET /api/auth/oauth-providers
 *
 * Returns list of enabled OAuth providers (excluding 'credentials').
 * Used by login/register pages to dynamically render OAuth buttons
 * only when the provider is actually configured (avoids "redirect_uri_mismatch"
 * errors when users click buttons for unconfigured providers).
 *
 * Response:
 *   {
 *     "providers": [
 *       { "id": "google", "name": "Google", "icon": "chrome" },
 *       { "id": "github", "name": "GitHub", "icon": "github" }
 *     ]
 *   }
 *
 * No auth required (public endpoint — needed before user signs in).
 */
export async function GET() {
  const providers: Array<{ id: string; name: string; icon: string }> = [];

  // Google OAuth
  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0
  ) {
    providers.push({
      id: 'google',
      name: 'Google',
      icon: 'chrome',
    });
  }

  // GitHub OAuth
  if (
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    process.env.GITHUB_CLIENT_ID.length > 0 &&
    process.env.GITHUB_CLIENT_SECRET.length > 0
  ) {
    providers.push({
      id: 'github',
      name: 'GitHub',
      icon: 'github',
    });
  }

  // Cache for 1 hour (env var changes require server restart anyway)
  return NextResponse.json(
    { providers },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}
