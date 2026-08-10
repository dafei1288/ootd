import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PREFIXED = /^\/(zh|jp|kr|es)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /en/* → 301 → /* (default lang lives at root, avoid duplicate content)
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/';
    return NextResponse.redirect(url, 301);
  }

  const headers = new Headers(request.headers);

  if (PREFIXED.test(pathname)) {
    headers.set('x-lang', pathname.slice(1, 3));
    return NextResponse.next({ request: { headers } });
  }

  // unprefixed → render as en, URL unchanged
  headers.set('x-lang', 'en');
  const url = request.nextUrl.clone();
  url.pathname = '/en' + (pathname === '/' ? '' : pathname);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|images|admin|sitemap.xml|robots.txt|favicon.ico).*)'],
};
