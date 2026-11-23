import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION, leerCookieSesion } from '@/lib/sesion';

/**
 * Primera barrera del dashboard: sin una cookie de sesión firmada y vigente, nada pasa.
 * (La segunda barrera revisa en la base que la sesión siga abierta, en la página y en cada acción.)
 * El webhook de Telegram y el cron quedan por fuera: tienen su propio secreto.
 */
export async function middleware(req: NextRequest) {
  const sesion = await leerCookieSesion(req.cookies.get(COOKIE_SESION)?.value).catch(() => null);
  const enEntrar = req.nextUrl.pathname === '/entrar';

  if (enEntrar) {
    // Con sesión, no tiene sentido ver la pantalla de entrada.
    if (sesion && req.method === 'GET') return NextResponse.redirect(new URL('/', req.url));
    return conCabeceras(NextResponse.next());
  }
  if (sesion) return conCabeceras(NextResponse.next());

  if (req.method === 'GET' && req.headers.get('accept')?.includes('text/html')) {
    return NextResponse.redirect(new URL('/entrar', req.url));
  }
  return new NextResponse('Sesión vencida. Vuelve a entrar.', { status: 401 });
}

/** Cabeceras de seguridad: no se puede meter la página en un iframe ni filtrar la URL a otros sitios. */
function conCabeceras(res: NextResponse) {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}

export const config = {
  matcher: ['/((?!api/telegram|api/cron|sw.js|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|logo-|fondo-).*)'],
};
