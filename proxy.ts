import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ags_session';

// Optimistic check only: real validation happens in getActor() against the DB.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Skip: /login, /dev/ui (dev-only showcase; 404s in production), /api/* (MCP uses Bearer tokens, not cookies), Next internals and static files.
  matcher: ['/((?!login(?:/|$)|dev/ui(?:/|$)|api/|_next/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|txt|xml|woff2?|ttf|otf)$).*)'],
};
