import { NextResponse, type NextRequest } from 'next/server';

/** Protege el dashboard con contraseña. El webhook de Telegram queda por fuera (tiene su propio secreto). */
export function middleware(req: NextRequest) {
  const clave = process.env.DASHBOARD_PASSWORD;
  if (!clave) return new NextResponse('Falta configurar DASHBOARD_PASSWORD en Vercel.', { status: 500 });

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decodificado = atob(auth.slice(6));
      const contrasena = decodificado.slice(decodificado.indexOf(':') + 1);
      if (contrasena === clave) return NextResponse.next();
    } catch {
      /* encabezado mal formado */
    }
  }
  return new NextResponse('Escribe la contraseña para entrar.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Mis Finanzas", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!api/telegram|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon).*)'],
};
