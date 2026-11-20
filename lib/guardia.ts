import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sesionActiva } from './acceso';
import { asegurarEsquema } from './esquema';
import { COOKIE_SESION, leerCookieSesion } from './sesion';

/** IP de quien hace la petición (en Vercel, x-forwarded-for la pone la plataforma). */
export async function quienEs(): Promise<{ ip: string; agente: string }> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'desconocida').trim().slice(0, 64);
  return { ip, agente: h.get('user-agent') ?? '' };
}

/** ¿Hay una sesión válida y abierta? (firma de la cookie + que siga activa en la base). */
export async function haySesion(): Promise<boolean> {
  const c = await leerCookieSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!c) return false;
  await asegurarEsquema();
  return sesionActiva(c.id);
}

/** Para páginas: sin sesión, a la pantalla de entrada. */
export async function exigirSesionPagina() {
  if (!(await haySesion())) redirect('/entrar');
}

/** Para acciones y descargas: sin sesión, error (nunca se ejecuta nada). */
export async function exigirSesion() {
  if (!(await haySesion())) throw new Error('Sesión vencida. Vuelve a entrar.');
}
