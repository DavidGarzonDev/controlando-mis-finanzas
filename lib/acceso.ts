import { randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { sql } from './db';
import { enviarMensaje, esc } from './telegram';
import { aleatorio, huella } from './sesion';

/**
 * Entrar al dashboard: 1) clave, 2) código de 6 dígitos que llega por Telegram.
 *
 * Bloqueos:
 *  - Desde una misma conexión (IP): 5 intentos fallidos en 15 minutos → bloqueada 15 minutos.
 *  - En total, desde cualquier lugar: 15 fallidos en 1 hora → nadie entra durante 1 hora.
 *    Si eras tú, escríbele /desbloquear al bot.
 * Cada inicio de sesión y cada bloqueo te llega por Telegram.
 */

export const LIMITE_IP = 5;
const VENTANA_IP_MIN = 15;
const LIMITE_GLOBAL = 15;
const VENTANA_GLOBAL_MIN = 60;
const CODIGO_MIN = 5;
const INTENTOS_POR_CODIGO = 3;
const CODIGOS_POR_VENTANA = 5;
export const HORAS_SESION = 12;
export const DIAS_RECORDAR = 30;

const n = (v: unknown) => Number(v) || 0;

async function avisar(texto: string) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) return false;
  try {
    return await enviarMensaje(chat, texto);
  } catch (e) {
    console.error('No pude avisar por Telegram', e);
    return false;
  }
}

/** Compara la clave en tiempo constante (no deja adivinar letra por letra midiendo tiempos). */
export function claveCorrecta(intento: string): boolean {
  const clave = process.env.DASHBOARD_PASSWORD;
  if (!clave) return false;
  const a = createHash('sha256').update(intento).digest();
  const b = createHash('sha256').update(clave).digest();
  return timingSafeEqual(a, b);
}

export type Bloqueo = { hasta: Date; global: boolean } | null;

/** ¿Está bloqueada esta IP o todo el acceso? */
export async function bloqueo(ip: string): Promise<Bloqueo> {
  const rows = await sql()`
    SELECT hasta, ip IS NULL AS global FROM bloqueos
    WHERE hasta > now() AND (ip IS NULL OR ip = ${ip}) ORDER BY hasta DESC LIMIT 1`;
  return rows[0] ? { hasta: new Date(String(rows[0].hasta)), global: rows[0].global === true } : null;
}

/** Guarda un intento. Si es fallido y se pasa del límite, bloquea y te avisa. Devuelve los intentos que le quedan a esa IP. */
export async function registrarIntento(ip: string, tipo: 'clave' | 'codigo' | 'llave', exito: boolean, agente: string): Promise<number> {
  await sql()`INSERT INTO intentos_acceso (ip, tipo, exito) VALUES (${ip}, ${tipo}, ${exito})`;
  if (exito) return LIMITE_IP;

  const [c] = await sql().query(
    `SELECT
       (SELECT COUNT(*) FROM intentos_acceso WHERE ip = $1 AND NOT exito AND fecha > now() - interval '${VENTANA_IP_MIN} minutes'
          AND fecha > COALESCE((SELECT MAX(creado) FROM bloqueos WHERE ip = $1 OR ip IS NULL), 'epoch')) AS ip,
       (SELECT COUNT(*) FROM intentos_acceso WHERE NOT exito AND fecha > now() - interval '${VENTANA_GLOBAL_MIN} minutes'
          AND fecha > COALESCE((SELECT MAX(creado) FROM bloqueos WHERE ip IS NULL), 'epoch')) AS total`,
    [ip],
  );
  const fallosIp = n(c.ip);
  const fallosTotal = n(c.total);

  if (fallosTotal >= LIMITE_GLOBAL) {
    await sql().query(`INSERT INTO bloqueos (ip, hasta, motivo) VALUES (NULL, now() + interval '${VENTANA_GLOBAL_MIN} minutes', 'global')`);
    await avisar(
      `🚨 <b>Bloqueé el acceso al dashboard por 1 hora.</b>\n${fallosTotal} intentos fallidos en la última hora (el último desde ${esc(ip)}).\n\n` +
        `Si eras tú, escribe /desbloquear. Si no, cambia tu clave (DASHBOARD_PASSWORD en Vercel).`,
    );
    return 0;
  }
  if (fallosIp >= LIMITE_IP) {
    await sql().query(`INSERT INTO bloqueos (ip, hasta, motivo) VALUES ($1, now() + interval '${VENTANA_IP_MIN} minutes', $2)`, [ip, tipo]);
    await avisar(
      `🔒 <b>Bloqueé una conexión por ${VENTANA_IP_MIN} minutos</b> después de ${fallosIp} intentos fallidos ` +
        `(${tipo === 'clave' ? 'clave equivocada' : tipo === 'llave' ? 'huella o Face ID que no coincide' : 'código equivocado'}).\nIP: <code>${esc(ip)}</code>\nDispositivo: ${esc(dispositivo(agente))}\n\n` +
        `Si eras tú, escribe /desbloquear. Si no, tu clave sigue a salvo: sin el código de Telegram no pueden entrar.`,
    );
    return 0;
  }
  return LIMITE_IP - fallosIp;
}

/** Clave correcta: crea un código de 6 dígitos y lo manda a tu Telegram. Devuelve el id del desafío. */
export async function enviarCodigo(ip: string, recordar: boolean, agente: string): Promise<{ id: string } | { error: string }> {
  const [c] = await sql().query(
    `SELECT COUNT(*) AS n FROM codigos_acceso WHERE creado > now() - interval '${VENTANA_IP_MIN} minutes'`,
  );
  if (n(c.n) >= CODIGOS_POR_VENTANA) return { error: 'Ya pediste varios códigos. Espera unos minutos y vuelve a intentar.' };

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = aleatorio(18);
  await sql().query(
    `INSERT INTO codigos_acceso (id, hash, ip, recordar, expira) VALUES ($1, $2, $3, $4, now() + interval '${CODIGO_MIN} minutes')`,
    [await huella(id), await huella(`${id}:${codigo}`), ip, recordar],
  );
  const ok = await avisar(
    `🔐 Tu código para entrar a <b>Pilas</b>:\n\n<code>${codigo}</code>\n\nVence en ${CODIGO_MIN} minutos. ` +
      `Pedido desde ${esc(dispositivo(agente))} (IP ${esc(ip)}).\n\n⚠️ Si no fuiste tú, alguien tiene tu clave: no compartas este código y cámbiala en Vercel.`,
  );
  if (!ok) return { error: 'No pude mandarte el código por Telegram. Revisa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel.' };
  return { id };
}

export type ResultadoCodigo =
  | { ok: true; recordar: boolean }
  | { ok: false; motivo: 'vencido' | 'incorrecto' | 'agotado'; quedan?: number };

/** Revisa el código. Máximo 3 intentos por código; luego hay que volver a poner la clave. */
export async function revisarCodigo(id: string, codigo: string): Promise<ResultadoCodigo> {
  const idHash = await huella(id);
  const rows = await sql()`
    SELECT hash, intentos, recordar, expira > now() AS vigente FROM codigos_acceso WHERE id = ${idHash}`;
  const fila = rows[0];
  if (!fila || fila.vigente !== true) {
    if (fila) await sql()`DELETE FROM codigos_acceso WHERE id = ${idHash}`;
    return { ok: false, motivo: 'vencido' };
  }
  const esperado = String(fila.hash);
  const recibido = await huella(`${id}:${codigo}`);
  const iguales = esperado.length === recibido.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido));
  if (iguales) {
    await sql()`DELETE FROM codigos_acceso WHERE id = ${idHash}`;
    return { ok: true, recordar: fila.recordar === true };
  }
  const intentos = n(fila.intentos) + 1;
  if (intentos >= INTENTOS_POR_CODIGO) {
    await sql()`DELETE FROM codigos_acceso WHERE id = ${idHash}`;
    return { ok: false, motivo: 'agotado' };
  }
  await sql()`UPDATE codigos_acceso SET intentos = ${intentos} WHERE id = ${idHash}`;
  return { ok: false, motivo: 'incorrecto', quedan: INTENTOS_POR_CODIGO - intentos };
}

/** Crea la sesión (se guarda solo la huella del id) y te avisa por Telegram. */
export async function crearSesion(ip: string, agente: string, recordar: boolean): Promise<{ id: string; vence: number }> {
  const id = aleatorio(32);
  const ms = recordar ? DIAS_RECORDAR * 86_400_000 : HORAS_SESION * 3_600_000;
  const vence = Date.now() + ms;
  await sql()`
    INSERT INTO sesiones (id, ip, agente, expira) VALUES (${await huella(id)}, ${ip}, ${agente.slice(0, 300)}, ${new Date(vence).toISOString()})`;
  await sql()`DELETE FROM sesiones WHERE expira < now() - interval '7 days'`;
  await sql()`DELETE FROM codigos_acceso WHERE expira < now()`;
  await sql()`DELETE FROM intentos_acceso WHERE fecha < now() - interval '30 days'`;
  await avisar(
    `✅ <b>Entraste a Pilas</b> desde ${esc(dispositivo(agente))}.\nIP: <code>${esc(ip)}</code> · ${recordar ? `recordado ${DIAS_RECORDAR} días` : `sesión de ${HORAS_SESION} horas`}\n\n` +
      `¿No fuiste tú? Escribe /cerrarsesiones y cambia tu clave.`,
  );
  return { id, vence };
}

/** ¿La sesión existe, no venció y no fue cerrada? (Actualiza "última vez" como mucho cada 5 minutos.) */
export async function sesionActiva(id: string): Promise<boolean> {
  const h = await huella(id);
  const rows = await sql()`
    UPDATE sesiones SET ultima = now()
    WHERE id = ${h} AND NOT revocada AND expira > now()
    RETURNING id`;
  return rows.length > 0;
}

export async function cerrarSesion(id: string) {
  await sql()`UPDATE sesiones SET revocada = true WHERE id = ${await huella(id)}`;
}

/** Cierra todas las sesiones abiertas (desde el bot: /cerrarsesiones). */
export async function cerrarTodas(): Promise<number> {
  const rows = await sql()`UPDATE sesiones SET revocada = true WHERE NOT revocada AND expira > now() RETURNING id`;
  await sql()`DELETE FROM codigos_acceso`;
  return rows.length;
}

/** Quita los bloqueos activos (desde el bot: /desbloquear). */
export async function desbloquear(): Promise<number> {
  const rows = await sql()`UPDATE bloqueos SET hasta = now() WHERE hasta > now() RETURNING id`;
  return rows.length;
}

export async function sesionesAbiertas(): Promise<{ ip: string; agente: string; creada: string; ultima: string; expira: string }[]> {
  const rows = await sql()`
    SELECT ip, agente, creada, ultima, expira FROM sesiones WHERE NOT revocada AND expira > now() ORDER BY ultima DESC LIMIT 10`;
  return rows.map((r) => ({ ip: String(r.ip ?? ''), agente: String(r.agente ?? ''), creada: String(r.creada), ultima: String(r.ultima), expira: String(r.expira) }));
}

/** "Chrome en Android", "Safari en iPhone"… a partir del User-Agent. */
export function dispositivo(agente: string): string {
  const a = agente || '';
  const nav = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera' : /SamsungBrowser/.test(a) ? 'Samsung Internet' : /Firefox\//.test(a) ? 'Firefox'
    : /CriOS|Chrome\//.test(a) ? 'Chrome' : /Safari\//.test(a) ? 'Safari' : 'un navegador';
  const so = /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Windows/.test(a) ? 'Windows'
    : /Mac OS X/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : 'un equipo';
  return `${nav} en ${so}`;
}
