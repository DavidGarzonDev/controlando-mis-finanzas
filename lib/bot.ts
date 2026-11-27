import { CATEGORIAS, conEmoji, normalizarCategoria, sinTildes } from './categorias';
import { barra, filas, tarjetaGasto, tarjetaIngreso, textoCategorias } from './mensajes';
import { pareceNotificacion } from './notificaciones';
import { alertasGasto } from './alertas';
import { esPregunta } from './preguntas';
import { extraerMonto, interpretar } from './parser';
import { interpretarConIA } from './ia';
import { generarConsejos, simularPago, tasaMensual } from './consejos';
import { CATALOGO, crearReto, retos as cargarRetos, retosParaAvisar } from './retos';
import { asegurarEsquema } from './esquema';
import * as db from './datos';
import { esc, pesos, type Boton } from './telegram';

/** Lo que responde el bot: texto, y a veces botones para tocar (ej. ¿de qué cuenta salió?). */
export type Respuesta = string | { texto: string; botones: Boton[][]; menu?: boolean; semana?: boolean };
import { bancoEnTexto, bancoPorId } from './bancos';

const AYUDA = `<b>Cómo usarme</b>
Escríbeme el gasto como te salga:
• <code>almuerzo 15 mil</code>
• <code>gasolina 40k</code>
• <code>salida con mi novia 70000</code>

¿Pagaste la cuenta de varios? Divídela y lo de los demás queda en <b>Te deben</b>:
• <code>almuerzo 60 mil entre 3</code>
• <code>cena 120 mil dividido entre juan, ana y yo</code> · <code>taxi 18 mil a medias con laura</code>

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
/intereses — cuánto pagarás en intereses y cuánto te ahorras abonando a capital
/retos — tus retos · /reto domicilios — semana sin domicilios (también: salidas, limite, cero)

<b>Cuentas, topes y metas</b>
• <code>almuerzo 15 mil con nequi</code> — el gasto sale de esa cuenta
• <code>pasé 100 mil de bancolombia a nequi</code> — transferencia
• <code>le mandé 50 mil a juan por nequi y me dio efectivo</code> — cambio a efectivo
• <code>le mandé 50 mil a mi mamá por llave desde bancolombia</code> — envío (gasto)
• <code>retiré 100 mil de nequi</code> — pasa al efectivo · <code>consigné 50 mil en bancolombia</code>
• <code>abono a capital nu 200 mil</code> — abono extra que baja la deuda
• <code>aparté 100 mil para el viaje</code> — aporte a una meta
/tope salidas 150000 — tope mensual por categoría (/topes para verlos)
/metas — cómo vas con tus metas de ahorro
/suscripciones — pagos que se repiten cada mes
/hormiga — gastos pequeños que se acumulan
También puedes mandarme una <b>nota de voz</b> o la <b>foto de un recibo</b>.
/saldo nequi 250000 — actualiza el saldo de una cuenta (sin monto: ver saldos)
/cuenta efectivo — qué movió el saldo de esa cuenta, paso a paso
/pague gimnasio — marca un gasto fijo o una cuota como pagada
<code>ya pagué la cuota de la nu</code> — si la pagaste en el banco y el saldo ya está al día: solo la marca
/ajuste -20000 — cuadra plata que no sabes en qué se fue (o +20000 si te sobra)
/borrar — borra el último gasto

<b>Categorías</b>
Debajo de cada gasto tienes los botones <b>Categoría</b>, <b>Cuenta</b> y <b>Deshacer</b>.
/categorias — ver todas · <code>/categoria Mascotas 🐶</code> — crear una tuya
/cat Salidas — corrige la categoría del último gasto (y aprendo)

<b>Seguridad del dashboard</b>
/sesiones — dónde tienes la sesión abierta
/cerrarsesiones — saca a todos los dispositivos
/desbloquear — quita el bloqueo por intentos fallidos

<b>Pregúntale a Pilas</b>\n• <code>¿cuánto gasté en gasolina este mes?</code>\n• <code>¿en qué se me fue la plata esta quincena?</code>\n\n/semana — resumen de los últimos 7 días con imagen (llega solo cada domingo)
/menu — muestra los botones de abajo (Hoy, Resumen, Por pagar…)`;

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

export async function manejarMensaje(textoCrudo: string): Promise<Respuesta> {
  await asegurarEsquema();
  const texto = textoCrudo.trim();
  const [comando, ...resto] = texto.split(/\s+/);
  const args = resto.join(' ');
  const cmd = comando.toLowerCase().replace(/@\w+$/, ''); // quita @nombre_bot en grupos

  // Pegaste o reenviaste la notificación del banco: se registra igual que si llegara del celular
  if (!texto.startsWith('/') && pareceNotificacion(texto)) {
    const { procesarNotificacion } = await import('./automatico');
    const r = await procesarNotificacion(texto);
    if (r.ok) return r.respuesta;
    if (r.respuesta) return r.respuesta;
    if (r.motivo === 'repetida') return 'Esa notificación ya la había registrado 👌';
  }

  // "movimientos del efectivo", "historial de nequi", "qué pasó con el efectivo"
  const pideHistorial = texto.match(/^(?:movimientos|historial|qu[eé] pas[oó] con)\s+(?:de\s+|del\s+|con\s+)?(?:la\s+|el\s+|mi\s+)?(.+)$/i);
  if (pideHistorial && !extraerMonto(texto)) return historialCuenta(pideHistorial[1]);

  // Los botones del menú fijo llegan como texto ("Hoy", "Por pagar"…)
  const delMenu: Record<string, string> = { hoy: '/hoy', resumen: '/resumen', 'por pagar': '/pendientes', metas: '/metas', tarjetas: '/tarjetas', deshacer: '/deshacer', menu: '/menu', 'menú': '/menu' };
  const atajo = delMenu[texto.toLowerCase()];
  if (atajo) return manejarMensaje(atajo);

  switch (cmd) {
    case '/start':
      return { texto: AYUDA, botones: [], menu: true };
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
    case '/cuenta':
    case '/historial':
      return historialCuenta(args);
    case '/compra':
      return compraConTarjeta(args);
    case '/ajuste':
      return ajustar(args);
    case '/pague':
    case '/pagué':
    case '/pagado':
      return marcarPagado(args);
    case '/yapague':
    case '/yapagué':
      return yaPague(args);
    case '/retos':
      return textoRetos();
    case '/categoria':
    case '/categoría':
    case '/categorias':
    case '/categorías':
      return comandoCategoria(args);
    case '/pregunta':
    case '/preguntar':
      if (!args) return 'Pregúntame lo que quieras de tu plata, por ejemplo: <code>¿cuánto gasté en gasolina este mes?</code>';
      return (await import('./preguntas')).responderPregunta(args);
    case '/prestamos':
    case '/préstamos':
    case '/medeben':
      return textoPrestamos();
    case '/semana':
      return { texto: 'Te mando el resumen de la semana 📊', botones: [], semana: true };
    case '/menu':
    case '/menú':
      return { texto: 'Aquí tienes el menú abajo. Toca una opción o escríbeme un gasto como siempre.', botones: [], menu: true };
    case '/sesiones':
      return textoSesiones();
    case '/cerrarsesiones':
    case '/salir':
      return cerrarSesionesWeb();
    case '/desbloquear':
      return desbloquearWeb();
    case '/reto':
      return empezarReto(args);
    case '/intereses':
      return textoIntereses();
    case '/tope':
    case '/topes':
      return topes(args);
    case '/metas':
      return textoMetas();
    case '/ahorro':
    case '/ahorrar':
      return ahorrar(args);
    case '/transferir':
    case '/pase':
      return transferirCuentas(args);
    case '/retiro':
    case '/retirar':
      return retiroOConsignacion(args, 'retiro');
    case '/consignar':
    case '/consignacion':
      return retiroOConsignacion(args, 'consignacion');
    case '/capital':
      return abonar(args, 'capital');
    case '/suscripciones':
      return textoSuscripciones();
    case '/hormiga':
      return textoHormiga();
  }
  if (cmd.startsWith('/')) return 'No conozco ese comando. Escribe /ayuda.';
  // "cancela", "bórralo", "me equivoqué", "deshacer": borra el último movimiento
  if (/^(cancela(r|lo)?|b[oó]rra(lo|r)?|borra eso|eso no|me equivoqu[eé]|deshacer|deshaz|anula(r|lo)?|elimina(r|lo)?)(?![\p{L}\d])/iu.test(texto) && !extraerMonto(texto)) {
    return borrarUltimo();
  }
  // "ya pagué la nu" / "ya pagué la cuota de la av villas": solo marca la cuota (o el fijo) como pagada, sin mover saldos
  if (/^ya\s+(la\s+|lo\s+)?pagu[eé](?![\p{L}\d])/iu.test(texto)) {
    return yaPague(texto.replace(/^ya\s+(la\s+|lo\s+)?pagu[eé]\s*/iu, ''));
  }
  const credito = await creditoDelMensaje(texto);
  if (credito) return credito;
  if (/^ajuste\b/i.test(texto)) return ajustar(texto.replace(/^ajuste\s*/i, ''));
  // "retiré 100 mil de nequi" → pasa a efectivo; "consigné 50 mil en bancolombia" → sale del efectivo
  if (/^(retir[eé]|saqu[eé])(?![\p{L}\d])/iu.test(texto) && extraerMonto(texto)) {
    return retiroOConsignacion(texto.replace(/^\S+\s*/, ''), 'retiro');
  }
  if (/^(consign[eé]|deposit[eé])(?![\p{L}\d])/iu.test(texto) && extraerMonto(texto)) {
    return retiroOConsignacion(texto.replace(/^\S+\s*/, ''), 'consignacion');
  }
  // "abono a capital nu 200 mil"
  if (/\bcapital\b/i.test(texto) && /^(abono|abon[eé]|pagu[eé])/i.test(texto) && extraerMonto(texto)) {
    return abonar(texto.replace(/^\S+\s*/, '').replace(/^(a\s+)?capital\s*(a|de|en)?\s*(la|el)?\s*/i, ''), 'capital');
  }
  // "aparté 100 mil para el viaje", "ahorré 50 mil en el fondo de emergencia"
  if (/^(apart[eé]|ahorr[eé]|guard[eé])(?![\p{L}\d])/iu.test(texto) && extraerMonto(texto)) {
    const r = await ahorrar(texto.replace(/^\S+\s*/, ''), true);
    if (r) return r;
  }
  // "le presté 30 mil al abuelo de mi novia en efectivo" → préstamo (no es gasto, queda en "te deben")
  if (/^(le\s+|les\s+)?(prest[eé]|hice un pr[eé]stamo)(?![\p{L}\d])/iu.test(texto) && extraerMonto(texto)) {
    const r = await prestar(texto);
    if (r) return r;
  }
  // "me devolvió juan 30 mil", "juan me pagó lo que le presté" → abono a un préstamo (no es ingreso)
  if (/\bme\s+(devolvi[oó]|devolvieron|pag[oó]|pagaron|abon[oó]|consign[oó]|transfiri[oó]|mand[oó]|envi[oó]|dio)(?![\p{L}\d])/iu.test(texto)) {
    const r = await cobrar(texto);
    if (r) return r;
  }
  if (/^¿?(qui[eé]n(es)?|cu[aá]nto)\s+me\s+deben?\b/i.test(texto)) return textoPrestamos();

  // "le mandé 50 mil a juan por nequi y me dio efectivo" (cambio) o "le mandé 50 mil a mi mamá por nequi" (envío)
  if (/^(le\s+|les\s+)?(mand[eé]|envi[eé]|transfer[ií]|gir[eé]|consign[eé]|pas[eé])(?![\p{L}\d])/iu.test(texto) && extraerMonto(texto)) {
    const r = await envioAPersona(texto);
    if (r) return r;
  }
  // "pasé 100 mil de bancolombia a nequi"
  if (/^(pas[eé]|transfer[ií]|mov[ií]|envi[eé])(?![\p{L}\d])/iu.test(texto) && /\b(de|desde)\b.+\b(a|al|para)\b/i.test(texto)) {
    const r = await transferirCuentas(texto.replace(/^\S+\s*/, ''), true);
    if (r) return r;
  }
  if (/^abono\b/i.test(texto)) return abonar(texto.replace(/^abono\s*(a\s+)?/i, ''));
  // "pagué el gimnasio" sin monto: marca un fijo o una cuota como pagada
  if (/^pagu[eé]\s/i.test(texto) && !extraerMonto(texto)) {
    return marcarPagado(texto.replace(/^pagu[eé]\s+(el|la|lo de|los|las)?\s*/i, ''));
  }

  // "¿cuánto gasté en gasolina en octubre?" → Pregúntale a Pilas
  if (esPregunta(texto)) {
    const { responderPregunta } = await import('./preguntas');
    return responderPregunta(texto);
  }

  return registrar(texto);
}

const NUMEROS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const YO = /^(yo|m[ií]|mi|conmigo|el que escribe)$/i;

/**
 * La parte del mensaje que dice que la cuenta se divide, para quitarla antes de registrar:
 *  "almuerzo 60 mil entre 3", "cena 120 mil dividido entre juan, ana y yo", "taxi 18 mil a medias con laura".
 */
export function sacarDivision(texto: string): { resto: string; personas: number; nombres: string[] } | null {
  const num = texto.match(/[\s,]+(?:(?:dividid[oa]s?|partid[oa]s?|la vaca|vaca)\s+)?entre\s+(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)(?:\s+personas)?\s*$/i);
  if (num) {
    const personas = Number(num[1]) || NUMEROS[num[1].toLowerCase()];
    return personas >= 2 ? { resto: texto.slice(0, num.index).trim(), personas, nombres: [] } : null;
  }
  const medias = texto.match(/[\s,]+(?:a medias|mitad y mitad|mitad)\s*$/i);
  if (medias) return { resto: texto.slice(0, medias.index).trim(), personas: 2, nombres: [] };
  const con = texto.match(/[\s,]+(?:(?:dividid[oa]s?|partid[oa]s?)\s+(?:entre|con)|(?:a medias|mitad y mitad|la vaca|vaca)\s+con)\s+(.+)$/i);
  if (!con) return null;
  const nombres = con[1]
    .split(/\s*,\s*|\s+y\s+|\s+e\s+/i)
    .map((x) => x.replace(/^(mi|el|la)\s+/i, (p) => (/^mi\s/i.test(p) ? 'mi ' : '')).trim())
    .filter((x) => x && !YO.test(x) && !/\d/.test(x))
    .map((x) => x[0].toUpperCase() + x.slice(1));
  if (!nombres.length || nombres.length > 20) return null;
  return { resto: texto.slice(0, con.index).trim(), personas: nombres.length + 1, nombres };
}

async function registrar(textoCompleto: string): Promise<Respuesta> {
  const division = sacarDivision(textoCompleto);
  const textoOriginal = division?.resto || textoCompleto;
  // "almuerzo 15 mil con nequi": la cuenta se quita del texto y el gasto sale de esa cuenta.
  // "en monedas" o "en billetes" también es efectivo.
  const esEfectivo = /\b(efectivo|cash|monedas?|billetes?)\b/i.test(textoOriginal);
  if (esEfectivo) await db.cuentaEfectivo();
  const todas = await db.cuentas();
  const efectivo = esEfectivo ? todas.find((c) => c.banco === 'efectivo') : undefined;
  const mencionada = cuentaDelTexto(textoOriginal, todas) ?? (efectivo ? { c: efectivo, resto: textoOriginal.replace(/\b(en\s+)?(monedas?|billetes?)\b/gi, ' ').replace(/\s+/g, ' ').trim() } : null);
  // Si no dices de qué cuenta: con una sola cuenta (o una principal) se usa esa; con varias, te pregunto con botones.
  const principal = todas.find((c) => c.principal) ?? (todas.length === 1 ? todas[0] : undefined);
  const cuenta = mencionada ?? (principal ? { c: principal, resto: textoOriginal } : null);
  const preguntar = !cuenta && todas.length >= 2;
  const texto = cuenta ? cuenta.resto : textoOriginal;
  const aprendidas = await db.palabrasAprendidas();
  let dato = interpretar(texto, aprendidas);
  let usoIA = false;

  // La IA solo entra si el intérprete no entendió o no supo la categoría.
  if (!dato || (dato.tipo === 'gasto' && !dato.categoria)) {
    const ia = await interpretarConIA(texto, await db.nombresPropios());
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

  // "700" sin unidad: ¿$700 o $700.000? Sentido común: monedas (cuidar la moto, propina…) o que no alcance la plata → pesos.
  let preguntaMonto: { pesos: number; mil: number } | null = null;
  if (dato.ambiguo) {
    const { pesos: p, mil } = dato.ambiguo;
    const deMonedas = /\b(cuid\w*|propina|parque\w*|bolsa|chicle|dulce|moneda\w*|limosna|ba[ñn]o|fotocopia\w*|minuto\w*|peaje|vigilante|celador|lavaperros|malabar\w*|semaforo|semáforo)\b/i.test(textoOriginal);
    const plata = cuenta ? cuenta.c.saldo : todas.length ? todas.reduce((s, c) => s + c.saldo, 0) : null;
    const noAlcanza = dato.tipo === 'gasto' && plata != null && mil > Math.max(plata, 0);
    dato = { ...dato, monto: deMonedas || noAlcanza ? p : mil };
    // Si es claramente de monedas (cuidar la moto, propina, "en monedas"…) no hay duda: no pregunto.
    preguntaMonto = deMonedas ? null : dato.ambiguo ?? null;
  }

  const cuentaId = cuenta?.c.id ?? null;
  // "tengo 50 mil en efectivo" → el ingreso se llama como la cuenta, no "Saldo disponible"
  if (cuenta && dato.tipo === 'ingreso' && (dato.concepto === 'Saldo disponible' || dato.concepto === 'Ingreso')) dato = { ...dato, concepto: cuenta.c.nombre };
  const otroMonto = preguntaMonto ? (dato.monto === preguntaMonto.pesos ? preguntaMonto.mil : preguntaMonto.pesos) : null;

  if (dato.tipo === 'ingreso') {
    const idIngreso = await db.insertarIngreso({ concepto: dato.concepto, monto: dato.monto, cuentaId });
    if (otroMonto) await db.guardarDuda('ingreso', idIngreso, otroMonto);
    const t = await tarjetaIngreso(idIngreso);
    return t ?? 'Listo.';
  }

  const categoria = dato.categoria ?? 'Otros';
  const idGasto = await db.insertarGasto({ concepto: dato.concepto, monto: dato.monto, categoria, origen: 'telegram', texto: textoCompleto, cuentaId });
  if (otroMonto) await db.guardarDuda('gasto', idGasto, otroMonto);
  if (division && !otroMonto) await db.dividirGasto(idGasto, division.personas, division.nombres);
  const extra: string[] = [];
  const nuevo = await db.gastoPorId(idGasto);
  if (nuevo) extra.push(...(await alertasGasto(nuevo)));
  if (cuenta?.c.banco === 'efectivo' && cuenta.c.saldo === 0) {
    extra.push('Lo anoté en tu <b>Efectivo</b>. ¿Cuánto tienes en la billetera? Dímelo así: <code>/saldo efectivo 100000</code>');
  }
  for (const x of await retosParaAvisar()) {
    extra.push(x.estado === 'roto'
      ? `💔 Se rompió tu reto <b>${esc(x.nombre)}</b> (ibas ${x.cumplidos} de ${x.meta}). Vuelve a intentarlo con /reto`
      : `🏆 ¡Lograste tu reto <b>${esc(x.nombre)}</b>!`);
  }
  const t = await tarjetaGasto(idGasto, { extra, usoIA });
  return t ?? 'Listo.';
}

/**
 * Toques de botones (del bot o de la paleta web). Cada uno vuelve a dibujar la tarjeta del movimiento.
 *  m:<g|i>:<id>:<monto>   confirma el monto en duda
 *  c:<g|i>:<id>:<cuenta>  le pone cuenta a un movimiento sin cuenta
 *  a:<g|i>:<id>           abre la lista de cuentas · cc:<g|i>:<id>:<cuenta> la cambia
 *  k:<id>                 abre las categorías     · k:<id>:<nombre> la cambia (y aprende)
 *  d:<g|i>:<id>           deshace (borra y devuelve la plata a la cuenta)
 *  v:<g|i>:<id>           vuelve a la tarjeta
 */
export async function procesarBoton(dato: string): Promise<{ aviso: string; texto?: string; botones?: Boton[][] }> {
  await asegurarEsquema();
  type Abierto = 'categoria' | 'cuenta' | 'dividir' | null;
  const tarjeta = async (tipo: string, id: number, abierto: Abierto = null) =>
    tipo === 'g' ? tarjetaGasto(id, { abierto }) : tarjetaIngreso(id, { abierto: abierto === 'cuenta' ? 'cuenta' : null });
  const conTarjeta = async (aviso: string, tipo: string, id: number, abierto: Abierto = null) => {
    const t = await tarjeta(tipo, id, abierto);
    return t ? { aviso, texto: t.texto, botones: t.botones } : { aviso: 'Ese movimiento ya no existe.', texto: '<i>Este movimiento ya no existe.</i>', botones: [] };
  };

  let m = dato.match(/^m:(g|i):(\d+):(\d+)$/);
  if (m) {
    const tipo = m[1] === 'g' ? 'gasto' : 'ingreso';
    const r = await db.corregirMonto(tipo, Number(m[2]), Number(m[3]));
    await db.guardarDuda(tipo, Number(m[2]), null);
    return conTarjeta(r ? `Quedó en ${pesos(r.monto)}` : 'Ese movimiento ya no existe.', m[1], Number(m[2]));
  }
  m = dato.match(/^c:(g|i):(\d+):(\d+)$/);
  if (m) {
    const r = await db.asignarCuenta(m[1] === 'g' ? 'gasto' : 'ingreso', Number(m[2]), Number(m[3]));
    return conTarjeta(r ? `${m[1] === 'g' ? 'Salió de' : 'Entró a'} ${r.cuenta}` : 'Ya tenía cuenta', m[1], Number(m[2]));
  }
  m = dato.match(/^cc:(g|i):(\d+):(\d+)$/);
  if (m) {
    const r = await db.cambiarCuenta(m[1] === 'g' ? 'gasto' : 'ingreso', Number(m[2]), Number(m[3]));
    return conTarjeta(r ? (r.mismo ? 'Ya estaba en esa cuenta' : 'Cuenta cambiada') : 'Ese movimiento ya no existe.', m[1], Number(m[2]));
  }
  m = dato.match(/^a:(g|i):(\d+)$/);
  if (m) return conTarjeta('Elige la cuenta', m[1], Number(m[2]), 'cuenta');
  m = dato.match(/^v:(g|i):(\d+)$/);
  if (m) return conTarjeta(' ', m[1], Number(m[2]));
  m = dato.match(/^k:(\d+)$/);
  if (m) return conTarjeta('Elige la categoría', 'g', Number(m[1]), 'categoria');
  m = dato.match(/^k:(\d+):(.+)$/);
  if (m) {
    const r = await cambiarCategoria(Number(m[1]), m[2]);
    return conTarjeta(r ?? 'No encontré esa categoría', 'g', Number(m[1]));
  }
  m = dato.match(/^dv:(\d+)$/);
  if (m) return conTarjeta('¿Entre cuántos?', 'g', Number(m[1]), 'dividir');
  m = dato.match(/^dv:(\d+):(\d+)$/);
  if (m) {
    const r = await db.dividirGasto(Number(m[1]), Number(m[2]));
    return conTarjeta(r ? `Te deben ${pesos(r.teDeben)}` : 'Ya estaba dividida', 'g', Number(m[1]));
  }
  m = dato.match(/^dp:(\d+)$/);
  if (m) {
    await db.borrarPrestamo(Number(m[1]));
    return { aviso: 'Préstamo borrado', texto: '<i>Borré el préstamo y la plata volvió a su cuenta.</i>', botones: [] };
  }
  m = dato.match(/^pc:(\d+):(\d+)$/);
  if (m) {
    const p = (await db.prestamos()).find((x) => x.id === Number(m![1]));
    if (!p) return { aviso: 'Ese préstamo ya no existe', texto: '<i>Este préstamo ya no existe.</i>', botones: [] };
    if (!p.cuentaId) await db.asignarCuentaPrestamo(p.id, Number(m[2]));
    const c = (await db.cuentas()).find((x) => x.id === Number(m![2]));
    return {
      aviso: `Salió de ${c?.nombre ?? 'la cuenta'}`,
      texto: `🤝 Le prestaste <b>${pesos(p.monto)}</b> a <b>${esc(p.persona)}</b>\nSalió de <b>${esc(c?.nombre ?? '')}</b> · queda ${pesos(c?.saldo ?? 0)}\nNo cuenta como gasto: queda en <b>Te deben</b>.`,
      botones: [[{ texto: 'Deshacer', dato: `dp:${p.id}` }]],
    };
  }
  // Pago de un fijo o de una cuota: de qué cuenta salió
  m = dato.match(/^(pf|pa):(\d+):(\d+)$/);
  if (m) {
    const ok = m[1] === 'pf' ? await db.cuentaPagoFijo(Number(m[2]), Number(m[3])) : await db.cuentaAbono(Number(m[2]), Number(m[3]));
    const c = (await db.cuentas()).find((x) => x.id === Number(m![3]));
    if (!ok) return { aviso: 'Ya estaba descontado', texto: '<i>Ese pago ya tenía cuenta (o lo desmarcaste).</i>', botones: [] };
    const r = await db.resumen();
    return {
      aviso: `Salió de ${c?.nombre ?? 'la cuenta'}`,
      texto: `✓ Pago registrado. Salió de <b>${esc(c?.nombre ?? '')}</b> · queda ${pesos(c?.saldo ?? 0)}\nLibre en el mes: <b>${pesos(r.disponible)}</b>`,
      botones: [],
    };
  }
  if (dato === 'nd') return { aviso: 'Listo, no lo descuento', texto: '✓ Quedó pagado. No lo descuento de ninguna cuenta.', botones: [] };
  m = dato.match(/^pp:(\d+):(\d+):(\d+)$/);
  if (m) return { aviso: 'Listo', texto: await textoCobro(Number(m[1]), Number(m[2]), Number(m[3])), botones: [] };
  m = dato.match(/^ep:(\d+)$/);
  if (m) {
    const g = await db.gastoPorId(Number(m[1]));
    if (!g) return { aviso: 'Ese gasto ya no existe', texto: '<i>Este movimiento ya no existe.</i>', botones: [] };
    const persona = db.personaDeConcepto(g.concepto);
    const id = await db.convertirEnPrestamo(g.id, persona);
    return {
      aviso: 'Ahora es un préstamo',
      texto: `🤝 Listo: <b>${esc(g.concepto)}</b> (${pesos(g.monto)}) ya no es gasto. Quedó en <b>Te deben</b> a nombre de <b>${esc(persona)}</b>.\nCuando te pague: <code>me devolvió ${esc(persona.toLowerCase())} ${Math.round(g.monto / 1000)} mil</code>`,
      botones: id ? [] : [],
    };
  }
  m = dato.match(/^d:(g|i):(\d+)$/);
  if (m) {
    const id = Number(m[2]);
    const mov = m[1] === 'g' ? await db.gastoPorId(id) : await db.ingresoPorId(id);
    if (!mov) return { aviso: 'Ya estaba borrado', texto: '<i>Este movimiento ya no existe.</i>', botones: [] };
    if (m[1] === 'g') await db.borrarGasto(id);
    else await db.borrarIngreso(id);
    const cuenta = mov.cuentaId ? (await db.cuentas()).find((c) => c.id === mov.cuentaId) : undefined;
    return {
      aviso: 'Deshecho',
      texto: `<s>${esc(mov.concepto)} · ${pesos(mov.monto)}</s>\nLo deshice.${cuenta ? ` ${esc(cuenta.nombre)} volvió a ${pesos(cuenta.saldo)}.` : ''}`,
      botones: [],
    };
  }
  return { aviso: 'Ese botón ya no sirve' };
}

async function textoResumen(): Promise<string> {
  const [r, propias] = await Promise.all([db.resumen(), db.categoriasPropias()]);
  const total = r.porCategoria.reduce((x, c) => x + c.total, 0);
  const cats = r.porCategoria.length
    ? r.porCategoria.slice(0, 8).map((c) => `${esc(conEmoji(c.categoria, propias))}  ${barra(c.total / (r.porCategoria[0]?.total || 1), 6)}  ${pesos(c.total)} <i>(${Math.round((c.total / total) * 100)} %)</i>`).join('\n')
    : 'Aún no registras gastos este mes.';
  const cabeza = r.modo === 'cuentas'
    ? [
        '<b>Tu plata hoy</b>',
        `En cuentas y efectivo: ${pesos(r.enCuentas)}`,
        `Por pagar este mes: −${pesos(r.totalPendiente)}`,
        ...(r.apartadoMetas ? [`Apartado en metas: −${pesos(r.apartadoMetas)}`] : []),
        `<b>Te queda libre: ${pesos(r.disponible)}</b>`,
      ]
    : [
        '<b>Este mes</b>',
        `Ingresos: ${pesos(r.ingresos)}`,
        `Cuotas: −${pesos(r.cuotas)}`,
        `Gastos fijos: −${pesos(r.fijos)}`,
        `Día a día: −${pesos(r.variables)}`,
        ...(r.extraAbonos ? [`Abonos extra: −${pesos(r.extraAbonos)}`] : []),
        `<b>Te queda libre: ${pesos(r.disponible)}</b>`,
      ];
  const hoy = r.disponible > 0 && r.presupuestoHoy > 0
    ? `\n<b>Hoy</b>  ${barra(r.gastadoHoy / r.presupuestoHoy)}  ${pesos(r.gastadoHoy)} de ${pesos(r.presupuestoHoy)}\n${r.proximoPago.dias} días para el ${r.proximoPago.dia}`
    : '';
  const avance = r.diaHoy / r.diasMes;
  return `${cabeza.join('\n')}${hoy}

<b>El mes</b>  ${barra(avance)}  día ${r.diaHoy} de ${r.diasMes}
Entró ${pesos(r.ingresos)} · gastaste ${pesos(r.variables)}${r.modo === 'cuentas' ? ` · cuotas ${pesos(r.cuotas)} · fijos ${pesos(r.fijos)}` : ''}

<b>En qué se va tu plata</b>
${cats}${r.modo === 'mes' ? '\n\n<i>Tip: registra tus cuentas y efectivo en Billetera y te digo cuánto tienes de verdad.</i>' : ''}`;
}

async function textoHoy(): Promise<string> {
  const [gs, r, propias] = await Promise.all([db.gastosDeHoy(), db.resumen(), db.categoriasPropias()]);
  const conLimite = (r.modo === 'cuentas' || r.ingresos > 0) && r.disponible > 0 && r.presupuestoHoy > 0;
  const queda = r.presupuestoHoy - r.gastadoHoy;
  const cabecera = conLimite
    ? [
        `<b>Hoy puedes gastar ${pesos(r.presupuestoHoy)}</b>`,
        `${barra(r.gastadoHoy / r.presupuestoHoy)}  ${Math.round((r.gastadoHoy / r.presupuestoHoy) * 100)} %`,
        queda >= 0 ? `Llevas ${pesos(r.gastadoHoy)} · te quedan <b>${pesos(queda)}</b>` : `Llevas ${pesos(r.gastadoHoy)} · te pasaste <b>${pesos(-queda)}</b>`,
      ].join('\n')
    : '<b>Hoy</b>';
  if (!gs.length) return `${cabecera}\n\n<i>Aún no gastas nada hoy 👌</i>`;
  return `${cabecera}\n\n${gs.map((g) => `${esc(conEmoji(g.categoria, propias))} · ${esc(g.concepto)}  <b>${pesos(g.monto)}</b>`).join('\n')}`;
}

async function textoPendientes(): Promise<string> {
  const r = await db.resumen();
  if (!r.pendientes.length) {
    return r.cuotas + r.fijos > 0
      ? '🎉 <b>¡Al día!</b> Ya pagaste todas las cuotas y gastos fijos de este mes.'
      : 'Aún no tienes gastos fijos ni deudas registradas. Agrégalos en el dashboard para saber qué te falta pagar.';
  }
  const pagado = r.cuotas + r.fijos - r.totalPendiente;
  const ratio = r.cuotas + r.fijos > 0 ? pagado / (r.cuotas + r.fijos) : 0;
  return `<b>Te falta pagar ${pesos(r.totalPendiente)}</b>
${barra(ratio)}  ${Math.round(ratio * 100)} % pagado

${r.pendientes
    .map((p) => `${p.diaPago && p.diaPago < r.diaHoy ? '🔴' : p.diaPago && p.diaPago - r.diaHoy <= 3 ? '🟠' : '▫️'} ${esc(p.nombre)}  <b>${pesos(p.monto)}</b>${p.diaPago ? ` · ${p.diaPago < r.diaHoy ? 'venció el' : 'vence el'} ${p.diaPago}` : ''}${p.tipo === 'cuota' ? ' <i>(cuota)</i>' : ''}`)
    .join('\n')}

Cuando pagues uno: <code>/pague gimnasio</code>`;
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
      const cuotaLista = d.faltaMes === 0 && d.cuota > 0 ? ' ✓ cuota del mes' : '';
      return `${i + 1}. <b>${esc(d.nombre)}</b> — saldo ${pesos(d.saldo)} · cuota ${pesos(d.cuota)}${d.tasa ? ` · ${esc(d.tasa)}` : ''}${cuotaLista}${i === 0 ? ' ← pagar primero' : ''}`;
    })
    .join('\n')}\n\nDebes en total: <b>${pesos(total)}</b>`;
}

/** Borra el último gasto o ingreso (el más reciente) y devuelve la plata a su cuenta. */
async function borrarUltimo(): Promise<string> {
  const m = await db.ultimoMovimiento();
  if (!m) return 'No hay movimientos para borrar.';
  if (m.tipo === 'gasto') await db.borrarGasto(m.id);
  else await db.borrarIngreso(m.id);
  const cuenta = m.cuentaId ? (await db.cuentas()).find((c) => c.id === m.cuentaId) : null;
  return `🗑️ Borré ${m.tipo === 'gasto' ? 'el gasto' : 'el ingreso'}: ${esc(m.concepto)} ${pesos(m.monto)}` +
    (cuenta ? `\n${esc(cuenta.nombre)} quedó en ${pesos(cuenta.saldo)}.` : '');
}

async function corregirCategoria(args: string): Promise<string> {
  const propias = await db.nombresPropios();
  const categoria = normalizarCategoria(args, propias);
  if (!categoria) return `Dime la categoría, por ejemplo /cat Salidas\nOpciones: ${[...CATEGORIAS, ...propias].join(', ')}`;
  const g = await db.ultimoGasto();
  if (!g) return 'No hay gastos para corregir.';
  return (await cambiarCategoria(g.id, categoria)) ?? 'No pude cambiarla.';
}

/** Cambia la categoría de un gasto y aprende sus palabras para la próxima. */
async function cambiarCategoria(id: number, nombre: string): Promise<string | null> {
  const propias = await db.categoriasPropias();
  const categoria = normalizarCategoria(nombre, propias.map((p) => p.nombre));
  const g = await db.gastoPorId(id);
  if (!categoria || !g) return null;
  await db.actualizarGasto(g.id, { concepto: g.concepto, monto: g.monto, categoria });
  const palabras = sinTildes(g.concepto.toLowerCase())
    .split(/[^\p{L}\d]+/u)
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
  await db.aprenderPalabras(palabras, categoria);
  return `${g.concepto} ahora es ${conEmoji(categoria, propias)}. La próxima vez lo clasifico solo`;
}

/** /categoria Mascotas 🐶 · /categoria borrar Mascotas · /categorias */
async function comandoCategoria(args: string): Promise<string> {
  const propias = await db.categoriasPropias();
  if (!args.trim()) return textoCategorias(propias);
  const borrar = args.match(/^(borrar|eliminar|quitar)\s+(.+)$/i);
  if (borrar) {
    const c = normalizarCategoria(borrar[2], propias.map((p) => p.nombre));
    if (!c || !propias.some((p) => p.nombre === c)) return 'Solo puedes borrar categorías que creaste tú. Mira la lista con /categorias';
    await db.borrarCategoria(c);
    return `Borré la categoría <b>${esc(c)}</b>. Sus gastos pasaron a 📦 Otros.`;
  }
  const emoji = args.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u)?.[0] ?? null;
  const nombre = await db.crearCategoria(args, emoji, null);
  if (!nombre) return 'Escribe el nombre, por ejemplo: <code>/categoria Mascotas 🐶</code>';
  if ((CATEGORIAS as readonly string[]).includes(nombre)) return `${esc(conEmoji(nombre))} ya existe.`;
  const lista = await db.categoriasPropias();
  return `Listo, creé la categoría <b>${esc(conEmoji(nombre, lista))}</b>.\nÚsala con el botón <b>Categoría</b> de cualquier gasto o con <code>/cat ${esc(nombre)}</code>. Con eso aprendo y la próxima vez la pongo solo.`;
}

async function abonar(args: string, tipo: 'cuota' | 'capital' = 'cuota'): Promise<string> {
  const cs = await db.cuentas();
  // "/abono nu 50000 con bancolombia": la última parte dice de qué cuenta salió
  const [principal, ...cola] = args.split(/\s(?:con|desde)\s/i);
  const desde = cola.length ? cuentaDelTexto(cola.join(' '), cs) : null;
  const m = extraerMonto(principal);
  const nombre = m?.resto.replace(/\b(a|al|la|el|capital)\b/gi, ' ').trim();
  if (!m || !nombre) {
    return tipo === 'capital' ? 'Escríbelo así: <code>/capital nu 200000</code>' : 'Escríbelo así: <code>/abono nequi 50000</code>';
  }
  const encontrada = mejor(await db.deudas(), (x) => x.nombre, nombre);
  const d = encontrada ? await db.abonarDeudaPorId(encontrada.item.id, m.monto, desde?.c.id ?? null, tipo) : null;
  if (!d) return `No encontré un crédito que se llame "${esc(nombre)}". Mira /deudas.`;
  const deDonde = desde ? `\nSalió de <b>${esc(desde.c.nombre)}</b>.` : '';
  if (d.saldo === 0) return `🎉 ¡Pagaste <b>${esc(d.nombre)}</b> por completo! Esa cuota de ${pesos(d.cuota)} ahora puede ir a la siguiente deuda.${deDonde}`;
  return tipo === 'capital'
    ? `💪 Abono a capital de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(d.saldo)}</b>. Así pagas menos intereses.${deDonde}`
    : `Abono de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(d.saldo)}</b>${deDonde}`;
}

/**
 * "/pague arriendo": marca el fijo (o la cuota) del mes como pagado. Si tienes cuentas, pregunta con botones
 * de cuál salió, para que el saldo baje y "libre" no quede inflado.
 */
async function marcarPagado(args: string, preguntarCuenta = true): Promise<Respuesta> {
  const nombre = args.trim();
  if (!nombre) return 'Dime qué pagaste, por ejemplo <code>/pague gimnasio</code> o <code>/pague nu</code>.';
  const [fs, ds, cs] = await Promise.all([db.fijos(), db.deudas(), db.cuentas()]);
  const f = mejor(fs, (x) => x.concepto, nombre);
  const d = mejor(ds.filter((x) => x.saldo > 0), (x) => x.nombre, nombre);
  const conCuentas = (texto: string, dato: (c: db.Cuenta) => string): Respuesta =>
    preguntarCuenta && cs.length
      ? { texto: `${texto}

¿De qué cuenta salió?`, botones: [...filas(cs.slice(0, 9).map((c) => ({ texto: c.nombre, dato: dato(c) })), 3), [{ texto: 'No descontar', dato: 'nd' }]] }
      : texto;
  if (f && (!d || f.puntos >= d.puntos)) {
    const fijo = f.item;
    if (fijo.pagadoMes) return `<b>${esc(fijo.concepto)}</b> ya estaba marcado como pagado este mes.`;
    await db.marcarFijo(fijo.id, true);
    return conCuentas(`✓ <b>${esc(fijo.concepto)}</b> (${pesos(fijo.monto)}) quedó pagado este mes.`, (c) => `pf:${fijo.id}:${c.id}`);
  }
  if (d) {
    const deuda = d.item;
    const falta = deuda.faltaMes;
    if (falta <= 0) return `La cuota de <b>${esc(deuda.nombre)}</b> ya estaba pagada este mes.`;
    const nueva = await db.abonarDeudaPorId(deuda.id, falta);
    if (!nueva) return `No encontré la deuda "${esc(nombre)}".`;
    return conCuentas(`✓ Cuota de <b>${esc(deuda.nombre)}</b> pagada (${pesos(falta)}). Saldo nuevo: <b>${pesos(nueva.saldo)}</b>`, (c) => `pa:${nueva.abonoId}:${c.id}`);
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
  // Un pago de cuota o abono ("pagué la cuota de la AV Villas con bancolombia") no es una compra.
  const esAbono = esPago && /\b(cuota|capital|abono)\b/i.test(texto);
  const esCompra = !esAbono && (/(?<![\p{L}\d])(compr[\p{L}]*|hice|gast[eé])(?![\p{L}\d])/iu.test(texto) || esPago) && (mencionaTarjeta || /\bcon\b/i.test(texto));
  if (!mencionaTarjeta && !bancoEnTexto(texto) && !(esPago && /\bcuota\b/i.test(texto))) return null;

  // "...con bancolombia" al final dice de qué cuenta salió la plata: no es el crédito.
  const partes = texto.split(/\s(?:con|desde)\s(?=(?:la |el |mi )?(?:cuenta|ahorros|nequi|daviplata|efectivo|bancolombia|dale|movii|uala|lulo|nu|av villas|avvillas|banco))/i);
  const cs = await db.cuentas();
  const pagoDesde = esPago && partes.length > 1 ? cuentaDelTexto(partes.slice(1).join(' '), cs) : null;
  const textoCredito = pagoDesde ? partes[0] : texto;
  const ds = await db.deudas();
  const d = encontrarCredito(textoCredito, ds);
  // Sin decir "tarjeta" o "crédito", si el banco coincide con una cuenta débito, es un gasto normal desde esa cuenta.
  if (d && !mencionaTarjeta && !esPago && cuentaDelTexto(texto, cs)) return null;
  if (!d) {
    if (!mencionaTarjeta) return null;
    const tarjetas = ds.filter((x) => x.tipo === 'tarjeta');
    return tarjetas.length
      ? `¿Con cuál tarjeta? Tienes: ${tarjetas.map((x) => esc(x.nombre)).join(', ')}. Ej: <code>compré con la ${esc(tarjetas[0].nombre)} 50 mil</code>`
      : 'Aún no tienes tarjetas registradas. Agrégalas en el dashboard, pestaña Billetera.';
  }

  if (esCompra && !(esPago && pagoDesde)) return compraConTarjeta(texto, d);
  if (esPago) {
    const m = extraerMonto(texto.replace(RE_CUOTAS, ' '));
    const desde = pagoDesde?.c.id ?? null;
    const sufijo = pagoDesde ? `\nSalió de <b>${esc(pagoDesde.c.nombre)}</b>.` : '';
    if (m && !/\bcuota\b/i.test(texto)) {
      const nueva = await db.abonarDeudaPorId(d.id, m.monto, desde, /\bcapital\b/i.test(texto) ? 'capital' : 'cuota');
      return `✓ Pago de ${pesos(m.monto)} a <b>${esc(d.nombre)}</b>. Saldo nuevo: <b>${pesos(nueva?.saldo ?? 0)}</b>${textoCupo(d, nueva?.saldo)}${sufijo}`;
    }
    const falta = d.faltaMes;
    if (falta <= 0) return `La cuota de <b>${esc(d.nombre)}</b> ya estaba pagada este mes.`;
    const monto = m?.monto ?? falta;
    const nueva = await db.abonarDeudaPorId(d.id, monto, desde);
    return `✓ Cuota de <b>${esc(d.nombre)}</b> pagada (${pesos(monto)}). Saldo nuevo: <b>${pesos(nueva?.saldo ?? 0)}</b>${textoCupo(d, nueva?.saldo)}${sufijo}`;
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
    `💳 Compra con <b>${esc(r.nombre)}</b>: ${esc(bonito)} ${pesos(m.monto)}${cuotas > 1 ? ` a ${cuotas} cuotas` : ''}`,
    `Desde el próximo extracto suma ${pesos(Math.round(m.monto / cuotas))} a la cuota${cuotas > 1 ? `, durante ${cuotas} meses` : ''}.`,
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

/** /cuenta efectivo — lo que movió el saldo de una cuenta, con el saldo después de cada cosa. */
async function historialCuenta(args: string): Promise<string> {
  const cs = await db.cuentas();
  if (!cs.length) return 'No tienes cuentas registradas. Agrégalas en el dashboard, pestaña Billetera.';
  const c = cuentaDelTexto(args || '', cs)?.c ?? (/efectivo|billetera|cash/i.test(args) ? cs.find((x) => x.banco === 'efectivo') : undefined);
  if (!c) return `¿De qué cuenta? Ej: <code>/cuenta efectivo</code>. Tienes: ${cs.map((x) => esc(x.nombre)).join(', ')}.`;
  const { movs, saldoAntes, entradas, salidas, completo } = await db.movimientosCuenta(c.id, 15);
  const f = (d: string) => new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const lineas = movs.map((m) =>
    m.tipo === 'ajuste'
      ? `✏️ ${f(m.fecha)} · <b>Pusiste el saldo</b> de ${pesos(m.antes ?? 0)} a <b>${pesos(m.saldoDespues ?? 0)}</b>`
      : `${(m.saldoDespues ?? 0) < 0 ? '🔴' : '▫️'} ${f(m.fecha)} · ${esc(m.concepto)} <b>${m.delta > 0 ? '+' : '−'}${pesos(Math.abs(m.delta))}</b>${m.saldoDespues === null ? '' : ` → ${pesos(m.saldoDespues)}`}`,
  );
  // El movimiento con el que empezó la racha en negativo (de lo más nuevo hacia atrás)
  let negativo: db.MovCuenta | undefined;
  for (const m of movs) {
    if (m.saldoDespues !== null && m.saldoDespues < 0) negativo = m;
    else break;
  }
  const pista = c.saldo < 0
    ? `\n\n<i>Quedó en negativo desde «${esc(negativo?.concepto ?? '')}». Si esos gastos ya los habías hecho antes de poner el saldo, se descontaron dos veces: corrige con <code>/saldo ${esc(c.nombre.toLowerCase())} [lo que tienes ahora]</code>.</i>`
    : '';
  const viejo = movs.some((m) => m.saldoDespues === null) ? '\n<i>En los movimientos sin "→" no sé cuánto quedó: antes no se guardaban los cambios de saldo a mano.</i>' : '';
  const desde = movs.some((m) => m.tipo === 'ajuste') ? 'Después de tu último cambio a mano tenías' : completo ? 'Empezó en' : 'Antes de estos movimientos había';
  const resumen = movs.length
    ? `\n${desde} ${pesos(saldoAntes)}${entradas ? ` · entraron +${pesos(entradas)}` : ''}${salidas ? ` · salieron −${pesos(salidas)}` : ''} → hoy <b>${pesos(c.saldo)}</b>\n`
    : '';
  return `<b>${esc(c.nombre)}</b> · saldo <b>${pesos(c.saldo)}</b>${resumen}\nLo que movió el saldo (lo más nuevo arriba):\n\n${lineas.join('\n') || 'Sin movimientos todavía.'}${viejo}${pista}`;
}

// ---------------------------------------------------------------------------
// Cuentas de origen, transferencias, topes, metas, suscripciones y hormiga

/** La cuenta débito que menciona el texto ("con nequi", "en efectivo", "de bancolombia"), y el texto sin ella. */
function cuentaDelTexto(texto: string, cs: db.Cuenta[]): { c: db.Cuenta; resto: string } | null {
  if (!cs.length) return null;
  const t = ` ${normal(texto)} `;
  let mejor: { c: db.Cuenta; frase: string } | null = null;
  for (const c of cs) {
    const frases = [normal(c.nombre), ...(c.banco ? bancoPorId(c.banco).alias.map(normal) : [])].filter((f) => f.length >= 2);
    for (const f of frases) {
      if (t.includes(` ${f} `) && (!mejor || f.length > mejor.frase.length)) mejor = { c, frase: f };
    }
  }
  if (!mejor) return null;
  // Quita "con/en/de/desde/por (la|el|mi)? <frase>" del texto original, sin importar tildes ni mayúsculas.
  const palabras = texto.split(/\s+/);
  const objetivo = mejor.frase.split(' ');
  for (let i = 0; i + objetivo.length <= palabras.length; i++) {
    const tramo = palabras.slice(i, i + objetivo.length).map((w) => normal(w)).join(' ');
    if (tramo === mejor.frase) {
      let inicio = i;
      if (inicio > 0 && /^(la|el|mi)$/i.test(normal(palabras[inicio - 1]))) inicio--;
      if (inicio > 0 && /^(con|en|de|desde|por|a|al)$/i.test(normal(palabras[inicio - 1]))) inicio--;
      const resto = [...palabras.slice(0, inicio), ...palabras.slice(i + objetivo.length)].join(' ').trim();
      return { c: mejor.c, resto: resto || texto };
    }
  }
  return { c: mejor.c, resto: texto };
}

async function transferirCuentas(args: string, natural = false): Promise<string> {
  const m = extraerMonto(args);
  const partes = args.match(/\b(?:de|desde)\s+(.+?)\s+(?:a|al|para)\s+(.+)$/i);
  if (!m || !partes) {
    return natural ? '' : 'Escríbelo así: <code>/transferir 100000 de bancolombia a nequi</code>';
  }
  const cs = await db.cuentas();
  const desde = cuentaDelTexto(partes[1].replace(/[\d.,$]+\s*(mil|k)?/gi, ' '), cs);
  const hacia = cuentaDelTexto(partes[2].replace(/[\d.,$]+\s*(mil|k)?/gi, ' '), cs);
  if (!desde || !hacia || desde.c.id === hacia.c.id) {
    return natural ? '' : `No encontré esas dos cuentas. Tienes: ${cs.map((c) => esc(c.nombre)).join(', ') || 'ninguna'}.`;
  }
  await db.transferir({ desdeId: desde.c.id, haciaId: hacia.c.id, monto: m.monto });
  const aviso = desde.c.saldo - m.monto < 0 ? `\n⚠️ ${esc(desde.c.nombre)} quedó en negativo: revisa su saldo con /saldo.` : '';
  return `🔁 Pasaste ${pesos(m.monto)} de <b>${esc(desde.c.nombre)}</b> (${pesos(desde.c.saldo - m.monto)}) a <b>${esc(hacia.c.nombre)}</b> (${pesos(hacia.c.saldo + m.monto)}).${aviso}`;
}

async function topes(args: string): Promise<string> {
  const m = extraerMonto(args);
  if (m) {
    const propias = await db.nombresPropios();
    const categoria = normalizarCategoria(m.resto, propias);
    if (!categoria) return `¿Para qué categoría? Ej: <code>/tope salidas 150000</code>\nOpciones: ${[...CATEGORIAS, ...propias].join(', ')}`;
    await db.guardarTope(categoria, m.monto);
    return `Listo: tope de <b>${categoria}</b> en ${pesos(m.monto)} al mes. Te aviso cuando vayas en 80 %.`;
  }
  const r = await db.resumen();
  const lista = Object.entries(r.topes);
  if (!lista.length) return 'No tienes topes. Ponle uno a una categoría: <code>/tope salidas 150000</code>';
  return `<b>Topes de este mes</b>\n${lista
    .map(([c, t]) => {
      const usado = r.porCategoria.find((x) => x.categoria === c)?.total ?? 0;
      const icono = usado > t ? '🔴' : usado >= t * 0.8 ? '🟠' : '🟢';
      return `${icono} ${c}: ${pesos(usado)} de ${pesos(t)}`;
    })
    .join('\n')}`;
}

async function textoMetas(): Promise<string> {
  const ms = await db.metas();
  if (!ms.length) return 'No tienes metas de ahorro. Créalas en el dashboard, pestaña Plan (ej. fondo de emergencia).';
  return `<b>🎯 Tus metas</b>\n\n${ms
    .map((m) => {
      const pct = m.objetivo ? Math.min(100, Math.round((m.ahorrado / m.objetivo) * 100)) : 0;
      return `<b>${esc(m.nombre)}</b>${m.fechaMeta ? ` · para el ${m.fechaMeta.split('-').reverse().join('/')}` : ''}\n${barra(pct / 100)}  ${pct} %  ·  ${pesos(m.ahorrado)} de ${pesos(m.objetivo)}`;
    })
    .join('\n\n')}\n\nPara aportar: <code>aparté 100 mil para ${esc(ms[0].nombre.toLowerCase())}</code>`;
}

async function ahorrar(args: string, natural = false): Promise<string> {
  const m = extraerMonto(args);
  const ms = await db.metas();
  if (!m) return natural ? '' : 'Escríbelo así: <code>/ahorro viaje 100000</code>';
  const meta = mejor(ms, (x) => x.nombre, m.resto.replace(/^(para|en|a|al)\s+(el|la|mi)?\s*/i, ''));
  if (!meta) {
    if (natural) return '';
    return ms.length ? `¿A qué meta? Tienes: ${ms.map((x) => esc(x.nombre)).join(', ')}.` : 'No tienes metas. Créalas en el dashboard, pestaña Plan.';
  }
  await db.aportarMeta(meta.item.id, m.monto);
  const total = meta.item.ahorrado + m.monto;
  const pct = meta.item.objetivo ? Math.min(100, Math.round((total / meta.item.objetivo) * 100)) : 0;
  return `🎯 ${pesos(m.monto)} a <b>${esc(meta.item.nombre)}</b>. Llevas ${pesos(total)} de ${pesos(meta.item.objetivo)} (${pct} %).${pct >= 100 ? ' ¡Meta cumplida! 🎉' : ''}`;
}

async function textoSuscripciones(): Promise<string> {
  const ss = await db.suscripciones();
  if (!ss.length) return 'No encontré pagos que se repitan cada mes. A medida que registres gastos los voy detectando.';
  const total = ss.reduce((s, x) => s + x.monto, 0);
  return `<b>🔁 Pagos que se repiten</b>\n${ss.map((x) => `• ${esc(x.concepto)}: ~${pesos(x.monto)}`).join('\n')}\n<b>~${pesos(total)} al mes.</b> ¿Todos los usas?`;
}

async function textoHormiga(): Promise<string> {
  const hs = await db.gastosHormiga();
  if (!hs.length) return 'Este mes no veo gastos hormiga (pequeños y repetidos). 👌';
  const total = hs.reduce((s, x) => s + x.total, 0);
  return `<b>🐜 Gastos hormiga del mes</b>\n${hs.map((x) => `• ${esc(x.concepto)}: ${x.veces} veces = ${pesos(x.total)}`).join('\n')}\n<b>Total: ${pesos(total)}</b>`;
}

/** Retiro (cuenta → efectivo) o consignación (efectivo → cuenta). */
async function retiroOConsignacion(args: string, tipo: 'retiro' | 'consignacion'): Promise<string> {
  const m = extraerMonto(args);
  const efectivo = await db.cuentaEfectivo();
  const cs = (await db.cuentas()).filter((c) => c.id !== efectivo.id);
  const cuenta = m ? cuentaDelTexto(m.resto, cs) : null;
  if (!m || !cuenta) {
    const ej = tipo === 'retiro' ? '<code>retiré 100 mil de nequi</code>' : '<code>consigné 50 mil en bancolombia</code>';
    return `Escríbelo así: ${ej}. Tus cuentas: ${cs.map((c) => esc(c.nombre)).join(', ') || 'ninguna todavía'}.`;
  }
  const [desde, hacia] = tipo === 'retiro' ? [cuenta.c, efectivo] : [efectivo, cuenta.c];
  await db.transferir({ desdeId: desde.id, haciaId: hacia.id, monto: m.monto, nota: tipo === 'retiro' ? 'Retiro' : 'Consignación' });
  const aviso = desde.saldo - m.monto < 0 ? `\n⚠️ ${esc(desde.nombre)} quedó en negativo: revisa su saldo con /saldo.` : '';
  const mensaje = tipo === 'retiro'
    ? `🏧 Retiraste ${pesos(m.monto)} de <b>${esc(desde.nombre)}</b> (${pesos(desde.saldo - m.monto)}). En efectivo tienes <b>${pesos(hacia.saldo + m.monto)}</b>.`
    : `🏦 Consignaste ${pesos(m.monto)} en <b>${esc(hacia.nombre)}</b> (${pesos(hacia.saldo + m.monto)}). En efectivo te quedan <b>${pesos(desde.saldo - m.monto)}</b>.`;
  return mensaje + aviso;
}

/**
 * Envíos a otra persona por Nequi, Bancolombia, llave (Bre-B)…
 * - Si te devolvió la plata en efectivo, es un cambio: cuenta → efectivo.
 * - Si dice a qué otra cuenta tuya fue, es una transferencia (la maneja transferirCuentas).
 * - Si no, es un gasto "Envío a <persona>" que sale de esa cuenta.
 */
async function envioAPersona(texto: string): Promise<Respuesta | null> {
  const m = extraerMonto(texto);
  if (!m) return null;
  const cs = await db.cuentas();
  const sinVerbo = texto.replace(/^(le\s+|les\s+)?\S+\s*/i, '');
  const meDioEfectivo = /\bme\s+(dio|dieron|devolvi[oó]|entreg[oó]|pas[oó])\b|\ben\s+efectivo\b|\ba\s+cambio\b|\bcash\b/i.test(texto);

  // Partimos el texto en lo de antes y lo de después del "a / al / para": "2000 de nequi" | "la cuenta de nu"
  const corte = sinVerbo.match(/^(.*?)\b(?:a|al|para)\s+(.+)$/i);
  const antes = corte?.[1] ?? sinVerbo;
  const despues = corte?.[2] ?? '';
  const sinEf = (t: string) => t.replace(/\b(en\s+)?efectivo\b|\bcash\b/gi, ' ');
  const bancos = cs.filter((c) => c.banco !== 'efectivo');

  // La cuenta desde donde salió: primero la que dices antes del "a…" ("de nequi"); si no, la que nombres en cualquier parte
  // ("a juan por nequi", "desde bancolombia"). No cuenta el efectivo que te dieron.
  const origen = cuentaDelTexto(sinEf(antes), bancos) ?? cuentaDelTexto(sinEf(sinVerbo), bancos);
  if (!origen) return null;

  // Si después del "a…" nombras OTRA cuenta tuya ("a la cuenta de nu", "a nequi"), es una transferencia entre tus cuentas.
  const destino = despues ? cuentaDelTexto(despues, cs.filter((c) => c.id !== origen.c.id)) : null;
  if (destino && !meDioEfectivo) {
    await db.transferir({ desdeId: origen.c.id, haciaId: destino.c.id, monto: m.monto });
    const aviso = origen.c.saldo - m.monto < 0 ? `\n⚠️ ${esc(origen.c.nombre)} quedó en negativo: revisa su saldo con /saldo.` : '';
    return `🔁 Pasaste ${pesos(m.monto)} de <b>${esc(origen.c.nombre)}</b> (${pesos(origen.c.saldo - m.monto)}) a <b>${esc(destino.c.nombre)}</b> (${pesos(destino.c.saldo + m.monto)}).\nNo cuenta como gasto: solo cambiaste de bolsillo.${aviso}`;
  }

  // ¿A quién? "a juan", "a mi mamá", "al arrendador", "a la cuenta de mi novia"
  const quien = despues
    .replace(/\s+(por|desde|con|y|en|de\s+(?:mi\s+)?(?:nequi|daviplata|bancolombia|nu|cuenta))\b.*$/i, '')
    .replace(/^(?:la\s+)?cuenta\s+(?:de\s+)?/i, '')
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
    .trim();

  if (meDioEfectivo) {
    const efectivo = await db.cuentaEfectivo();
    await db.transferir({ desdeId: origen.c.id, haciaId: efectivo.id, monto: m.monto, nota: quien ? `Cambio con ${quien}` : 'Cambio a efectivo' });
    return `💱 Le mandaste ${pesos(m.monto)}${quien ? ` a ${esc(quien)}` : ''} por <b>${esc(origen.c.nombre)}</b> y te lo dieron en efectivo.\n${esc(origen.c.nombre)}: ${pesos(origen.c.saldo - m.monto)} · Efectivo: <b>${pesos(efectivo.saldo + m.monto)}</b>\nNo cuenta como gasto: solo cambiaste de bolsillo.`;
  }

  const via = /\b(llave|bre-?b)\b/i.test(texto) ? ' (llave)' : '';
  const concepto = quien ? `Envío a ${quien}` : 'Envío';
  const id = await db.insertarGasto({ concepto: `${concepto}${via}`, monto: m.monto, categoria: 'Otros', origen: 'telegram', texto, cuentaId: origen.c.id });
  const t = await tarjetaGasto(id, { extra: ['<i>¿Te lo van a devolver? Toca <b>Es préstamo</b> y queda en "Te deben" en vez de gasto.</i>'] });
  return t ?? `📤 ${esc(concepto)}${via}: ${pesos(m.monto)}`;
}

// ---------------------------------------------------------------------------
// Préstamos a personas: la plata sale, pero no es gasto; cuando te la devuelven, no es ingreso.

const NO_PERSONA = new Set(['mi', 'mis', 'de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'para', 'por', 'con', 'en', 'y', 'que', 'lo', 'le', 'me']);
const palabrasPersona = (t: string) => normal(t).split(/[^\p{L}\d]+/u).filter((w) => w.length >= 3 && !NO_PERSONA.has(w));

/** "le presté 30 mil al abuelo de mi novia en efectivo" */
async function prestar(texto: string): Promise<Respuesta | null> {
  const m = extraerMonto(texto);
  if (!m) return null;
  const cs = await db.cuentas();
  const esEfectivo = /\b(efectivo|cash|billetes?)\b/i.test(texto);
  if (esEfectivo) await db.cuentaEfectivo();
  const todas = esEfectivo ? await db.cuentas() : cs;
  const mencionada = cuentaDelTexto(texto, todas)?.c ?? (esEfectivo ? todas.find((c) => c.banco === 'efectivo') : undefined);
  const principal = todas.find((c) => c.principal) ?? (todas.length === 1 ? todas[0] : undefined);
  const cuenta = mencionada ?? principal;

  // ¿A quién? lo que va después de "a / al / para", sin el monto ni la cuenta
  const tras = m.resto.match(/\b(?:a|al|para)\s+(.+)$/i)?.[1] ?? m.resto.replace(/^(le\s+|les\s+)?(prest[eé]|hice un pr[eé]stamo)\s*/i, '');
  const persona = tras
    .replace(/\s+(por|con|desde|en|de mi|del|de la)\s+(nequi|daviplata|bancolombia|nu|efectivo|cuenta|ahorros|av villas|davivienda|tarjeta|billetes?|cash)\b.*$/i, '')
    .replace(/\s+en\s+efectivo\b.*$/i, '')
    .replace(/^(el|la|los|las)\s+/i, '')
    .trim();
  const nombre = persona ? persona[0].toUpperCase() + persona.slice(1, 60) : 'Alguien';

  const id = await db.crearPrestamo({ persona: nombre, monto: m.monto, cuentaId: cuenta?.id ?? null, nota: texto.slice(0, 200) });
  const total = (await db.prestamos(true)).reduce((s, p) => s + p.pendiente, 0);
  const lineas = [
    `🤝 Le prestaste <b>${pesos(m.monto)}</b> a <b>${esc(nombre)}</b>`,
    cuenta ? `Salió de <b>${esc(cuenta.nombre)}</b> · queda ${pesos(cuenta.saldo - m.monto)}` : '',
    'No cuenta como gasto: queda en <b>Te deben</b>.',
    `En total te deben ${pesos(total)}.`,
    `Cuando te pague: <code>me devolvió ${esc(nombre.toLowerCase())} ${m.monto >= 1000 ? `${Math.round(m.monto / 1000)} mil` : m.monto}</code>`,
  ].filter(Boolean);
  const botones: Boton[][] = [];
  if (!cuenta && todas.length >= 2) {
    lineas.push('', '<b>¿De qué cuenta salió?</b>');
    const fila = todas.slice(0, 9).map((c) => ({ texto: c.nombre, dato: `pc:${id}:${c.id}` }));
    for (let i = 0; i < fila.length; i += 3) botones.push(fila.slice(i, i + 3));
  }
  botones.push([{ texto: 'Deshacer', dato: `dp:${id}` }]);
  return { texto: lineas.join('\n'), botones };
}

/** "me devolvió juan 30 mil" → busca el préstamo de esa persona y registra el abono. */
async function cobrar(texto: string): Promise<Respuesta | null> {
  const pendientes = await db.prestamos(true);
  if (!pendientes.length) return null;
  const palabras = new Set(palabrasPersona(texto));
  const candidatos = pendientes
    .map((p) => ({ p, coinciden: palabrasPersona(p.persona).filter((w) => palabras.has(w)).length }))
    .filter((x) => x.coinciden > 0)
    .sort((a, b) => b.coinciden - a.coinciden || a.p.fecha.localeCompare(b.p.fecha));
  if (!candidatos.length) return null; // "me pagaron la quincena" sigue siendo ingreso
  const p = candidatos[0].p;
  const m = extraerMonto(texto);
  const monto = Math.min(m?.monto ?? p.pendiente, p.pendiente);

  const cs = await db.cuentas();
  const esEfectivo = /\b(efectivo|cash|billetes?)\b/i.test(texto);
  const cuenta = cuentaDelTexto(texto, cs)?.c ?? (esEfectivo ? await db.cuentaEfectivo() : undefined) ?? cs.find((c) => c.principal) ?? (cs.length === 1 ? cs[0] : undefined);
  if (!cuenta && cs.length >= 2) {
    const fila = cs.slice(0, 9).map((c) => ({ texto: c.nombre, dato: `pp:${p.id}:${monto}:${c.id}` }));
    const botones: Boton[][] = [];
    for (let i = 0; i < fila.length; i += 3) botones.push(fila.slice(i, i + 3));
    return { texto: `🤝 ${esc(p.persona)} te devuelve ${pesos(monto)} (te debía ${pesos(p.pendiente)}).\n\n<b>¿A qué cuenta entró?</b>`, botones };
  }
  return textoCobro(p.id, monto, cuenta?.id ?? null);
}

async function textoCobro(prestamoId: number, monto: number, cuentaId: number | null): Promise<string> {
  const r = await db.pagarPrestamo(prestamoId, monto, cuentaId);
  const p = (await db.prestamos()).find((x) => x.id === prestamoId);
  if (!r || !p) return 'Ese préstamo ya no existe.';
  const cuenta = cuentaId ? (await db.cuentas()).find((c) => c.id === cuentaId) : undefined;
  return [
    r.pendiente === 0 ? `✅ <b>${esc(p.persona)}</b> te pagó todo (${pesos(p.monto)}). ¡Cuentas claras! 🎉` : `🤝 <b>${esc(p.persona)}</b> te devolvió ${pesos(r.abono)}. Todavía te debe <b>${pesos(r.pendiente)}</b>.`,
    cuenta ? `Entró a <b>${esc(cuenta.nombre)}</b> · queda ${pesos(cuenta.saldo)}` : '',
    'No cuenta como ingreso: era tu plata volviendo.',
  ].filter(Boolean).join('\n');
}

/** /prestamos — quién te debe y cuánto. */
async function textoPrestamos(): Promise<string> {
  const ps = await db.prestamos(true);
  if (!ps.length) return '🤝 Nadie te debe plata. Para anotar un préstamo: <code>le presté 30 mil a juan por nequi</code>';
  const total = ps.reduce((s, p) => s + p.pendiente, 0);
  const f = (d: string) => new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
  return `<b>🤝 Te deben ${pesos(total)}</b>\n\n${ps
    .map((p) => `• <b>${esc(p.persona)}</b>: ${pesos(p.pendiente)}${p.pendiente < p.monto ? ` de ${pesos(p.monto)}` : ''} <i>(desde el ${f(p.fecha)})</i>`)
    .join('\n')}\n\nCuando te paguen: <code>me devolvió ${esc(ps[0].persona.toLowerCase())} ${Math.round(ps[0].pendiente / 1000)} mil</code>`;
}

/** Marca como pagada la cuota de un crédito (o un gasto fijo) sin tocar ningún saldo. */
async function yaPague(args: string): Promise<Respuesta> {
  const busqueda = args.replace(/^(la\s+|el\s+)?(cuota\s+)?(de\s+)?(la\s+|el\s+)?(tarjeta\s+)?/i, '').trim();
  if (!busqueda) return 'Dime cuál: <code>ya pagué la cuota de la nu</code> o <code>ya pagué el gimnasio</code>.';
  const [ds, fs] = await Promise.all([db.deudas(), db.fijos()]);
  const credito = encontrarCredito(busqueda, ds.filter((d) => d.saldo > 0)) ?? mejor(ds.filter((d) => d.saldo > 0), (x) => x.nombre, busqueda)?.item ?? null;
  const fijo = mejor(fs, (x) => x.concepto, busqueda);
  if (credito && (!fijo || fijo.puntos < 3)) {
    if (credito.faltaMes === 0) return `La cuota de <b>${esc(credito.nombre)}</b> ya estaba al día este mes. ✓`;
    await db.marcarCuota(credito.id, true);
    return `✓ Marqué la cuota de <b>${esc(credito.nombre)}</b> como pagada este mes. El saldo (${pesos(credito.saldo)}) no cambió.\nSi además quieres registrar el pago y bajar la deuda: <code>pagué la cuota de la ${esc(credito.nombre.toLowerCase())}</code>`;
  }
  if (fijo) return marcarPagado(fijo.item.concepto, false);
  return `No encontré "${esc(busqueda)}" entre tus créditos ni tus gastos fijos. Mira /pendientes.`;
}

/** Por cada crédito: intereses si sigues igual, y cuánto te ahorras con un abono extra a capital. */
async function textoIntereses(): Promise<string> {
  const ds = (await db.deudas()).filter((d) => d.saldo > 0);
  if (!ds.length) return '🎉 No tienes deudas: no estás pagando intereses.';
  const lineas: string[] = [];
  let total = 0;
  for (const d of ds) {
    const r = tasaMensual(d.tasa);
    const cuota = d.cuotaBase || d.cuota;
    if (!r) {
      lineas.push(`• <b>${esc(d.nombre)}</b>: sin tasa registrada (agrégala para calcular).`);
      continue;
    }
    const base = simularPago(d.saldo, cuota, r);
    if (!base) {
      lineas.push(`• <b>${esc(d.nombre)}</b>: ⚠️ con ${pesos(cuota)} al mes nunca terminas, no alcanza ni para los intereses.`);
      continue;
    }
    total += base.intereses;
    const extra = Math.max(20_000, Math.round((cuota * 0.5) / 10_000) * 10_000);
    const mejor = simularPago(d.saldo, cuota, r, extra);
    const ahorro = mejor ? base.intereses - mejor.intereses : 0;
    lineas.push(
      `• <b>${esc(d.nombre)}</b>: ${pesos(base.intereses)} en intereses en ${base.meses} meses.` +
        (mejor && ahorro > 0 ? `\n   Con ${pesos(extra)} extra al mes: ahorras <b>${pesos(ahorro)}</b> y terminas ${base.meses - mejor.meses} meses antes.` : ''),
    );
  }
  return `<b>💸 Si sigues pagando lo mismo</b>\n${lineas.join('\n')}\n\n<b>Total en intereses: ${pesos(total)}</b>\nPara abonar a capital: <code>abono a capital nu 100 mil</code>`;
}

async function textoRetos(): Promise<string> {
  const rs = await cargarRetos();
  const activos = rs.filter((x) => x.estado === 'activo');
  const lineas = activos.length
    ? activos.map((x) => `🔥 <b>${esc(x.nombre)}</b>: ${'●'.repeat(x.cumplidos)}${'○'.repeat(Math.max(0, x.meta - x.cumplidos))} · ${esc(x.detalle)}`)
    : ['No tienes retos activos.'];
  const opciones = CATALOGO.filter((c) => !activos.some((a) => a.nombre === c.nombre)).map((c) => `<code>/reto ${c.clave}</code> — ${esc(c.nombre)}`);
  return `<b>🎯 Tus retos</b>\n${lineas.join('\n')}${opciones.length ? `\n\nEmpieza uno:\n${opciones.join('\n')}` : ''}`;
}

async function empezarReto(args: string): Promise<string> {
  const clave = normal(args).replace(/^(semana sin|sin)\s+/, '').split(' ')[0];
  const c = CATALOGO.find((x) => x.clave === clave || normal(x.nombre).includes(normal(args)));
  if (!c) return `¿Cuál reto? ${CATALOGO.map((x) => `<code>/reto ${x.clave}</code>`).join(' · ')}`;
  const r = await db.resumen();
  const limite = r.presupuestoHoy > 0 ? r.presupuestoHoy : Math.max(10_000, r.ritmo7 * 0.8);
  await crearReto(c.clave, limite);
  const extra = c.tipo === 'limite' ? ` Tu límite: ${pesos(Math.max(1000, Math.round(limite / 1000) * 1000))} por día.` : '';
  return `🔥 ¡Empezó tu reto <b>${esc(c.nombre)}</b>! ${esc(c.descripcion)}.${extra} Te aviso si se rompe o cuando lo logres.`;
}


// ---------- Seguridad del dashboard (solo tú puedes escribirle al bot) ----------

async function textoSesiones(): Promise<string> {
  const { sesionesAbiertas, dispositivo } = await import('./acceso');
  const ss = await sesionesAbiertas();
  if (!ss.length) return '🔒 No hay ninguna sesión abierta en el dashboard.';
  const f = (d: string) => new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return `<b>Sesiones abiertas</b>\n${ss
    .map((x) => `• ${esc(dispositivo(x.agente))} · IP <code>${esc(x.ip)}</code>\n  entró ${f(x.creada)} · última vez ${f(x.ultima)}`)
    .join('\n')}\n\n¿Alguna no es tuya? /cerrarsesiones`;
}

async function cerrarSesionesWeb(): Promise<string> {
  const { cerrarTodas } = await import('./acceso');
  const n = await cerrarTodas();
  return n
    ? `🔒 Cerré ${n === 1 ? 'la sesión abierta' : `las ${n} sesiones abiertas`}. Para volver a entrar necesitas tu clave y un código nuevo.`
    : '🔒 No había sesiones abiertas.';
}

async function desbloquearWeb(): Promise<string> {
  const { desbloquear } = await import('./acceso');
  const n = await desbloquear();
  return n ? '🔓 Listo, quité el bloqueo. Ya puedes intentar entrar otra vez.' : 'No hay ningún bloqueo activo.';
}
