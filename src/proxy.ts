import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PREFIXED = /^\/(zh|jp|kr|es)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // 请求诊断日志（admin 保存问题排查用）
  if (request.method === 'POST' || pathname === '/admin_config') {
    console.error(`[req] ${request.method} ${pathname} adminCookie=${request.cookies.get('admin') ? 'Y' : 'N'} actionHeader=${request.headers.get('next-action') ? 'Y' : 'N'}`);
  }

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
  matcher: ['/((?!api|_next/static|_next/image|images|admin_config|sitemap.xml|robots.txt|favicon.ico|llms.txt|feed.xml).*)'],
};
