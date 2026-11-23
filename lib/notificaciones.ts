import { bancoEnTexto } from './bancos';

/**
 * Lee el texto de una notificación, SMS o correo de un banco colombiano y dice qué pasó.
 * Ejemplos que entiende:
 *  - "Bancolombia: Compraste $45.000,00 en EXITO CALLE 80 con tu T.Deb *1234, el 22/11/2026"
 *  - "Bancolombia le informa Compra por $45.000,00 en RAPPI 12:30. 22/11/2026 T.Cred *1234"
 *  - "Pagaste $15.000 en D1 SAS" (Nequi) · "Enviaste $20.000 a Juan Perez"
 *  - "Recibiste $50.000 de Maria Lopez" · "Juan te envió $20.000"
 *  - "Compra aprobada por $12.500 en UBER TRIP con tu tarjeta Nu"
 *  - "Retiraste $100.000 en cajero" · "Transferiste $50.000 a la cuenta *5678"
 * No registra códigos de verificación, promociones ni avisos sin monto.
 */

export type Notificacion = {
  tipo: 'gasto' | 'ingreso' | 'retiro' | 'transferencia';
  monto: number;
  /** Comercio o persona, ya en formato bonito ("Exito Calle 80", "Juan Perez"). */
  comercio: string | null;
  /** Banco que la mandó (id de lib/bancos), si se reconoce. */
  banco: string | null;
  /** Últimos 4 dígitos de la cuenta o tarjeta de origen ("*1234", "terminada en 1234"). */
  ultimos4: string | null;
  /** Últimos 4 de la cuenta destino en transferencias ("a la cuenta *5678"). */
  destino4: string | null;
  /** true si dice que fue con tarjeta de crédito. */
  credito: boolean;
};

const NO_ES_MOVIMIENTO = /\b(c[oó]digo|clave|otp|contrase[ñn]a|no compartas|token|verificaci[oó]n|promo|descuento|gana|sorteo|oferta|cashback de|recuerda pagar|tu extracto|fecha l[ií]mite)\b/i;
const INGRESO = /\b(recibiste|te lleg[oó]|te envi[oó]|te transfiri[oó]|te consign\w*|abono a tu cuenta|consignaci[oó]n recibida|transferencia recibida|recibes|ingres[oó] (dinero|plata)|te pagaron)(?![\p{L}\d])/iu;
const RETIRO = /\b(retiraste|retiro (en|por|de)|sacaste)(?![\p{L}\d])/iu;
const TRANSFERENCIA = /\b(transferiste|transferencia (de|por))(?![\p{L}\d])/iu;
const GASTO = /\b(compraste|compra( aprobada)?( por| de)?|pagaste|pago (por|de|en|a)|enviaste|env[ií]o (de|por|a)|debitamos|d[eé]bito (por|de)|cargo (por|de)|pagos? pse|transacci[oó]n (aprobada|por))(?![\p{L}\d])/iu;

/** "$45.000,00" → 45000 · "$45,000.00" → 45000 · "$ 1.250.000" → 1250000 · "COP 15000" → 15000 */
export function montoDe(texto: string): number | null {
  const m = texto.match(/(?:\$|COP|cop)\s?([\d][\d.,]*)/);
  if (!m) return null;
  // Si termina en dos dígitos después del último punto o coma, son centavos: fuera. El resto son miles.
  const t = m[1].replace(/[.,]$/, '').replace(/[.,]\d{2}$/, '');
  const n = Number(t.replace(/[.,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SIGLAS = new Set(['SAS', 'KFC', 'EPM', 'ETB', 'UNE', 'PSE', 'SA', 'BBVA', 'GNB', 'TV', 'PC', 'LTDA', 'BBQ', 'DIAN', 'SOAT', 'EDS']);

/** "EXITO CALLE 80" → "Exito Calle 80" (deja siglas como D1, KFC, SAS). */
function bonito(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (/\d/.test(w) || SIGLAS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .slice(0, 40);
}

function comercioDe(texto: string, tipo: Notificacion['tipo']): string | null {
  const corte = /\s+en\s+(?:tu|su)\b|\s+(?:con|desde|el|a las|por valor|por \$|t\.?\s?(?:deb|cred)|tarjeta|cuenta|cta|ref|referencia|aprobad[ao])\b|[,.;]\s|\s\d{1,2}:\d{2}|\s\d{1,2}\/\d{1,2}|$/i;
  const tomar = (re: RegExp) => {
    const m = texto.match(re);
    if (!m) return null;
    const resto = m[1];
    const fin = resto.search(corte);
    const s = (fin >= 0 ? resto.slice(0, fin) : resto).replace(/\*\d+/g, '').replace(/\*/g, ' ').replace(/\s\d{1,2}:\d{2}$/, '').trim();
    return s.length >= 2 ? bonito(s) : null;
  };
  if (tipo === 'ingreso') {
    return tomar(/\b(?:de|desde)\s+(?!tu\b|la\b|su\b)([A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ .&'-]+)/) ?? tomar(/^([A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ .'-]+?)\s+te\s+(?:envi|transfiri|consign)/i);
  }
  return (
    tomar(/\b(?:en|a)\s+(?!tu\b|la cuenta\b|cuenta\b|cajero\b|tu cuenta\b)([A-Z0-9ÁÉÍÓÚÑa-záéíóúñ*][\w*ÁÉÍÓÚÑáéíóúñ .&'/:-]+)/) ??
    null
  );
}

export function leerNotificacion(texto: string): Notificacion | null {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (!t || NO_ES_MOVIMIENTO.test(t)) return null;
  const monto = montoDe(t);
  if (!monto) return null;

  const tipo: Notificacion['tipo'] | null = INGRESO.test(t)
    ? 'ingreso'
    : RETIRO.test(t)
      ? 'retiro'
      : TRANSFERENCIA.test(t) && /\ba\s+(?:la\s+|tu\s+)?(?:cuenta|cta)\b/i.test(t)
        ? 'transferencia'
        : GASTO.test(t)
          ? 'gasto'
          : null;
  if (!tipo) return null;

  const cuatro = [...t.matchAll(/(?:\*|terminad[ao] en\s+|final(?:izada)? en\s+|No\.?\s?)(\d{4})\b/gi)].map((m) => m[1]);
  const destino4 = tipo === 'transferencia' ? t.match(/\ba\s+(?:la\s+|tu\s+)?(?:cuenta|cta)\s*(?:\w+\s+)?\*?(\d{4})\b/i)?.[1] ?? null : null;
  const ultimos4 = cuatro.find((x) => x !== destino4) ?? null;

  return {
    tipo,
    monto,
    comercio: tipo === 'retiro' || tipo === 'transferencia' ? null : comercioDe(t, tipo),
    banco: bancoEnTexto(t)?.id ?? null,
    ultimos4,
    destino4,
    credito: /\b(t\.?\s?cred|tarjeta de cr[eé]dito|cr[eé]dito)\b/i.test(t),
  };
}

/** ¿El texto parece una notificación de banco (y no un gasto escrito a mano)? */
export function pareceNotificacion(texto: string): boolean {
  // Lo que escribes tú va en primera persona ("compré", "pagué", "le mandé"): eso no es una notificación.
  if (/\b(compr[eé]|pagu[eé]|gast[eé]|mand[eé]|pas[eé]|retir[eé]|consign[eé]|le di|me pagaron|tengo)(?![\p{L}\d])/iu.test(texto)) return false;
  return /\$\s?\d/.test(texto) && (GASTO.test(texto) || INGRESO.test(texto) || RETIRO.test(texto) || TRANSFERENCIA.test(texto)) && texto.length > 18;
}
