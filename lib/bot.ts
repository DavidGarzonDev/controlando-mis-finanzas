import { CATEGORIAS, normalizarCategoria, sinTildes } from './categorias';
import { extraerMonto, interpretar } from './parser';
import { interpretarConIA } from './gemini';
import { generarConsejos } from './consejos';
import { asegurarEsquema } from './esquema';
import * as db from './datos';
import { esc, pesos } from './telegram';
import { bancoEnTexto, bancoPorId } from './bancos';

const AYUDA = `<b>Cómo usarme</b>
Escríbeme el gasto como te salga:
• <code>almuerzo 15 mil</code>
• <code>gasolina 40k</code>
• <code>salida con mi novia 70000</code>

Y lo que te entra, venga de donde venga:
• <code>me pagaron 1.100.000</code>
• <code>tengo 300 mil en efectivo</code>
• <code>me mandaron 50 mil</code> · <code>vendí la bici 200 mil</code>

<b>Comandos</b>
/hoy — cuánto puedes gastar hoy y qué llevas
/resumen — cómo vas este mes
/pendientes — lo que te falta pagar este mes
/consejos — recomendaciones con tus números
/deudas — tus deudas en orden de ataque
/abono nequi 50000 — registra un abono a una deuda

<b>Tarjetas de crédito</b>
• <code>hice compra con la tarjeta AV Villas por 120 mil</code>
• <code>compré tenis con la Nu 250 mil a 6 cuotas</code>
• <code>pagué la cuota de la AV Villas</code> · <code>pagué 200 mil a la Nu</code>
/tarjetas — cupo disponible de cada tarjeta
/saldo nequi 250000 — actualiza el saldo de una cuenta (sin monto: ver saldos)
/pague gimnasio — marca un gasto fijo o una cuota como pagada
/ajuste -20000 — cuadra plata que no sabes en qué se fue (o +20000 si te sobra)
/cat Salidas — corrige la categoría del último gasto (y aprendo)
/borrar — borra el último gasto

Categorías: ${CATEGORIAS.join(', ')}`;

/** Qué tan bien se parece `nombre` a lo que escribió el usuario: exacto 3, empieza una palabra 2, contiene 1. */
function parecido(nombre: string, busqueda: string): number {
  const a = sinTildes(nombre.toLowerCase()).trim();
  const b = sinTildes(busqueda.toLowerCase()).trim();
  if (!b) return 0;
  if (a === b) return 3;
  if (a.split(/[^\p{L}\d]+/u).some((w) => w.startsWith(b))) return 2;
  return a.includes(b) ? 1 : 0;
}

function mejor<T>(items: T[], nombreDe: (x: T) => string, busqueda: string): { item: T; puntos: number } | null {
  let top: { item: T; puntos: number } | null = null;
  for (const item of items) {
    const puntos = parecido(nombreDe(item), busqueda);
    if (puntos > 0 && (!top || puntos > top.puntos)) top = { item, puntos };
  }
  return top;
}

const PALABRAS_VACIAS = new Set(['con', 'mi', 'mis', 'para', 'por', 'del', 'las', 'los', 'una', 'que']);

export async function manejarMensaje(textoCrudo: string): Promise<string> {
  await asegurarEsquema();
  const texto = textoCrudo.trim();
  const [comando, ...resto] = texto.split(/\s+/);
  const args = resto.join(' ');
  const cmd = comando.toLowerCase().replace(/@\w+$/, ''); // quita @nombre_bot en grupos

  switch (cmd) {
    case '/start':
    case '/ayuda':
    case '/help':
      return AYUDA;
    case '/resumen':
      return textoResumen();
    case '/hoy':
      return textoHoy();
    case '/pendientes':
      return textoPendientes();
    case '/consejos':
      return textoConsejos();
    case '/deudas':
      return textoDeudas();
    case '/borrar':
    case '/deshacer':
      return borrarUltimo();
    case '/cat':
      return corregirCategoria(args);
    case '/abono':
      return abonar(args);
    case '/tarjetas':
    case '/creditos':
    case '/créditos':
      return textoTarjetas();
    case '/saldo':
    case '/cuentas':
      return saldoCuenta(args);
    case '/compra':
      return compraConTarjeta(args);
    case '/ajuste':
      return ajustar(args);
    case '/pague':
    case '/pagué':
    case '/pagado':
      return marcarPagado(args);
  }
  if (cmd.startsWith('/')) return 'No conozco ese comando. Escribe /ayuda.';
  const credito = await creditoDelMensaje(texto);
  if (credito) return credito;
  if (/^ajuste\b/i.test(texto)) return ajustar(texto.replace(/^ajuste\s*/i, ''));
  if (/^abono\b/i.test(texto)) return abonar(texto.replace(/^abono\s*(a\s+)?/i, ''));
  // "pagué el gimnasio" sin monto: marca un fijo o una cuota como pagada
  if (/^pagu[eé]\s/i.test(texto) && !extraerMonto(texto)) {
    return marcarPagado(texto.replace(/^pagu[eé]\s+(el|la|lo de|los|las)?\s*/i, ''));
  }

  return registrar(texto);
}

async function registrar(texto: string): Promise<string> {
  const aprendidas = await db.palabrasAprendidas();
  let dato = interpretar(texto, aprendidas);
  let usoIA = false;

  // La IA solo entra si el intérprete no entendió o no supo la categoría.
  if (!dato || (dato.tipo === 'gasto' && !dato.categoria)) {
    const ia = await interpretarConIA(texto);
    if (ia.ok) {
      usoIA = true;
      // Si ya teníamos monto y concepto, de la IA solo tomamos la categoría.
      dato = dato ? { ...dato, categoria: ia.dato.categoria } : ia.dato;
    } else if (!dato) {
      if (ia.motivo === 'limite') {
        return 'No te entendí y la IA ya llegó a su límite de hoy. Escríbelo así: <code>almuerzo 15000</code>';
      }
      return 'No te entendí 🤔 Escríbelo así: <code>almuerzo 15000</code> o <code>gasolina 40 mil</code>. /ayuda';
    }
  }

  if (dato.tipo === 'ingreso') {
    await db.insertarIngreso({ concepto: dato.concepto, monto: dato.monto });
    const r = await db.resumen();
    return [
      `💰 Ingreso registrado: <b>${esc(dato.concepto)}</b> ${pesos(dato.monto)}`,
      `Ingresos del mes: ${pesos(r.ingresos)} · libre: <b>${pesos(r.disponible)}</b>`,
      r.disponible > 0 ? `Hoy puedes gastar hasta <b>${pesos(r.presupuestoHoy)}</b> (faltan ${r.proximoPago.dias} días para el ${r.proximoPago.dia}).` : '',
    ].filter(Boolean).join('\n');
  }

  const categoria = dato.categoria ?? 'Otros';
  await db.insertarGasto({ concepto: dato.concepto, monto: dato.monto, categoria, origen: 'telegram', texto });
  const r = await db.resumen();
  const quedaHoy = r.presupuestoHoy - r.gastadoHoy;

  const lineas = [`✅ <b>${esc(dato.concepto)}</b> ${pesos(dato.monto)} · ${categoria}${usoIA ? ' 🤖' : ''}`];
  if (r.ingresos === 0) {
    lineas.push('Aún no registras ingresos este mes. Escríbeme <code>me pagaron 1100000</code> o <code>tengo 300 mil</code> para calcular cuánto te alcanza.');
  } else if (r.disponible < 0) {
    lineas.push(`⚠️ Vas <b>${pesos(-r.disponible)}</b> por encima de lo que tienes este mes.`);
  } else if (quedaHoy >= 0) {
    lineas.push(`Hoy te quedan <b>${pesos(quedaHoy)}</b> de ${pesos(r.presupuestoHoy)}. Libre en el mes: ${pesos(r.disponible)}.`);
  } else {
    lineas.push(`⚠️ Hoy te pasaste <b>${pesos(-quedaHoy)}</b> del límite (${pesos(r.presupuestoHoy)}). Mañana el límite baja para compensar.`);
  }
  if (categoria === 'Otros') lineas.push('¿Categoría equivocada? Corrígela con /cat Comida (o la que sea).');
  return lineas.join('\n');
}

async function textoResumen(): Promise<string> {
  const r = await db.resumen();
  const cats = r.porCategoria.length
    ? r.porCategoria.map((c) => `• ${esc(c.categoria)}: ${pesos(c.total)}`).join('\n')
    : '• Aún no registras gastos este mes.';
  return `<b>📊 Este mes</b>
Ingresos: ${pesos(r.ingresos)}
Cuotas de deudas: −${pesos(r.cuotas)}
Gastos fijos: −${pesos(r.fijos)}
Gastos del día a día: −${pesos(r.variables)}${r.extraAbonos ? `\nAbonos extra a deudas: −${pesos(r.extraAbonos)}` : ''}
<b>Te queda libre: ${pesos(r.disponible)}</b>
${r.disponible > 0 ? `Hoy puedes gastar ~${pesos(r.presupuestoHoy)} (faltan ${r.proximoPago.dias} días para el ${r.proximoPago.dia}).` : ''}

<b>En qué se va tu plata</b>
${cats}`;
}

async function textoHoy(): Promise<string> {
  const [gs, r] = await Promise.all([db.gastosDeHoy(), db.resumen()]);
  const cabecera = r.ingresos > 0 && r.disponible > 0
    ? `<b>Hoy puedes gastar ${pesos(r.presupuestoHoy)}</b> · llevas ${pesos(r.gastadoHoy)}`
    : '<b>Hoy</b>';
  if (!gs.length) return `${cabecera}\nNo has registrado gastos hoy 👌`;
  return `${cabecera}\n${gs.map((g) => `• ${esc(g.concepto)} ${pesos(g.monto)} (${esc(g.categoria)})`).join('\n')}`;
}

async function textoPendientes(): Promise<string> {
  const r = await db.resumen();
  if (!r.pendientes.length) {
    return r.cuotas + r.fijos > 0
      ? '🎉 Ya pagaste todas las cuotas y gastos fijos de este mes.'
      : 'Aún no tienes gastos fijos ni deudas registradas. Agrégalos en el dashboard para saber qué te falta pagar.';
  }
  return `<b>Te falta pagar este mes</b>\n${r.pendientes
    .map((p) => `• ${esc(p.nombre)} ${pesos(p.monto)}${p.tipo === 'cuota' ? ' (cuota)' : ''}`)
    .join('\n')}\n<b>Total: ${pesos(r.totalPendiente)}</b>\n\nCuando pagues uno: <code>/pague gimnasio</code>`;
}

async function textoConsejos(): Promise<string> {
  const [r, ds, fs] = await Promise.all([db.resumen(), db.deudas(), db.fijos()]);
  const cs = generarConsejos(r, ds, fs).slice(0, 4);
  if (!cs.length) return 'Todo en orden por ahora 👌';
  const icono = { alerta: '🔴', aviso: '🟠', idea: '💡', bien: '🟢' } as const;
  return cs.map((c) => `${icono[c.nivel]} <b>${esc(c.titulo)}</b>\n${esc(c.texto)}`).join('\n\n');
}

async function textoDeudas(): Promise<string> {
  const ds = (await db.deudas()).filter((d) => d.saldo > 0);
  if (!ds.length) return '🎉 No tienes deudas registradas.';
  const total = ds.reduce((s, d) => s + d.saldo, 0);
  return `<b>💳 Deudas (orden de ataque)</b>\n${ds
    .map((d, i) => {
      const cuotaLista = d.abonadoMes >= d.cuota && d.cuota > 0 ? ' ✓ cuota del mes' : '';
      return `${i + 1}. <b>${esc(d.nombre)}</b> — saldo ${pesos(d.saldo)} · cuota ${pesos(d.cuota)}${d.tasa ? ` · ${esc(d.tasa)}` : ''}${cuotaLista}${i === 0 ? ' ← pagar primero' : ''}`;
    })
    .join('\n')}\n\nDebes en total: <b>${pesos(total)}</b>`;
}

async function borrarUltimo(): Promise<string> {
  const g = await db.ultimoGasto();
  if (!g) return 'No hay gastos para borrar.';
  await db.borrarGasto(g.id);
  return `🗑️ Borré: ${esc(g.concepto)} ${pesos(g.monto)}`;
}

async function corregirCategoria(args: string): Promise<string> {
  const categoria = normalizarCategoria(args);
  if (!categoria) return `Dime la categoría, por ejemplo /cat Salidas\nOpciones: ${CATEGORIAS.join(', ')}`;
  const g = await db.ultimoGasto();
  if (!g) return 'No hay gastos para corregir.';
  await db.actualizarGasto(g.id, { concepto: g.concepto, monto: g.monto, categoria });

  const palabras = sinTildes(g.concepto.toLowerCase())
    .split(/[^\p{L}\d]+/u)
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
  await db.aprenderPalabras(palabras, categoria);
  return `Listo: <b>${esc(g.concepto)}</b> ahora es ${categoria}. La próxima vez lo clasifico solo 👍`;
}

async function abonar(args: string): Promise<string> {
  const m = extraerMonto(args);
  const nombre = m?.resto.trim();
  if (!m || !nombre) return 'Escríbelo así: <code>/abono nequi 50000</code>';
  const encontrada = mejor(await db.deudas(), (x) => x.nombre, nombre);
  const d = encontrada ? await db.abonarDeudaPorId(encontrada.item.id, m.monto) : null;
  if (!d) return `No encontré una deuda que se llame "${esc(nombre)}". Mira /deudas.`;
  return d.saldo === 0
    ? `🎉 ¡Pagaste <b>${esc(d.nombre)}</b> por completo! Esa cuota de ${pesos(d.cuota)} ahora puede ir a la siguiente deuda.`
    : `Abono de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(d.saldo)}</b>`;
}

async function marcarPagado(args: string): Promise<string> {
  const nombre = args.trim();
  if (!nombre) return 'Dime qué pagaste, por ejemplo <code>/pague gimnasio</code> o <code>/pague nu</code>.';
  const [fs, ds] = await Promise.all([db.fijos(), db.deudas()]);
  const f = mejor(fs, (x) => x.concepto, nombre);
  const d = mejor(ds.filter((x) => x.saldo > 0), (x) => x.nombre, nombre);
  if (f && (!d || f.puntos >= d.puntos)) {
    const fijo = f.item;
    if (fijo.pagadoMes) return `<b>${esc(fijo.concepto)}</b> ya estaba marcado como pagado este mes.`;
    await db.marcarFijo(fijo.id, true);
    return `✓ <b>${esc(fijo.concepto)}</b> (${pesos(fijo.monto)}) quedó pagado este mes.`;
  }
  if (d) {
    const deuda = d.item;
    const falta = Math.min(deuda.saldo, deuda.cuota - deuda.abonadoMes);
    if (falta <= 0) return `La cuota de <b>${esc(deuda.nombre)}</b> ya estaba pagada este mes.`;
    const nueva = await db.abonarDeudaPorId(deuda.id, falta);
    return `✓ Cuota de <b>${esc(deuda.nombre)}</b> pagada (${pesos(falta)}). Saldo nuevo: <b>${pesos(nueva?.saldo ?? 0)}</b>`;
  }
  return `No encontré un gasto fijo ni una deuda que se llame "${esc(nombre)}". Mira /pendientes.`;
}

/** "-20000", "+50 mil", "menos 20 mil no sé en qué": cuadra la plata sin explicar. */
async function ajustar(args: string): Promise<string> {
  const m = extraerMonto(args);
  if (!m) return 'Escríbelo así: <code>/ajuste -20000</code> si te falta plata o <code>/ajuste +20000</code> si te sobra.';
  const positivo = /^\s*(\+|m[aá]s\b|sobra)/i.test(args) || /\bme sobr/i.test(args);
  const nota = m.resto.replace(/^[+\-−]\s*/, '').replace(/^(m[aá]s|menos)\s+/i, '').trim();
  const notaBonita = nota.charAt(0).toUpperCase() + nota.slice(1);
  if (positivo) {
    await db.insertarIngreso({ concepto: nota ? `Ajuste: ${notaBonita}` : 'Ajuste', monto: m.monto });
  } else {
    await db.insertarGasto({ concepto: notaBonita || 'Ajuste sin explicar', monto: m.monto, categoria: 'Ajuste', origen: 'telegram', texto: args });
  }
  const r = await db.resumen();
  return `⚖️ Ajuste ${positivo ? '+' : '−'}${pesos(m.monto)}${nota ? ` (${esc(nota)})` : ''}. Libre en el mes: <b>${pesos(r.disponible)}</b>`;
}

// ---------------------------------------------------------------------------
// Tarjetas y créditos

const GENERICAS = new Set(['tarjeta', 'credito', 'banco', 'prestamo', 'de', 'la', 'el', 'del', 'visa', 'mastercard']);
const normal = (t: string) => sinTildes(t.toLowerCase()).replace(/[^\p{L}\d]+/gu, ' ').trim();

/** El crédito que el texto menciona, por banco o por nombre. */
function encontrarCredito(texto: string, ds: db.Deuda[]): db.Deuda | null {
  const t = ` ${normal(texto)} `;
  const banco = bancoEnTexto(texto);
  let top: { d: db.Deuda; p: number } | null = null;
  for (const d of ds) {
    let p = 0;
    const nombre = normal(d.nombre);
    if (nombre && t.includes(` ${nombre} `)) p = 3;
    else if (banco && d.banco === banco.id) p = 3;
    else if (nombre.split(' ').some((w) => w.length >= 3 && !GENERICAS.has(w) && t.includes(` ${w} `))) p = 1;
    if (p && d.tipo === 'tarjeta') p += 0.5;
    if (p && (!top || p > top.p)) top = { d, p };
  }
  return top?.d ?? null;
}

const RE_CUOTAS = /\b(?:a\s+)?(\d{1,2}|una|un)\s+cuotas?\b/i;

/** "hice compra con la tarjeta AV Villas por 120 mil", "pagué la cuota de la Nu", "pagué 200 mil a la AV Villas". */
async function creditoDelMensaje(texto: string): Promise<string | null> {
  const mencionaTarjeta = /\b(tarjeta|t\.?c\.?|cr[eé]dito)\b/i.test(texto);
  // Sin \b: después de una tilde ("compré", "pagué") \b no funciona en JavaScript.
  const esPago = /^(pagu[eé]|abon[eé])(?![\p{L}\d])/iu.test(texto);
  const esCompra = (/(?<![\p{L}\d])(compr[\p{L}]*|hice|gast[eé])(?![\p{L}\d])/iu.test(texto) || esPago) && (mencionaTarjeta || /\bcon\b/i.test(texto));
  if (!mencionaTarjeta && !bancoEnTexto(texto) && !(esPago && /\bcuota\b/i.test(texto))) return null;

  const ds = await db.deudas();
  const d = encontrarCredito(texto, ds);
  if (!d) {
    if (!mencionaTarjeta) return null;
    const tarjetas = ds.filter((x) => x.tipo === 'tarjeta');
    return tarjetas.length
      ? `¿Con cuál tarjeta? Tienes: ${tarjetas.map((x) => esc(x.nombre)).join(', ')}. Ej: <code>compré con la ${esc(tarjetas[0].nombre)} 50 mil</code>`
      : 'Aún no tienes tarjetas registradas. Agrégalas en el dashboard, pestaña Billetera.';
  }

  if (esCompra) return compraConTarjeta(texto, d);
  if (esPago) {
    const m = extraerMonto(texto.replace(RE_CUOTAS, ' '));
    if (m && !/\bcuota\b/i.test(texto)) {
      const nueva = await db.abonarDeudaPorId(d.id, m.monto);
      return `✓ Pago de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(nueva?.saldo ?? 0)}</b>${textoCupo(d, nueva?.saldo)}`;
    }
    const falta = Math.min(d.saldo, d.cuota - d.abonadoMes);
    if (falta <= 0) return `La cuota de <b>${esc(d.nombre)}</b> ya estaba pagada este mes.`;
    const monto = m?.monto ?? falta;
    const nueva = await db.abonarDeudaPorId(d.id, monto);
    return `✓ Cuota de <b>${esc(d.nombre)}</b> pagada (${pesos(monto)}). Saldo nuevo: <b>${pesos(nueva?.saldo ?? 0)}</b>${textoCupo(d, nueva?.saldo)}`;
  }
  return null;
}

function textoCupo(d: db.Deuda, saldo = d.saldo): string {
  if (d.tipo !== 'tarjeta' || !d.cupo) return '';
  return `\nCupo disponible: <b>${pesos(Math.max(0, d.cupo - saldo))}</b> de ${pesos(d.cupo)}`;
}

async function compraConTarjeta(texto: string, credito?: db.Deuda): Promise<string> {
  const d = credito ?? encontrarCredito(texto, await db.deudas());
  if (!d) return 'Dime con qué tarjeta, por ejemplo <code>/compra av villas 120000</code>. Mira tus tarjetas con /tarjetas.';
  const cuotasTxt = texto.match(RE_CUOTAS)?.[1];
  const cuotas = !cuotasTxt ? 1 : /^un/i.test(cuotasTxt) ? 1 : Number(cuotasTxt);
  const m = extraerMonto(texto.replace(RE_CUOTAS, ' '));
  if (!m) return `¿Por cuánto fue la compra con <b>${esc(d.nombre)}</b>? Ej: <code>compré con la ${esc(d.nombre)} 120 mil</code>`;

  // El concepto es lo que queda al quitar verbos, el banco y el nombre de la tarjeta.
  const quitar = new Set([
    ...normal(d.nombre).split(' '), ...(d.banco ? bancoPorId(d.banco).alias.flatMap((a) => a.split(' ')) : []),
    'hice', 'una', 'un', 'compra', 'compre', 'compro', 'compramos', 'con', 'la', 'el', 'mi', 'tarjeta', 'de', 'del', 'credito', 'tc',
    'por', 'en', 'pague', 'gaste', 'banco', 'a', 'y', 'valor', 'pesos', 'compra',
  ]);
  const palabras = m.resto.split(/\s+/).filter((w) => w && !quitar.has(normal(w)));
  const concepto = palabras.join(' ').replace(/^\W+|\W+$/g, '');
  const bonito = concepto ? concepto.charAt(0).toUpperCase() + concepto.slice(1) : 'Compra';

  const r = await db.registrarCompraCredito(d.id, { concepto: bonito, monto: m.monto, cuotas });
  if (!r) return 'No pude registrar la compra. Intenta otra vez.';
  const lineas = [
    `💳 Compra con <b>${esc(r.nombre)}</b>: ${esc(bonito)} ${pesos(m.monto)}${cuotas > 1 ? ` a ${cuotas} cuotas (+${pesos(Math.round(m.monto / cuotas))} a la cuota mensual)` : ''}`,
    `Debes en esa tarjeta: <b>${pesos(r.saldo)}</b>`,
  ];
  if (r.cupo) {
    const disp = r.cupo - r.saldo;
    lineas.push(disp >= 0 ? `Cupo disponible: <b>${pesos(disp)}</b> de ${pesos(r.cupo)}` : `⚠️ Te pasaste del cupo por ${pesos(-disp)}`);
  }
  lineas.push('No resta de tu plata del mes: sale cuando pagues la cuota.');
  return lineas.join('\n');
}

async function textoTarjetas(): Promise<string> {
  const ds = (await db.deudas()).filter((d) => d.tipo === 'tarjeta');
  if (!ds.length) return 'No tienes tarjetas registradas. Agrégalas en el dashboard, pestaña Billetera.';
  return `<b>💳 Tus tarjetas</b>\n${ds
    .map((d) => {
      const cupo = d.cupo ? ` · disponible <b>${pesos(Math.max(0, d.cupo - d.saldo))}</b> de ${pesos(d.cupo)}` : '';
      return `• <b>${esc(d.nombre)}</b>${d.ultimos4 ? ` ••${esc(d.ultimos4)}` : ''}: debes ${pesos(d.saldo)}${cupo}`;
    })
    .join('\n')}`;
}

async function saldoCuenta(args: string): Promise<string> {
  const cs = await db.cuentas();
  const m = extraerMonto(args);
  if (!m) {
    if (!cs.length) return 'No tienes cuentas registradas. Agrégalas en el dashboard, pestaña Billetera.';
    const total = cs.reduce((s, c) => s + c.saldo, 0);
    return `<b>🏦 Tus cuentas</b>\n${cs.map((c) => `• ${esc(c.nombre)}: ${pesos(c.saldo)}`).join('\n')}\n<b>Total: ${pesos(total)}</b>`;
  }
  const t = ` ${normal(m.resto)} `;
  const banco = bancoEnTexto(m.resto);
  const c = cs.find((x) => normal(x.nombre) && t.includes(` ${normal(x.nombre)} `)) ?? cs.find((x) => banco && x.banco === banco.id);
  if (!c) return `No encontré esa cuenta. Tienes: ${cs.map((x) => esc(x.nombre)).join(', ') || 'ninguna'}. Ej: <code>/saldo nequi 250000</code>`;
  await db.actualizarSaldoCuenta(c.id, m.monto);
  return `🏦 Saldo de <b>${esc(c.nombre)}</b>: ${pesos(m.monto)}`;
}
