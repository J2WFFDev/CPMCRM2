import {NextResponse} from 'next/server';
export const config = {matcher: ['/((?!api/health|login|_next|favicon.ico).*)']};

export default async (req) => {
  const name = process.env.SESSION_COOKIE_NAME || 'cpmcrm_session';
  const cookie = req.cookies.get(name);
  if (!cookie) {
    const url = new URL('/login', req.url);
    url.searchParams.set('r', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
};
