import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has('pms_access') || req.cookies.has('pms_refresh');
  // Never bounce /login → /. A dead cookie would otherwise ping-pong with the client redirect and refresh forever.
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // everything except the API, Next internals and static files
  matcher: ['/((?!api|_next|floors|favicon|icon|.*\\.(?:svg|png|jpg|ico|webp|txt)$).*)'],
};
