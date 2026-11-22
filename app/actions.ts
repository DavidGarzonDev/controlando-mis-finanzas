'use server';

import { revalidatePath } from 'next/cache';
import * as db from '@/lib/datos';
import { asegurarEsquema } from '@/lib/esquema';
import { exigirSesion } from '@/lib/guardia';
import { CATEGORIAS, normalizarCategoria } from '@/lib/categorias';

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const entero = (fd: FormData, k: string) => Math.max(0, Math.round(Number(String(fd.get(k) ?? '').replace(/[^\d]/g, '')) || 0));
/** Como `entero`, pero respeta el signo menos (un saldo de cuenta puede estar en negativo). */
const conSigno = (fd: FormData, k: string) => (String(fd.get(k) ?? '').trim().startsWith('-') ? -1 : 1) * entero(fd, k);
const idDe = (fd: FormData, k = 'id') => Number(fd.get(k)) || null;
/** Día del mes (1 a 31) o null. */
const diaDe = (fd: FormData, k: string) => {
  const d = Number(texto(fd, k));
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
};
/** Acabado ('negro', 'oro'…), color libre '#rrggbb' o null (colores del banco). */
const colorDe = (fd: FormData) => {
  const c = texto(fd, 'color');
  return /^[a-z]{3,12}$/.test(c) && c !== 'banco' ? c : /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
};
const ultimos4De = (fd: FormData) => texto(fd, 'ultimos4').replace(/\D/g, '').slice(-4) || null;

/** La cuenta elegida en el formulario; "efectivo" crea la cuenta de efectivo si no existe. */
async function cuentaDe(fd: FormData): Promise<number | null> {
  const v = texto(fd, 'cuenta');
  if (v === 'efectivo') return (await db.cuentaEfectivo()).id;
  return Number(v) || null;
}

/** Toda acción revisa primero que haya una sesión abierta (si no, no hace nada). */
async function listo() {
  await asegurarEsquema();
  await exigirSesion();
}
function refrescar() {
  revalidatePath('/');
}

export async function guardarGasto(fd: FormData) {
  await listo();
  const datos = {
    concepto: texto(fd, 'concepto') || 'Gasto',
    monto: entero(fd, 'monto'),
    categoria: texto(fd, 'categoria') === 'Ajuste' ? 'Ajuste' : normalizarCategoria(texto(fd, 'categoria'), await db.nombresPropios()) ?? 'Otros',
    cuentaId: await cuentaDe(fd),
  };
  const id = idDe(fd);
  if (id) await db.actualizarGasto(id, datos);
  else await db.insertarGasto({ ...datos, origen: 'web' });
  refrescar();
}

export async function guardarIngreso(fd: FormData) {
  await listo();
  const datos = { concepto: texto(fd, 'concepto') || 'Ingreso', monto: entero(fd, 'monto'), cuentaId: await cuentaDe(fd) };
  const id = idDe(fd);
  if (id) await db.actualizarIngreso(id, datos);
  else await db.insertarIngreso(datos);
  refrescar();
}

/** Cuadre: plata que aparece o desaparece sin que sepas en qué. Positivo = ingreso, negativo = gasto "Ajuste". */
export async function guardarAjuste(fd: FormData) {
  await listo();
  const monto = entero(fd, 'monto');
  if (!monto) return;
  const nota = texto(fd, 'nota');
  const cuentaId = await cuentaDe(fd);
  if (texto(fd, 'signo') === 'mas') {
    await db.insertarIngreso({ concepto: nota ? `Ajuste: ${nota}` : 'Ajuste', monto, cuentaId });
  } else {
    await db.insertarGasto({ concepto: nota || 'Ajuste sin explicar', monto, categoria: 'Ajuste', origen: 'web', cuentaId });
  }
  refrescar();
}

export async function guardarDeuda(fd: FormData) {
  await listo();
  const tipo = (['tarjeta', 'prestamo', 'otro'].includes(texto(fd, 'tipo')) ? texto(fd, 'tipo') : 'prestamo') as db.TipoCredito;
  await db.guardarDeuda(idDe(fd), {
    nombre: texto(fd, 'nombre') || (tipo === 'tarjeta' ? 'Tarjeta' : 'Crédito'),
    tipo,
    cupo: tipo === 'tarjeta' ? entero(fd, 'cupo') || null : null,
    banco: texto(fd, 'banco') || null,
    franquicia: tipo === 'tarjeta' ? texto(fd, 'franquicia') || null : null,
    ultimos4: tipo === 'tarjeta' ? ultimos4De(fd) : null,
    color: tipo === 'tarjeta' ? colorDe(fd) : null,
    saldo: entero(fd, 'saldo'),
    cuota: entero(fd, 'cuota'),
    tasa: texto(fd, 'tasa') || null,
    prioridad: entero(fd, 'prioridad') || 99,
    diaPago: diaDe(fd, 'dia_pago'),
    diaCorte: tipo === 'tarjeta' ? diaDe(fd, 'dia_corte') : null,
  });
  refrescar();
}

export async function guardarFijo(fd: FormData) {
  await listo();
  await db.guardarFijo(idDe(fd), { concepto: texto(fd, 'concepto') || 'Gasto fijo', monto: entero(fd, 'monto'), diaPago: diaDe(fd, 'dia_pago') });
  refrescar();
}

export async function registrarAbono(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) await db.abonarDeudaPorId(id, monto, await cuentaDe(fd), texto(fd, 'tipo_abono') === 'capital' ? 'capital' : 'cuota');
  refrescar();
}

export async function registrarCompra(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) {
    await db.registrarCompraCredito(id, { concepto: texto(fd, 'concepto') || 'Compra', monto, cuotas: entero(fd, 'cuotas') || 1 });
  }
  refrescar();
}

export async function guardarCuenta(fd: FormData) {
  await listo();
  await db.guardarCuenta(idDe(fd), {
    nombre: texto(fd, 'nombre') || 'Cuenta',
    banco: texto(fd, 'banco') || null,
    saldo: conSigno(fd, 'saldo'),
    ultimos4: ultimos4De(fd),
    franquicia: texto(fd, 'franquicia') || null,
    color: colorDe(fd),
    principal: fd.get('principal') === 'on',
  });
  refrescar();
}

export async function transferir(fd: FormData) {
  await listo();
  // 'efectivo' en el formulario = la cuenta de efectivo (se crea si no existe)
  const efectivo = texto(fd, 'desde') === 'efectivo' || texto(fd, 'hacia') === 'efectivo' ? (await db.cuentaEfectivo()).id : null;
  // Nota: si "desde" y "hacia" terminan siendo la misma cuenta, no se hace nada.
  const desdeId = texto(fd, 'desde') === 'efectivo' ? efectivo : idDe(fd, 'desde');
  const haciaId = texto(fd, 'hacia') === 'efectivo' ? efectivo : idDe(fd, 'hacia');
  const monto = entero(fd, 'monto');
  if (monto > 0 && desdeId !== haciaId) await db.transferir({ desdeId, haciaId, monto, nota: texto(fd, 'nota') || null });
  refrescar();
}

export async function guardarTopes(fd: FormData) {
  await listo();
  for (const c of [...CATEGORIAS, ...(await db.nombresPropios())]) await db.guardarTope(c, entero(fd, `tope_${c}`));
  refrescar();
}

export async function guardarMeta(fd: FormData) {
  await listo();
  const fecha = texto(fd, 'fecha_meta');
  await db.guardarMeta(idDe(fd), {
    nombre: texto(fd, 'nombre') || 'Meta',
    objetivo: entero(fd, 'objetivo'),
    fechaMeta: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    color: colorDe(fd),
  });
  refrescar();
}

export async function aportarMeta(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) await db.aportarMeta(id, texto(fd, 'signo') === 'menos' ? -monto : monto);
  refrescar();
}

export async function iniciarReto(clave: string) {
  await listo();
  const { crearReto } = await import('@/lib/retos');
  const r = await db.resumen();
  // Si hoy no hay límite (te pasaste del mes), el reto usa 80 % de tu gasto diario de la última semana.
  await crearReto(clave, r.presupuestoHoy > 0 ? r.presupuestoHoy : Math.max(10_000, r.ritmo7 * 0.8));
  refrescar();
}

export async function quitarRetoAccion(id: number) {
  await listo();
  const { quitarReto } = await import('@/lib/retos');
  await quitarReto(id);
  refrescar();
}

export async function marcarCuota(id: number, pagada: boolean, mes?: string) {
  await listo();
  await db.marcarCuota(id, pagada, db.mesValido(mes));
  refrescar();
}

export async function marcarFijo(id: number, pagado: boolean, mes?: string) {
  await listo();
  await db.marcarFijo(id, pagado, db.mesValido(mes));
  refrescar();
}

export async function borrar(tipo: 'gasto' | 'ingreso' | 'deuda' | 'fijo' | 'cuenta' | 'meta' | 'transferencia', id: number) {
  await listo();
  if (tipo === 'gasto') await db.borrarGasto(id);
  if (tipo === 'ingreso') await db.borrarIngreso(id);
  if (tipo === 'deuda') await db.borrarDeuda(id);
  if (tipo === 'fijo') await db.borrarFijo(id);
  if (tipo === 'cuenta') await db.borrarCuenta(id);
  if (tipo === 'meta') await db.borrarMeta(id);
  if (tipo === 'transferencia') await db.borrarTransferencia(id);
  refrescar();
}

/** Lo que movió el saldo de una cuenta (para entender por qué quedó en lo que quedó). */
export async function movimientosDeCuenta(id: number) {
  await listo();
  return db.movimientosCuenta(Number(id), 40);
}

/** Crea una categoría propia (nombre + emoji) desde la web. */
export async function crearCategoriaAccion(nombre: string, emoji: string | null) {
  await listo();
  const n = await db.crearCategoria(String(nombre).slice(0, 40), emoji ? String(emoji).slice(0, 16) : null, null);
  if (!n) return null;
  refrescar();
  const propia = (await db.categoriasPropias()).find((c) => c.nombre === n);
  return propia ?? { nombre: n, emoji: null, color: null };
}

// ---------------------------------------------------------------------------
// Paleta rápida (Ctrl+K): escribir como en el bot, desde la página

type BotonWeb = { texto: string; dato: string };

/** Pasa el texto por el mismo intérprete del bot. Devuelve la respuesta (HTML simple) y, si hay, los botones. */
export async function registrarTexto(texto: string): Promise<{ html: string; botones: BotonWeb[][] }> {
  await listo();
  const { manejarMensaje } = await import('@/lib/bot');
  const r = await manejarMensaje(texto.slice(0, 300));
  refrescar();
  if (typeof r !== 'string' && r.semana) {
    const chat = process.env.TELEGRAM_CHAT_ID;
    const { enviarResumenSemanal } = await import('@/lib/semanal');
    const ok = chat ? await enviarResumenSemanal(chat) : false;
    return { html: ok ? 'Te mandé el resumen de la semana a Telegram.' : 'No pude mandarlo a Telegram.', botones: [] };
  }
  return typeof r === 'string' ? { html: r, botones: [] } : { html: r.texto, botones: r.botones };
}

/** Lo mismo que tocar un botón del bot (¿de qué cuenta salió?, ¿era $700 o $700.000?). */
export async function tocarBoton(dato: string): Promise<{ html: string; botones: BotonWeb[][] }> {
  await listo();
  const { procesarBoton } = await import('@/lib/bot');
  const r = await procesarBoton(dato);
  refrescar();
  return { html: r.texto ?? r.aviso, botones: r.botones ?? [] };
}
