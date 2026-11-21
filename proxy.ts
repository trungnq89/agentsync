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
  // Skip: /login, /api/* (MCP uses Bearer tokens, not cookies), Next internals and static files.
  matcher: ['/((?!login|api/|_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
