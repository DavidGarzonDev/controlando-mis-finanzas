import { sql } from './db';
import { esc, pesos } from './telegram';
import type { Gasto } from './datos';

/**
 * Alertas inteligentes al registrar un gasto:
 *  - gasto inusual: mucho más alto de lo que sueles gastar en esa categoría,
 *  - posible duplicado: el mismo monto hace pocos minutos,
 *  - suscripción que subió: el mismo pago que el mes pasado, pero más caro.
 * Devuelve líneas cortas (HTML de Telegram) para poner debajo del gasto.
 */
const n = (v: unknown) => Number(v) || 0;
const SUSCRIPCIONES = /netflix|spotify|disney|max|hbo|prime|youtube|apple|icloud|google one|chatgpt|openai|platzi|smart ?fit|bodytech|gimnasio|gym|claro|movistar|tigo|wom|internet|plan|deezer|crunchyroll|paramount|canva|microsoft|office/i;

export async function alertasGasto(g: Gasto): Promise<string[]> {
  if (g.categoria === 'Ajuste') return [];
  const out: string[] = [];

  // 1) Posible duplicado: mismo monto en los últimos 30 minutos (otro gasto)
  const [dup] = await sql().query(
    `SELECT concepto, EXTRACT(EPOCH FROM (now() - fecha)) / 60 AS minutos FROM gastos
     WHERE id <> $1 AND monto = $2 AND fecha > now() - interval '30 minutes' ORDER BY fecha DESC LIMIT 1`,
    [g.id, g.monto],
  );
  if (dup) {
    const min = Math.max(1, Math.round(n(dup.minutos)));
    out.push(`👀 Se parece a <b>${esc(String(dup.concepto))}</b> (${pesos(g.monto)}) de hace ${min} min. ¿Lo registraste dos veces? Si sí, toca <b>Deshacer</b>.`);
  }

  // 2) Gasto inusual: 3 veces lo normal en esa categoría (con al menos 5 gastos para comparar)
  const [h] = await sql().query(
    `SELECT COUNT(*) AS veces, AVG(monto) AS promedio FROM gastos
     WHERE id <> $1 AND categoria = $2 AND fecha > now() - interval '90 days'`,
    [g.id, g.categoria],
  );
  const promedio = n(h?.promedio);
  if (n(h?.veces) >= 5 && g.monto >= 40_000 && g.monto >= Math.max(promedio * 3, promedio + 50_000)) {
    out.push(`🔎 Este gasto es mucho más alto de lo normal en ${esc(g.categoria)}: sueles gastar unos ${pesos(Math.round(promedio / 100) * 100)} por vez.`);
  }

  // 3) Suscripción o pago fijo que subió de precio frente a la vez anterior (otro mes)
  if (SUSCRIPCIONES.test(g.concepto)) {
    const palabra = g.concepto.toLowerCase().match(SUSCRIPCIONES)?.[0] ?? '';
    const [ant] = await sql().query(
      `SELECT monto FROM gastos
       WHERE id <> $1 AND lower(concepto) LIKE $2 AND fecha < date_trunc('month', now())
       ORDER BY fecha DESC LIMIT 1`,
      [g.id, `%${palabra}%`],
    );
    const antes = n(ant?.monto);
    if (antes > 0 && g.monto > antes * 1.05 && g.monto - antes >= 1_000) {
      out.push(`📈 <b>${esc(g.concepto)}</b> subió de ${pesos(antes)} a ${pesos(g.monto)} (+${Math.round(((g.monto - antes) / antes) * 100)} %).`);
    }
  }
  return out;
}
