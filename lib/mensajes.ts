import * as db from './datos';
import { CATEGORIAS, conEmoji, type CategoriaPropia } from './categorias';
import { mesClave } from './fechas';
import { rachaLimite } from './retosComun';
import { esc, pesos, type Boton } from './telegram';

/**
 * Cómo se ven los mensajes del bot: una "tarjeta" por movimiento que se vuelve a dibujar
 * cada vez que tocas un botón (Categoría, Cuenta, Deshacer). Los botones van sin emojis;
 * los emojis solo acompañan a las categorías.
 */

export type Tarjeta = { texto: string; botones: Boton[][] };

/** ▰▰▰▰▰▰▱▱▱▱ */
export function barra(ratio: number, largo = 10): string {
  const llenos = Math.max(0, Math.min(largo, Math.round((Number.isFinite(ratio) ? ratio : 0) * largo)));
  return '▰'.repeat(llenos) + '▱'.repeat(largo - llenos);
}

const elegir = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const filas = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Línea de "Hoy" con barra: cuánto llevas contra el límite del día. */
export function lineasHoy(r: db.Resumen): string[] {
  if (r.modo === 'mes' && r.ingresos === 0) {
    return ['Aún no registras ingresos este mes. Escríbeme <code>me pagaron 1100000</code> o <code>tengo 300 mil</code> y calculo cuánto te alcanza.'];
  }
  if (r.disponible < 0) return [`⚠️ Vas <b>${pesos(-r.disponible)}</b> por encima de lo que tienes este mes.`];
  if (r.presupuestoHoy <= 0) return [];
  const ratio = r.gastadoHoy / r.presupuestoHoy;
  const queda = r.presupuestoHoy - r.gastadoHoy;
  return [
    `<b>Hoy</b>  ${barra(ratio)}  ${Math.round(ratio * 100)} %`,
    queda >= 0
      ? `Llevas ${pesos(r.gastadoHoy)} de ${pesos(r.presupuestoHoy)} · te quedan <b>${pesos(queda)}</b>`
      : `Te pasaste <b>${pesos(-queda)}</b> del límite de hoy (${pesos(r.presupuestoHoy)}). Mañana baja para compensar.`,
  ];
}

/** Un comentario corto según cómo vas, con tono de parcero. Varía para que no suene a robot. */
async function frase(r: db.Resumen, g: db.Gasto): Promise<string | null> {
  if (/domicilio|rappi|ifood|didi\s*food|picap/i.test(g.concepto)) {
    const d = await db.vecesEnLaSemana('domicilio|rappi|ifood|didi\\s*food|picap');
    if (d.veces >= 3) return `Van <b>${d.veces} domicilios</b> esta semana (${pesos(d.total)}). Cocinar uno te ahorra unos ${pesos(Math.round(d.total / d.veces / 1000) * 1000)} 🛵`;
  }
  if (r.disponible < 0 || r.presupuestoHoy <= 0) return null;
  const ratio = r.gastadoHoy / r.presupuestoHoy;
  if (ratio > 1) return elegir(['Hoy ya te pasaste. Mañana arrancamos de nuevo 💪', 'Ojo: pasaste el límite de hoy. Lo que sigue, solo lo necesario.']);
  if (ratio > 0.8) return elegir(['Pilas: ya casi llegas al límite de hoy.', 'Vas cerquita del límite de hoy, frena un poquito.', 'Te queda poquito para hoy, cuídalo.']);
  const porDia = await db.gastosPorDia(mesClave());
  const racha = rachaLimite(porDia, r.presupuestoHoy, r.diaHoy);
  if (racha >= 2 && ratio <= 0.6) return elegir([`Vas juicioso: ${racha} días seguidos sin pasarte 🔥`, `${racha} días cumpliendo el límite. ¡Así es! 🔥`]);
  if (ratio < 0.5) return elegir(['Anotado. Vas bien hoy 👌', 'Listo, vas muy bien.', 'Anotado. Todo bajo control.', 'Hecho. Sigues dentro del límite.']);
  return null;
}

function lineaTope(r: db.Resumen, categoria: string): string | null {
  const tope = r.topes[categoria];
  if (!tope) return null;
  const usado = r.porCategoria.find((c) => c.categoria === categoria)?.total ?? 0;
  const ratio = usado / tope;
  const etiqueta = usado > tope ? '🔴 Te pasaste del tope' : ratio >= 0.8 ? '🟠 Cerca del tope' : 'Tope';
  return `${etiqueta} de ${esc(categoria)}  ${barra(ratio, 8)}  ${pesos(usado)} de ${pesos(tope)}`;
}

function lineaCuenta(tipo: 'gasto' | 'ingreso', c: db.Cuenta | undefined): string {
  if (!c) return 'Sin cuenta';
  const aviso = c.saldo < 0 ? ' ⚠️ quedó en negativo' : '';
  return `${tipo === 'gasto' ? 'De' : 'A'} <b>${esc(c.nombre)}</b> · queda ${pesos(c.saldo)}${aviso}`;
}

type Abierto = 'categoria' | 'cuenta' | 'dividir' | null;

/** La tarjeta de un gasto con sus botones. `extra`: líneas que solo van la primera vez (retos, avisos). */
export async function tarjetaGasto(id: number, o: { extra?: string[]; abierto?: Abierto; usoIA?: boolean } = {}): Promise<Tarjeta | null> {
  const [g, cuentas, propias, r, division] = await Promise.all([db.gastoPorId(id), db.cuentas(), db.categoriasPropias(), db.resumen(), db.divisionDeGasto(id)]);
  if (!g) return null;
  const duda = await db.dudaMonto('gasto', id);
  const cuenta = cuentas.find((c) => c.id === g.cuentaId);

  const lineas = [
    `✅ <b>${esc(g.concepto)}</b> · ${pesos(g.monto)}${o.usoIA ? ' <i>(con IA)</i>' : ''}`,
    `${esc(conEmoji(g.categoria, propias))} · ${lineaCuenta('gasto', cuenta)}`,
  ];
  if (division) {
    const quienes = division.deudores.length > 1 ? division.deudores.map((d) => esc(d.persona)).join(', ') : `los otros ${division.personas - 1}`;
    lineas.push(`Cuenta dividida entre ${division.personas}: tu parte es ${pesos(g.monto)}. Te deben <b>${pesos(division.teDeben)}</b> (${quienes}).`);
  }
  lineas.push('', ...lineasHoy(r));
  const tope = lineaTope(r, g.categoria);
  if (tope) lineas.push(tope);
  const f = await frase(r, g);
  if (f) lineas.push(`<i>${f}</i>`);
  if (o.extra?.length) lineas.push('', ...o.extra);

  const botones: Boton[][] = [];
  if (o.abierto === 'categoria') {
    lineas.push('', '<b>¿En qué categoría va?</b>', `<i>Para una nueva: /categoria Mascotas 🐶</i>`);
    const todas = [...CATEGORIAS.filter((c) => c !== 'Otros'), ...propias.map((p) => p.nombre), 'Otros'];
    botones.push(...filas(todas.map((c) => ({ texto: conEmoji(c, propias), dato: `k:${id}:${c}` })), 3));
    botones.push([{ texto: 'Volver', dato: `v:g:${id}` }]);
    return { texto: lineas.join('\n'), botones };
  }
  if (o.abierto === 'dividir') {
    lineas.push('', '<b>¿Entre cuántas personas, contándote a ti?</b>', '<i>Tu parte queda como gasto y lo de los demás en Te deben. Con nombres: <code>cena 120 mil dividido entre juan, ana y yo</code></i>');
    botones.push([2, 3, 4, 5, 6].map((k) => ({ texto: String(k), dato: `dv:${id}:${k}` })));
    botones.push([{ texto: 'Volver', dato: `v:g:${id}` }]);
    return { texto: lineas.join('\n'), botones };
  }
  if (o.abierto === 'cuenta') {
    lineas.push('', '<b>¿De qué cuenta salió?</b>');
    botones.push(...filas(cuentas.slice(0, 12).map((c) => ({ texto: c.nombre, dato: `cc:g:${id}:${c.id}` })), 3));
    botones.push([{ texto: 'Volver', dato: `v:g:${id}` }]);
    return { texto: lineas.join('\n'), botones };
  }

  const preguntas: string[] = [];
  if (duda) {
    preguntas.push(`¿Era ${pesos(Math.min(duda, g.monto))} o ${pesos(Math.max(duda, g.monto))}?`);
    botones.push([g.monto, duda].sort((a, b) => a - b).map((m) => ({ texto: `Era ${pesos(m)}`, dato: `m:g:${id}:${m}` })));
  }
  if (!cuenta && cuentas.length >= 2) {
    preguntas.push('¿De dónde salió?');
    botones.push(...filas(cuentas.slice(0, 9).map((c) => ({ texto: c.nombre, dato: `c:g:${id}:${c.id}` })), 3));
  }
  if (preguntas.length) lineas.push('', ...preguntas.map((p) => `<b>${p}</b>`));
  const acciones: Boton[] = [{ texto: 'Categoría', dato: `k:${id}` }];
  if (cuenta && cuentas.length >= 2) acciones.push({ texto: 'Cuenta', dato: `a:g:${id}` });
  acciones.push({ texto: 'Deshacer', dato: `d:g:${id}` });
  botones.push(acciones);
  // Pagaste la cuenta de varios (almuerzo, salida, taxi, mercado): se puede dividir
  if (!division && g.categoria !== 'Ajuste' && g.monto >= 4_000 && /^(Comida|Salidas|Transporte|Compras|Hogar|Servicios)$/.test(g.categoria)) {
    botones.push([{ texto: 'Dividir la cuenta', dato: `dv:${id}` }]);
  }
  // Plata que le diste a alguien: quizá te la van a devolver
  if (/env[ií]o a|prest|le di a|le mand|a mi (novia|novio|mam[aá]|pap[aá]|herman|amig|abuel|t[ií][oa]|prim)/i.test(g.concepto)) {
    botones.push([{ texto: 'Es préstamo (me lo devuelven)', dato: `ep:${id}` }]);
  }
  return { texto: lineas.join('\n'), botones };
}

/** La tarjeta de un ingreso: a qué cuenta entró, cuánto queda libre y botones Cuenta / Deshacer. */
export async function tarjetaIngreso(id: number, o: { abierto?: Abierto } = {}): Promise<Tarjeta | null> {
  const [i, cuentas, r] = await Promise.all([db.ingresoPorId(id), db.cuentas(), db.resumen()]);
  if (!i) return null;
  const duda = await db.dudaMonto('ingreso', id);
  const cuenta = cuentas.find((c) => c.id === i.cuentaId);
  const lineas = [
    `💰 <b>${esc(i.concepto)}</b> · +${pesos(i.monto)}`,
    lineaCuenta('ingreso', cuenta),
    '',
    `Libre: <b>${pesos(r.disponible)}</b>`,
  ];
  if (r.disponible > 0 && r.presupuestoHoy > 0) lineas.push(`Hoy puedes gastar hasta <b>${pesos(r.presupuestoHoy)}</b> (${r.proximoPago.dias} días para el ${r.proximoPago.dia}).`);
  lineas.push(`<i>${elegir(['¡Bien! Plata que entra 💸', 'Anotado. A cuidarla.', 'Listo. Que rinda.'])}</i>`);

  const botones: Boton[][] = [];
  if (o.abierto === 'cuenta') {
    lineas.push('', '<b>¿A qué cuenta entró?</b>');
    botones.push(...filas(cuentas.slice(0, 12).map((c) => ({ texto: c.nombre, dato: `cc:i:${id}:${c.id}` })), 3));
    botones.push([{ texto: 'Volver', dato: `v:i:${id}` }]);
    return { texto: lineas.join('\n'), botones };
  }
  const preguntas: string[] = [];
  if (duda) {
    preguntas.push(`¿Era ${pesos(Math.min(duda, i.monto))} o ${pesos(Math.max(duda, i.monto))}?`);
    botones.push([i.monto, duda].sort((a, b) => a - b).map((m) => ({ texto: `Era ${pesos(m)}`, dato: `m:i:${id}:${m}` })));
  }
  if (!cuenta && cuentas.length >= 2) {
    preguntas.push('¿A dónde entró?');
    botones.push(...filas(cuentas.slice(0, 9).map((c) => ({ texto: c.nombre, dato: `c:i:${id}:${c.id}` })), 3));
  }
  if (preguntas.length) lineas.push('', ...preguntas.map((p) => `<b>${p}</b>`));
  const acciones: Boton[] = [];
  if (cuenta && cuentas.length >= 2) acciones.push({ texto: 'Cuenta', dato: `a:i:${id}` });
  acciones.push({ texto: 'Deshacer', dato: `d:i:${id}` });
  botones.push(acciones);
  return { texto: lineas.join('\n'), botones };
}

/** Lista de categorías con emoji, para /categorias. */
export function textoCategorias(propias: CategoriaPropia[]): string {
  const base = CATEGORIAS.map((c) => conEmoji(c)).join('\n');
  const mias = propias.length ? `\n\n<b>Tus categorías</b>\n${propias.map((p) => conEmoji(p.nombre, propias)).join('\n')}` : '';
  return `<b>Categorías</b>\n${base}${mias}\n\nCrear una: <code>/categoria Mascotas 🐶</code>\nBorrar una tuya: <code>/categoria borrar Mascotas</code>`;
}
