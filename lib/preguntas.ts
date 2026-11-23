import { sql } from './db';
import * as db from './datos';
import { ZONA } from './config';
import { preguntarIA } from './gemini';
import { esc } from './telegram';

/**
 * "Pregúntale a Pilas": preguntas en lenguaje normal sobre tus finanzas
 * ("¿cuánto gasté en gasolina en octubre?", "¿en qué se me fue la plata esta quincena?").
 * Se le pasa a la IA un resumen compacto de tus datos y responde solo con eso, con cifras.
 */

const PALABRAS_PREGUNTA = /^(¿|cu[aá]nt[oa]s?|cu[aá]l(es)?|en qu[eé]|qu[eé]|c[oó]mo|d[oó]nde|por qu[eé]|cu[aá]ndo|me alcanza|puedo|deber[ií]a|vale la pena)(?![\p{L}])/iu;

/** ¿El mensaje es una pregunta (y no un gasto)? */
export function esPregunta(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 8 || t.startsWith('/')) return false;
  return t.endsWith('?') || PALABRAS_PREGUNTA.test(t);
}

const f = (v: unknown) => Math.round(Number(v) || 0);

async function contexto(): Promise<string> {
  const dia = `(fecha AT TIME ZONE '${ZONA}')`;
  const [meses, cats, gastos, ingresos, transf, cuentas, deudas, metas, r] = await Promise.all([
    sql().query(`SELECT to_char(${dia}, 'YYYY-MM') AS mes, SUM(monto) AS total, COUNT(*) AS veces FROM gastos
       WHERE fecha > now() - interval '6 months' GROUP BY 1 ORDER BY 1`),
    sql().query(`SELECT to_char(${dia}, 'YYYY-MM') AS mes, categoria, SUM(monto) AS total FROM gastos
       WHERE fecha > now() - interval '6 months' GROUP BY 1, 2 ORDER BY 1, 3 DESC`),
    sql().query(`SELECT to_char(${dia}, 'YYYY-MM-DD') AS f, g.concepto, g.monto, g.categoria, c.nombre AS cuenta FROM gastos g
       LEFT JOIN cuentas c ON c.id = g.cuenta_id WHERE g.fecha > now() - interval '92 days' ORDER BY g.fecha DESC LIMIT 450`),
    sql().query(`SELECT to_char(${dia}, 'YYYY-MM-DD') AS f, i.concepto, i.monto, c.nombre AS cuenta FROM ingresos i
       LEFT JOIN cuentas c ON c.id = i.cuenta_id WHERE i.fecha > now() - interval '6 months' ORDER BY i.fecha DESC LIMIT 120`),
    sql().query(`SELECT to_char(${dia}, 'YYYY-MM-DD') AS f, t.monto, t.nota, d.nombre AS desde, h.nombre AS hacia FROM transferencias t
       LEFT JOIN cuentas d ON d.id = t.desde_id LEFT JOIN cuentas h ON h.id = t.hacia_id
       WHERE t.fecha > now() - interval '60 days' ORDER BY t.fecha DESC LIMIT 60`),
    db.cuentas(),
    db.deudas(),
    db.metas(),
    db.resumen(),
  ]);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
  return [
    `HOY: ${hoy} (Colombia). Montos en pesos colombianos.`,
    `ESTE MES: libre ${f(r.disponible)}, puedes gastar hoy ${f(r.presupuestoHoy)}, gastado hoy ${f(r.gastadoHoy)}, ingresos del mes ${f(r.ingresos)}, gastos del día a día ${f(r.variables)}, cuotas ${f(r.cuotas)}, fijos ${f(r.fijos)}, por pagar ${f(r.totalPendiente)}, próximo pago el ${r.proximoPago.dia} (${r.proximoPago.dias} días).`,
    `TOPES: ${Object.entries(r.topes).map(([c, t]) => `${c} ${t}`).join('; ') || 'ninguno'}`,
    `GASTOS POR MES (mes, total, veces): ${meses.map((m) => `${m.mes} ${f(m.total)} (${f(m.veces)})`).join('; ')}`,
    `GASTOS POR MES Y CATEGORÍA: ${cats.map((c) => `${c.mes} ${c.categoria} ${f(c.total)}`).join('; ')}`,
    `CUENTAS: ${cuentas.map((c) => `${c.nombre} ${f(c.saldo)}`).join('; ') || 'ninguna'}`,
    `DEUDAS (nombre, saldo, cuota, tasa): ${deudas.map((d) => `${d.nombre} ${f(d.saldo)} cuota ${f(d.cuota)} ${d.tasa ?? ''}`).join('; ') || 'ninguna'}`,
    `METAS (nombre, ahorrado/objetivo): ${metas.map((m) => `${m.nombre} ${f(m.ahorrado)}/${f(m.objetivo)}`).join('; ') || 'ninguna'}`,
    `INGRESOS (fecha|concepto|monto|cuenta):\n${ingresos.map((i) => `${i.f}|${i.concepto}|${f(i.monto)}|${i.cuenta ?? '-'}`).join('\n')}`,
    `MOVIMIENTOS ENTRE CUENTAS (fecha|monto|de|a|nota):\n${transf.map((t) => `${t.f}|${f(t.monto)}|${t.desde ?? '-'}|${t.hacia ?? '-'}|${t.nota ?? ''}`).join('\n')}`,
    `GASTOS ÚLTIMOS 3 MESES (fecha|concepto|monto|categoría|cuenta):\n${gastos.map((g) => `${g.f}|${g.concepto}|${f(g.monto)}|${g.categoria}|${g.cuenta ?? '-'}`).join('\n')}`,
  ].join('\n\n');
}

const SISTEMA = `Eres Pilas, el asistente de finanzas personales de una persona en Colombia.
Responde SOLO con los datos que te doy (no inventes cifras). Si los datos no alcanzan para responder, dilo y sugiere cómo registrarlo.
Responde en español colombiano, cercano y claro, en máximo 6 líneas. Da cifras exactas con formato $15.000 (punto de miles).
Cuando sumes, revisa bien la cuenta. Si te preguntan por "esta quincena", es desde el día 1 o el 16 del mes actual hasta hoy.
Para resaltar algo usa **negrilla** (nada más de formato, sin tablas ni títulos). Termina con un consejo corto solo si sirve.`;

/** Responde la pregunta en HTML de Telegram (escapado; solo <b>). */
export async function responderPregunta(pregunta: string): Promise<string> {
  const datos = await contexto();
  const r = await preguntarIA(SISTEMA, `DATOS:\n${datos}\n\nPREGUNTA: ${pregunta.slice(0, 400)}`);
  if (!r.ok) {
    return r.motivo === 'sin_clave'
      ? 'Para responder preguntas necesito la IA (GEMINI_API_KEY en Vercel).'
      : r.motivo === 'limite'
        ? 'La IA ya llegó a su límite de hoy. Intenta mañana o mira /resumen.'
        : 'No pude pensar la respuesta ahora. Intenta otra vez en un momento.';
  }
  const html = esc(r.texto).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\n)\s*[*-]\s+/g, '$1• ');
  return `💬 ${html}`;
}
