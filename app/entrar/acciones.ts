'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { bloqueo, cerrarSesion, claveCorrecta, crearSesion, enviarCodigo, registrarIntento, revisarCodigo } from '@/lib/acceso';
import { asegurarEsquema } from '@/lib/esquema';
import { quienEs } from '@/lib/guardia';
import { COOKIE_DESAFIO, COOKIE_SESION, firmar, leerCookieSesion, verificar } from '@/lib/sesion';

export type Estado = {
  paso: 'clave' | 'codigo';
  error?: string;
  bloqueadoHasta?: string;
  envio?: number; // cambia cada vez que se manda un código (para reiniciar la cuenta regresiva)
};

const seguro = process.env.NODE_ENV === 'production';

function textoBloqueo(hasta: Date, global: boolean) {
  const min = Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60_000));
  return global
    ? `Por seguridad, el acceso está bloqueado ${min} min más por muchos intentos fallidos. Si eras tú, escríbele /desbloquear al bot.`
    : `Demasiados intentos. Esta conexión queda bloqueada ${min} min. Si eras tú, escríbele /desbloquear al bot.`;
}

/** Paso 1: la clave. Si está bien, manda el código a Telegram. */
export async function conClave(_: Estado, fd: FormData): Promise<Estado> {
  await asegurarEsquema();
  const { ip, agente } = await quienEs();
  const b = await bloqueo(ip);
  if (b) return { paso: 'clave', error: textoBloqueo(b.hasta, b.global), bloqueadoHasta: b.hasta.toISOString() };

  const clave = String(fd.get('clave') ?? '').slice(0, 200);
  if (!process.env.DASHBOARD_PASSWORD) return { paso: 'clave', error: 'Falta configurar DASHBOARD_PASSWORD en Vercel.' };
  if (!claveCorrecta(clave)) {
    const quedan = await registrarIntento(ip, 'clave', false, agente);
    if (quedan <= 0) {
      const b2 = await bloqueo(ip);
      return { paso: 'clave', error: b2 ? textoBloqueo(b2.hasta, b2.global) : 'Demasiados intentos.', bloqueadoHasta: b2?.hasta.toISOString() };
    }
    return { paso: 'clave', error: `Clave incorrecta. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`} antes del bloqueo.` };
  }
  await registrarIntento(ip, 'clave', true, agente);

  const r = await enviarCodigo(ip, fd.get('recordar') === 'on', agente);
  if ('error' in r) return { paso: 'clave', error: r.error };
  (await cookies()).set(COOKIE_DESAFIO, await firmar('desafio', r.id), {
    httpOnly: true, secure: seguro, sameSite: 'strict', path: '/', maxAge: 10 * 60,
  });
  return { paso: 'codigo', envio: Date.now() };
}

/** Paso 2: el código de Telegram. Si está bien, abre la sesión. */
export async function conCodigo(_: Estado, fd: FormData): Promise<Estado> {
  await asegurarEsquema();
  const { ip, agente } = await quienEs();
  const b = await bloqueo(ip);
  if (b) return { paso: 'clave', error: textoBloqueo(b.hasta, b.global), bloqueadoHasta: b.hasta.toISOString() };

  const jar = await cookies();
  const id = await verificar('desafio', jar.get(COOKIE_DESAFIO)?.value);
  if (!id) return { paso: 'clave', error: 'El código venció. Vuelve a poner tu clave.' };

  const codigo = String(fd.get('codigo') ?? '').replace(/\D/g, '').slice(0, 6);
  if (codigo.length !== 6) return { paso: 'codigo', error: 'El código tiene 6 números.' };

  const r = await revisarCodigo(id, codigo);
  if (!r.ok) {
    const quedanIp = await registrarIntento(ip, 'codigo', false, agente);
    if (quedanIp <= 0) {
      jar.delete(COOKIE_DESAFIO);
      const b2 = await bloqueo(ip);
      return { paso: 'clave', error: b2 ? textoBloqueo(b2.hasta, b2.global) : 'Demasiados intentos.', bloqueadoHasta: b2?.hasta.toISOString() };
    }
    if (r.motivo === 'incorrecto') return { paso: 'codigo', error: `Código incorrecto. Te ${r.quedan === 1 ? 'queda 1 intento' : `quedan ${r.quedan} intentos`}.` };
    jar.delete(COOKIE_DESAFIO);
    return { paso: 'clave', error: r.motivo === 'vencido' ? 'El código venció. Vuelve a poner tu clave.' : 'Fallaste el código 3 veces. Vuelve a poner tu clave.' };
  }

  await registrarIntento(ip, 'codigo', true, agente);
  const s = await crearSesion(ip, agente, r.recordar);
  jar.delete(COOKIE_DESAFIO);
  jar.set(COOKIE_SESION, await firmar('sesion', `${s.id}.${s.vence}`), {
    httpOnly: true, secure: seguro, sameSite: 'lax', path: '/', expires: new Date(s.vence),
  });
  redirect('/');
}

/** Volver al paso de la clave (por ejemplo, para pedir otro código). */
export async function otraVez(): Promise<Estado> {
  (await cookies()).delete(COOKIE_DESAFIO);
  return { paso: 'clave' };
}

/** Cerrar sesión en este dispositivo. */
export async function salir() {
  const jar = await cookies();
  const c = await leerCookieSesion(jar.get(COOKIE_SESION)?.value);
  if (c) {
    await asegurarEsquema();
    await cerrarSesion(c.id);
  }
  jar.delete(COOKIE_SESION);
  redirect('/entrar');
}
