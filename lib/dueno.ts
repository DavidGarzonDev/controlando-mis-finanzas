import { randomInt } from 'node:crypto';
import { sql } from './db';

/**
 * El chat de Telegram del dueño de este Pilas.
 * Sale de TELEGRAM_CHAT_ID si está en Vercel; si no, del asistente de configuración inicial,
 * que lo guarda en la base (así quien instala Pilas no tiene que copiar su chat ID ni redesplegar).
 */

async function ajuste(clave: string): Promise<string | null> {
  try {
    const [r] = await sql()`SELECT valor FROM ajustes WHERE clave = ${clave}`;
    return r ? String(r.valor) : null;
  } catch {
    return null; // la tabla aún no existe (antes del primer arranque)
  }
}
async function guardar(clave: string, valor: string) {
  await sql()`INSERT INTO ajustes (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
}

export async function chatDueno(): Promise<string | null> {
  return process.env.TELEGRAM_CHAT_ID?.trim() || (await ajuste('telegram_chat'));
}

/** ¿El chat viene de Vercel (fijo) o del asistente (se puede cambiar desde la app)? */
export function chatDesdeVercel(): boolean {
  return !!process.env.TELEGRAM_CHAT_ID?.trim();
}

/**
 * Paso de la configuración inicial: un código de 4 dígitos que el dueño le manda al bot (/start 4821)
 * para demostrar que ese chat es el suyo. Vence en 10 minutos.
 */
export async function nuevoCodigoConexion(): Promise<string> {
  const codigo = String(randomInt(1000, 10000));
  await guardar('conexion_codigo', `${codigo}.${Date.now() + 10 * 60_000}`);
  return codigo;
}

/** Si el código coincide (y no venció), ese chat queda como dueño. Devuelve true si lo tomó. */
export async function reclamarConCodigo(chatId: string, codigo: string): Promise<boolean> {
  if (await chatDueno()) return false; // ya hay dueño: nadie más puede reclamarlo
  const g = await ajuste('conexion_codigo');
  if (!g) return false;
  const [esperado, vence] = g.split('.');
  if (Number(vence) < Date.now() || esperado !== codigo.trim()) return false;
  await guardar('telegram_chat', chatId);
  await sql()`DELETE FROM ajustes WHERE clave = 'conexion_codigo'`;
  return true;
}
