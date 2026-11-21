import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ags_session';

// Optimistic check only: real validation happens in getActor() against the DB.
export function proxy(request: NextRequest) {
  // Dev-only showcase is public outside production (the page itself 404s in production).
  if (process.env.NODE_ENV !== 'production' && /^\/dev\/ui(?:\/|$)/.test(request.nextUrl.pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Skip: /login, /api/* (MCP uses Bearer tokens, not cookies), Next internals and static files.
  matcher: ['/((?!login(?:/|$)|api/|_next/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|txt|xml|woff2?|ttf|otf)$).*)'],
};
