import { CATEGORIAS, normalizarCategoria, sinTildes } from './categorias';
import { extraerMonto, interpretar } from './parser';
import { interpretarConIA } from './gemini';
import * as db from './datos';
import { esc, pesos } from './telegram';

const AYUDA = `<b>Cómo usarme</b>
Escríbeme el gasto como te salga:
• <code>almuerzo 15 mil</code>
• <code>gasolina 40k</code>
• <code>salida con mi novia 70000</code>
• <code>me pagaron 1.100.000</code> (ingreso)

<b>Comandos</b>
/resumen — cómo vas este mes
/hoy — lo que gastaste hoy
/deudas — tus deudas en orden de ataque
/abono nequi 50000 — registra un abono a una deuda
/cat Salidas — corrige la categoría del último gasto (y aprendo)
/borrar — borra el último gasto

Categorías: ${CATEGORIAS.join(', ')}`;

const PALABRAS_VACIAS = new Set(['con', 'mi', 'mis', 'para', 'por', 'del', 'las', 'los', 'una', 'que']);

export async function manejarMensaje(textoCrudo: string): Promise<string> {
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
    case '/deudas':
      return textoDeudas();
    case '/borrar':
    case '/deshacer':
      return borrarUltimo();
    case '/cat':
      return corregirCategoria(args);
    case '/abono':
      return abonar(args);
  }
  if (cmd.startsWith('/')) return 'No conozco ese comando. Escribe /ayuda.';
  if (/^abono\b/i.test(texto)) return abonar(texto.replace(/^abono\s*(a\s+)?/i, ''));

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
    return `💰 Ingreso registrado: <b>${esc(dato.concepto)}</b> ${pesos(dato.monto)}\nIngresos del mes: ${pesos(r.ingresos)}\nTe queda libre: <b>${pesos(r.disponible)}</b>`;
  }

  const categoria = dato.categoria ?? 'Otros';
  await db.insertarGasto({ concepto: dato.concepto, monto: dato.monto, categoria, origen: 'telegram', texto });
  const r = await db.resumen();

  const lineas = [
    `✅ <b>${esc(dato.concepto)}</b> ${pesos(dato.monto)} · ${categoria}${usoIA ? ' 🤖' : ''}`,
    r.disponible >= 0
      ? `Te quedan <b>${pesos(r.disponible)}</b> este mes (~${pesos(r.porDia)} por día, ${r.diasRestantes} días).`
      : `⚠️ Vas <b>${pesos(-r.disponible)}</b> por encima de lo que tienes este mes.`,
  ];
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
Gastos variables: −${pesos(r.variables)}
<b>Te queda libre: ${pesos(r.disponible)}</b>
${r.disponible > 0 ? `Puedes gastar ~${pesos(r.porDia)} por día (${r.diasRestantes} días restantes).` : ''}

<b>En qué se va tu plata</b>
${cats}`;
}

async function textoHoy(): Promise<string> {
  const gs = await db.gastosDeHoy();
  if (!gs.length) return 'Hoy no has registrado gastos 👌';
  const total = gs.reduce((s, g) => s + g.monto, 0);
  return `<b>Hoy</b>\n${gs.map((g) => `• ${esc(g.concepto)} ${pesos(g.monto)} (${esc(g.categoria)})`).join('\n')}\n<b>Total: ${pesos(total)}</b>`;
}

async function textoDeudas(): Promise<string> {
  const ds = (await db.deudas()).filter((d) => d.saldo > 0);
  if (!ds.length) return '🎉 No tienes deudas registradas.';
  const total = ds.reduce((s, d) => s + d.saldo, 0);
  return `<b>💳 Deudas (orden de ataque)</b>\n${ds
    .map((d, i) => `${i + 1}. <b>${esc(d.nombre)}</b> — saldo ${pesos(d.saldo)} · cuota ${pesos(d.cuota)}${d.tasa ? ` · ${esc(d.tasa)}` : ''}${i === 0 ? ' ← pagar primero' : ''}`)
    .join('\n')}\n\nDebes en total: <b>${pesos(total)}</b>`;
}

async function borrarUltimo(): Promise<string> {
  const g = await db.ultimoGasto();
  if (!g) return 'No hay gastos para borrar.';
  await db.borrarGasto(g.id);
  return `🗑️ Borré: ${esc(g.concepto)} ${pesos(Number(g.monto))}`;
}

async function corregirCategoria(args: string): Promise<string> {
  const categoria = normalizarCategoria(args);
  if (!categoria) return `Dime la categoría, por ejemplo /cat Salidas\nOpciones: ${CATEGORIAS.join(', ')}`;
  const g = await db.ultimoGasto();
  if (!g) return 'No hay gastos para corregir.';
  await db.actualizarGasto(g.id, { concepto: g.concepto, monto: Number(g.monto), categoria });

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
  const d = await db.abonarDeuda(nombre, m.monto);
  if (!d) return `No encontré una deuda que se llame "${esc(nombre)}". Mira /deudas.`;
  return d.saldo === 0
    ? `🎉 ¡Pagaste <b>${esc(d.nombre)}</b> por completo!`
    : `Abono de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(d.saldo)}</b>`;
}
