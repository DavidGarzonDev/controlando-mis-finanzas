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
  if (id) {
    await db.actualizarGasto(id, datos);
    refrescar();
    return {};
  }
  const nuevo = await db.insertarGasto({ ...datos, origen: 'web' });
  refrescar();
  // Alertas inteligentes (duplicado, inusual, suscripción que subió): se muestran en el aviso
  const { alertasGasto } = await import('@/lib/alertas');
  const g = await db.gastoPorId(Number(nuevo));
  const alertas = g ? await alertasGasto(g) : [];
  return alertas.length ? { alerta: alertas[0].replace(/<[^>]+>/g, '').replace(/ Si sí, toca Deshacer\./, ' Si sí, bórralo en Movimientos.') } : {};
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

export async function borrar(tipo: 'gasto' | 'ingreso' | 'deuda' | 'fijo' | 'cuenta' | 'meta' | 'transferencia' | 'prestamo', id: number) {
  await listo();
  if (tipo === 'gasto') await db.borrarGasto(id);
  if (tipo === 'ingreso') await db.borrarIngreso(id);
  if (tipo === 'deuda') await db.borrarDeuda(id);
  if (tipo === 'fijo') await db.borrarFijo(id);
  if (tipo === 'cuenta') await db.borrarCuenta(id);
  if (tipo === 'meta') await db.borrarMeta(id);
  if (tipo === 'transferencia') await db.borrarTransferencia(id);
  if (tipo === 'prestamo') await db.borrarPrestamo(id);
  refrescar();
}

/** Datos para "Tu año en Pilas". */
export async function datosAnio(anio: number) {
  await listo();
  return db.resumenAnio(Math.max(2020, Math.min(2100, Math.round(Number(anio)) || new Date().getFullYear())));
}

/** Qué IA está activa (para Conexiones). No expone la clave. */
export async function estadoDeLaIA() {
  await listo();
  const { estadoIA } = await import('@/lib/ia');
  return estadoIA();
}
/** Prueba la IA con un mensaje corto y dice si respondió. */
export async function probarIA() {
  await listo();
  const { interpretarConIA } = await import('@/lib/ia');
  const r = await interpretarConIA('me gasté 20 lucas en el parche con los amigos');
  return r.ok ? { ok: true, texto: `Entendió: ${r.dato.concepto} $${r.dato.monto.toLocaleString('es-CO')} · ${r.dato.categoria}` } : { ok: false, texto: r.motivo };
}

// ---------------------------------------------------------------------------
// Notificaciones de la app (push)

export async function llavePush() {
  await listo();
  const { llavePublicaPush } = await import('@/lib/push');
  return llavePublicaPush();
}
export async function activarPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, nombre: string) {
  await listo();
  const { guardarSuscripcion, enviarPush } = await import('@/lib/push');
  await guardarSuscripcion(sub, nombre || 'Este dispositivo', await origen());
  await enviarPush({ titulo: 'Pilas', cuerpo: '¡Listo! Aquí te llegarán los recordatorios y las alertas.', etiqueta: 'bienvenida' });
  refrescar();
}
export async function desactivarPush(endpoint: string) {
  await listo();
  const { quitarSuscripcion } = await import('@/lib/push');
  await quitarSuscripcion(String(endpoint));
}
export async function dispositivosPush() {
  await listo();
  const { suscripciones } = await import('@/lib/push');
  return (await suscripciones()).map((s) => ({ endpoint: s.endpoint, nombre: s.nombre, creada: s.creada }));
}

// ---------------------------------------------------------------------------
// Huella / Face ID (passkeys)

export async function opcionesNuevaLlave() {
  await listo();
  const { opcionesRegistro } = await import('@/lib/llaves');
  const { COOKIE_RETO, retoFirmado } = await import('@/lib/sesion');
  const { cookies } = await import('next/headers');
  const op = await opcionesRegistro();
  (await cookies()).set(COOKIE_RETO, await retoFirmado(op.challenge), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 300 });
  return op;
}
export async function guardarNuevaLlave(respuesta: unknown, nombre: string) {
  await listo();
  const { guardarRegistro } = await import('@/lib/llaves');
  const { COOKIE_RETO, leerReto } = await import('@/lib/sesion');
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  const reto = await leerReto(jar.get(COOKIE_RETO)?.value);
  jar.delete(COOKIE_RETO);
  if (!reto) return { ok: false, error: 'Se venció el tiempo. Inténtalo otra vez.' };
  try {
    const ok = await guardarRegistro(respuesta as Parameters<typeof guardarRegistro>[0], reto, nombre);
    if (ok) {
      const chat = process.env.TELEGRAM_CHAT_ID;
      if (chat) {
        const { enviarMensaje, esc } = await import('@/lib/telegram');
        await enviarMensaje(chat, `🔑 Activaste la entrada con huella/Face ID en <b>${esc(nombre || 'un dispositivo')}</b>.
¿No fuiste tú? Quítala en Plan → Conexiones y escribe /cerrarsesiones.`).catch(() => {});
      }
    }
    refrescar();
    return ok ? { ok: true } : { ok: false, error: 'No se pudo verificar.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo verificar.' };
  }
}
export async function listaLlaves() {
  await listo();
  const { llaves } = await import('@/lib/llaves');
  return llaves();
}
export async function quitarLlave(id: string) {
  await listo();
  const { borrarLlave } = await import('@/lib/llaves');
  await borrarLlave(String(id));
  refrescar();
}

// ---------------------------------------------------------------------------
// Utilidades

/** Dirección pública de la app (para armar el enlace que va en el Atajo / MacroDroid). */
async function origen() {
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
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
// Préstamos a personas ("te deben")

export async function crearPrestamoAccion(fd: FormData) {
  await listo();
  const monto = entero(fd, 'monto');
  const persona = texto(fd, 'persona');
  if (!monto || !persona) return;
  await db.crearPrestamo({ persona: persona[0].toUpperCase() + persona.slice(1), monto, cuentaId: await cuentaDe(fd), nota: texto(fd, 'nota') || null });
  refrescar();
}
export async function cobrarPrestamoAccion(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) await db.pagarPrestamo(id, monto, await cuentaDe(fd));
  refrescar();
}
/** Un gasto que en realidad era un préstamo. */
export async function convertirGastoAccion(id: number) {
  await listo();
  const g = await db.gastoPorId(Number(id));
  if (!g) return;
  await db.convertirEnPrestamo(g.id, db.personaDeConcepto(g.concepto));
  refrescar();
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
