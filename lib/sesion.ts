/**
 * Cookies firmadas (HMAC-SHA256) para la sesión del dashboard.
 * Usa Web Crypto, así sirve igual en el middleware (edge) y en el servidor (Node).
 *
 * El secreto sale de AUTH_SECRET si existe; si no, se deriva de secretos que ya tienes en Vercel
 * (token del bot + DATABASE_URL + secreto del webhook). Nadie de afuera los conoce, así que nadie
 * puede fabricar una cookie válida, ni siquiera sabiendo tu clave.
 */

export const COOKIE_SESION = 'pilas_sesion';
export const COOKIE_DESAFIO = 'pilas_desafio';

const enc = new TextEncoder();
let llave: Promise<CryptoKey> | null = null;

function materialSecreto(): string {
  const propio = process.env.AUTH_SECRET;
  if (propio && propio.length >= 16) return `auth:${propio}`;
  const partes = [process.env.TELEGRAM_BOT_TOKEN, process.env.DATABASE_URL, process.env.TELEGRAM_WEBHOOK_SECRET, process.env.CRON_SECRET]
    .filter(Boolean)
    .join('|');
  if (partes.length < 32) throw new Error('Falta un secreto para firmar sesiones: configura AUTH_SECRET o TELEGRAM_BOT_TOKEN y DATABASE_URL.');
  return `derivado:${partes}`;
}

function obtenerLlave(): Promise<CryptoKey> {
  if (!llave) {
    llave = crypto.subtle
      .digest('SHA-256', enc.encode(materialSecreto()))
      .then((bits) => crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
    llave.catch(() => (llave = null));
  }
  return llave;
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function desdeB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Firma `contenido` (tipo de cookie incluido para que una cookie no sirva por otra). */
export async function firmar(tipo: string, contenido: string): Promise<string> {
  const firma = await crypto.subtle.sign('HMAC', await obtenerLlave(), enc.encode(`${tipo}:${contenido}`));
  return `${contenido}.${b64url(firma)}`;
}

/** Devuelve el contenido si la firma es válida (comparación en tiempo constante); si no, null. */
export async function verificar(tipo: string, valor: string | undefined | null): Promise<string | null> {
  if (!valor) return null;
  const i = valor.lastIndexOf('.');
  if (i <= 0) return null;
  const contenido = valor.slice(0, i);
  const firma = desdeB64url(valor.slice(i + 1));
  if (!firma) return null;
  const ok = await crypto.subtle.verify('HMAC', await obtenerLlave(), firma, enc.encode(`${tipo}:${contenido}`));
  return ok ? contenido : null;
}

/** Hash con el mismo secreto (para guardar códigos y sesiones sin dejarlos en claro en la base). */
export async function huella(texto: string): Promise<string> {
  const firma = await crypto.subtle.sign('HMAC', await obtenerLlave(), enc.encode(`huella:${texto}`));
  return b64url(firma);
}

/** Cookie de sesión: "id.vence(ms)". Solo revisa firma y vencimiento; la base dice si sigue activa. */
export async function leerCookieSesion(valor: string | undefined | null): Promise<{ id: string; vence: number } | null> {
  const contenido = await verificar('sesion', valor);
  if (!contenido) return null;
  const [id, vence] = contenido.split('.');
  const v = Number(vence);
  if (!id || !Number.isFinite(v) || v < Date.now()) return null;
  return { id, vence: v };
}

export function aleatorio(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b.buffer);
}
