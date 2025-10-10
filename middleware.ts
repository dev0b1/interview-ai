import { NextRequest, NextResponse } from 'next/server';

// Paths that require authentication
const protectedPaths = ['/dashboard', '/interview', '/interviews', '/settings', '/history'];

function isProtected(pathname: string) {
  return protectedPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (!isProtected(pathname)) return NextResponse.next();

  const token = req.cookies.get('sb_access_token')?.value;
  if (!token) {
    const url = new URL('/auth', req.url);
    return NextResponse.redirect(url);
  }

  // Basic JWT expiry check
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (typeof payload.exp === 'number') {
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
          const url = new URL('/auth', req.url);
          return NextResponse.redirect(url);
        }
      }
    }
  } catch {
    const url = new URL('/auth', req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/interview/:path*', '/interviews/:path*', '/settings/:path*', '/history/:path*'],
};
