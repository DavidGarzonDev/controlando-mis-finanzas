import webpush from 'web-push';
import { sql } from './db';

/**
 * Notificaciones de la app (web push), además de las de Telegram.
 * Las llaves VAPID se crean solas la primera vez y quedan en la base: no hay que configurar nada en Vercel.
 * En iPhone funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más).
 */

async function ajuste(clave: string): Promise<string | null> {
  const [r] = await sql()`SELECT valor FROM ajustes WHERE clave = ${clave}`;
  return r ? String(r.valor) : null;
}
async function guardarAjuste(clave: string, valor: string) {
  await sql()`INSERT INTO ajustes (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
}

async function llavesVapid(): Promise<{ publica: string; privada: string }> {
  let publica = await ajuste('vapid_publica');
  let privada = await ajuste('vapid_privada');
  if (!publica || !privada) {
    const k = webpush.generateVAPIDKeys();
    await guardarAjuste('vapid_publica', k.publicKey);
    await guardarAjuste('vapid_privada', k.privateKey);
    publica = k.publicKey;
    privada = k.privateKey;
  }
  return { publica, privada };
}

export async function llavePublicaPush(): Promise<string> {
  return (await llavesVapid()).publica;
}

export type Suscripcion = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function guardarSuscripcion(s: Suscripcion, nombre: string, sitio: string) {
  if (!/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new Error('Suscripción inválida');
  await guardarAjuste('push_sitio', sitio);
  await sql()`
    INSERT INTO suscripciones_push (endpoint, p256dh, auth, nombre) VALUES (${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${nombre.slice(0, 40)})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, nombre = EXCLUDED.nombre`;
}

export async function quitarSuscripcion(endpoint: string) {
  await sql()`DELETE FROM suscripciones_push WHERE endpoint = ${endpoint}`;
}

export async function suscripciones(): Promise<{ endpoint: string; nombre: string; creada: string }[]> {
  const rows = await sql()`SELECT endpoint, nombre, creada FROM suscripciones_push ORDER BY creada DESC`;
  return rows.map((r) => ({ endpoint: String(r.endpoint), nombre: String(r.nombre), creada: String(r.creada) }));
}

/** Manda la notificación a todos tus dispositivos suscritos. Quita los que ya no existen. Nunca falla hacia afuera. */
export async function enviarPush(n: { titulo: string; cuerpo: string; url?: string; etiqueta?: string }): Promise<number> {
  try {
    const subs = await sql()`SELECT endpoint, p256dh, auth FROM suscripciones_push`;
    if (!subs.length) return 0;
    const { publica, privada } = await llavesVapid();
    const sitio = (await ajuste('push_sitio')) ?? 'https://pilas.app';
    webpush.setVapidDetails(sitio, publica, privada);
    const cuerpo = JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo.slice(0, 240), url: n.url ?? '/', etiqueta: n.etiqueta });
    let enviados = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, cuerpo, { TTL: 60 * 60 * 12 });
        enviados++;
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) await quitarSuscripcion(String(s.endpoint));
        else console.error('Push falló', codigo);
      }
    }
    return enviados;
  } catch (e) {
    console.error('Push no disponible', e);
    return 0;
  }
}

/** Texto plano a partir del HTML de Telegram (para el cuerpo de la notificación). */
export function sinHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{2,}/g, '\n').trim();
}
