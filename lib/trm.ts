import { sql } from './db';

/**
 * Gastos en dólares: "netflix 17 usd", "amazon 40 dólares", "US$ 9,99 spotify".
 * Se convierten a pesos con la TRM del día (Superintendencia Financiera, publicada en datos.gov.co).
 * La TRM se guarda un día en la base para no consultarla en cada gasto.
 */

const FUENTE = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1';
const RE_USD =
  /(?:\bus\s?\$|\bu\$s?|\busd)\s*(\d+(?:[.,]\d{1,2})?)\b|(\d+(?:[.,]\d{1,2})?)\s*(?:usd|us\$|d[oó]lares?|dolar|dls)(?![\p{L}\d])/iu;

export type Trm = { valor: number; fecha: string };

const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/** La TRM vigente (con caché de un día). Si la consulta falla, usa la última guardada; si no hay, null. */
export async function trm(): Promise<Trm | null> {
  const [r] = await sql()`SELECT valor FROM ajustes WHERE clave = 'trm'`.catch(() => []);
  const guardada = r ? (JSON.parse(String(r.valor)) as Trm & { consultada: string }) : null;
  if (guardada && guardada.consultada === hoyBogota()) return guardada;
  try {
    const res = await fetch(FUENTE, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const [d] = (await res.json()) as { valor?: string; vigenciadesde?: string }[];
    const valor = Number(d?.valor);
    if (!(valor > 1000 && valor < 20000)) throw new Error('TRM rara');
    const nueva = { valor, fecha: String(d.vigenciadesde ?? '').slice(0, 10), consultada: hoyBogota() };
    await sql()`INSERT INTO ajustes (clave, valor) VALUES ('trm', ${JSON.stringify(nueva)})
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    return nueva;
  } catch (e) {
    console.error('No se pudo consultar la TRM', e);
    return guardada;
  }
}

/** Si el texto trae un monto en dólares: cuántos y el texto sin esa parte. */
export function montoEnDolares(texto: string): { usd: number; resto: string } | null {
  const m = texto.match(RE_USD);
  if (!m) return null;
  const usd = Number((m[1] ?? m[2]).replace(',', '.'));
  if (!(usd > 0)) return null;
  const resto = (texto.slice(0, m.index) + ' ' + texto.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim();
  return { usd, resto };
}
