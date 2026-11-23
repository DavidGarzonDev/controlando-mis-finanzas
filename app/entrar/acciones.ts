'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { bloqueo, cerrarSesion, claveCorrecta, crearSesion, enviarCodigo, registrarIntento, revisarCodigo } from '@/lib/acceso';
import { asegurarEsquema } from '@/lib/esquema';
import { quienEs } from '@/lib/guardia';
import { hayLlaves, opcionesEntrada, verificarEntrada } from '@/lib/llaves';
import { COOKIE_DESAFIO, COOKIE_RETO, COOKIE_SESION, firmar, leerCookieSesion, leerReto, retoFirmado, verificar } from '@/lib/sesion';

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

/** Entrar con huella / Face ID, paso 1: el reto que el celular debe firmar. */
export async function opcionesHuella(): Promise<{ opciones?: unknown; error?: string }> {
  await asegurarEsquema();
  const { ip } = await quienEs();
  const b = await bloqueo(ip);
  if (b) return { error: textoBloqueo(b.hasta, b.global) };
  const op = await opcionesEntrada();
  if (!op) return { error: 'Todavía no activas la huella. Entra con tu clave y actívala en Plan → Conexiones.' };
  (await cookies()).set(COOKIE_RETO, await retoFirmado(op.challenge), { httpOnly: true, secure: seguro, sameSite: 'strict', path: '/', maxAge: 300 });
  return { opciones: op };
}

/** Entrar con huella / Face ID, paso 2: se verifica la firma y se abre la sesión. */
export async function conHuella(respuesta: unknown): Promise<{ error?: string }> {
  await asegurarEsquema();
  const { ip, agente } = await quienEs();
  const b = await bloqueo(ip);
  if (b) return { error: textoBloqueo(b.hasta, b.global) };
  const jar = await cookies();
  const reto = await leerReto(jar.get(COOKIE_RETO)?.value);
  jar.delete(COOKIE_RETO);
  if (!reto) return { error: 'Se venció el tiempo. Toca el botón otra vez.' };
  let dispositivo: string | null = null;
  try {
    dispositivo = await verificarEntrada(respuesta as Parameters<typeof verificarEntrada>[0], reto);
  } catch {
    dispositivo = null;
  }
  if (!dispositivo) {
    await registrarIntento(ip, 'llave', false, agente);
    return { error: 'No se pudo verificar tu huella. Inténtalo otra vez o entra con tu clave.' };
  }
  await registrarIntento(ip, 'llave', true, agente);
  const s = await crearSesion(ip, `${agente} (huella: ${dispositivo})`, false);
  jar.set(COOKIE_SESION, await firmar('sesion', `${s.id}.${s.vence}`), { httpOnly: true, secure: seguro, sameSite: 'lax', path: '/', expires: new Date(s.vence) });
  redirect('/');
}

/** ¿Hay alguna huella/Face ID activada? (para mostrar el botón en la entrada) */
export async function huellaActiva(): Promise<boolean> {
  await asegurarEsquema();
  return hayLlaves();
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
