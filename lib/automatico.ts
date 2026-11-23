import * as db from './datos';
import { asegurarEsquema } from './esquema';
import { bancoEnTexto } from './bancos';
import { interpretarConIA } from './ia';
import { tarjetaGasto, tarjetaIngreso, type Tarjeta } from './mensajes';
import { leerNotificacion, type Notificacion } from './notificaciones';
import { adivinarCategoria } from './parser';
import { huella } from './sesion';
import { alertasGasto } from './alertas';
import { enviarPush, sinHtml } from './push';
import { esc, pesos } from './telegram';

/**
 * Registra solo lo que dice una notificación del banco (llega del celular por /api/registro,
 * o la pegas/reenvías al bot). Devuelve lo que el bot te responde: la tarjeta del movimiento
 * con sus botones, para que corrijas categoría o cuenta si hace falta.
 */
export type ResultadoAuto =
  | { ok: true; resumen: string; respuesta: string | Tarjeta }
  | { ok: false; motivo: 'no_es_movimiento' | 'repetida' | 'ya_registrado' | 'limite'; respuesta?: string };

export async function procesarNotificacion(texto: string, app?: string | null): Promise<ResultadoAuto> {
  await asegurarEsquema();
  const n = leerNotificacion(texto);
  if (!n) return { ok: false, motivo: 'no_es_movimiento' };
  if ((await db.notificacionesUltimaHora()) > 120) return { ok: false, motivo: 'limite' };
  // La misma notificación dos veces (push + SMS + correo) no se registra dos veces.
  const firma = await huella(`notif:${texto.replace(/\s+/g, ' ').trim().toLowerCase()}`);
  if (!(await db.notificacionNueva(firma))) return { ok: false, motivo: 'repetida' };

  const banco = n.banco ?? (app ? bancoEnTexto(app)?.id ?? null : null);
  const [cuentas, deudas] = await Promise.all([db.cuentas(), db.deudas()]);
  const tarjetas = deudas.filter((d) => d.tipo === 'tarjeta');

  // ¿De qué cuenta o tarjeta? Primero por los últimos 4 dígitos, luego por el banco.
  const tarjeta =
    (n.ultimos4 ? tarjetas.find((t) => t.ultimos4 === n.ultimos4) : undefined) ??
    (n.credito && banco ? tarjetas.find((t) => t.banco === banco) : undefined) ??
    // Si en ese banco solo tienes tarjeta de crédito (no cuenta), la compra es con la tarjeta
    (banco && !cuentas.some((c) => c.banco === banco || (n.ultimos4 && c.ultimos4 === n.ultimos4)) ? tarjetas.find((t) => t.banco === banco) : undefined);
  const cuenta =
    (n.ultimos4 ? cuentas.find((c) => c.ultimos4 === n.ultimos4) : undefined) ??
    (!tarjeta && banco ? cuentas.find((c) => c.banco === banco) : undefined);

  const nota = 'Lo registré solo desde la notificación del banco.';

  if (n.tipo === 'gasto') {
    // ¿Ya lo habías anotado a mano hace poco? Entonces no lo duplico.
    const previo = await db.gastoReciente(n.monto, 20);
    if (previo) {
      return {
        ok: false, motivo: 'ya_registrado',
        respuesta: `Vi una compra de ${pesos(n.monto)}${n.comercio ? ` en ${esc(n.comercio)}` : ''}, pero ya la tenías: <b>${esc(previo.concepto)}</b>. No la anoté otra vez.`,
      };
    }
    if (tarjeta) {
      await db.registrarCompraCredito(tarjeta.id, { concepto: n.comercio ?? 'Compra', monto: n.monto, cuotas: 1 });
      const disponible = tarjeta.cupo ? tarjeta.cupo - tarjeta.saldo - n.monto : null;
      return {
        ok: true, resumen: `Compra con ${tarjeta.nombre}: ${n.comercio ?? ''} ${pesos(n.monto)}`,
        respuesta: `💳 <b>${esc(n.comercio ?? 'Compra')}</b> · ${pesos(n.monto)} con <b>${esc(tarjeta.nombre)}</b>${disponible !== null ? `\nCupo disponible: ${pesos(disponible)}` : ''}\n<i>${nota} Si fue a cuotas, corrígelo en Billetera.</i>`,
      };
    }
    const concepto = conceptoDe(n);
    const categoria = await categoriaDe(concepto, n);
    const id = await db.insertarGasto({ concepto, monto: n.monto, categoria, origen: 'auto', texto, cuentaId: cuenta?.id ?? null });
    const g = await db.gastoPorId(id);
    const alertas = g ? await alertasGasto(g) : [];
    // Si hay algo raro, también te llega como notificación de la app
    if (alertas.length) await enviarPush({ titulo: `Pilas · ${concepto} ${pesos(n.monto)}`, cuerpo: sinHtml(alertas.join('\n')), url: '/#movimientos', etiqueta: 'alerta' });
    const t = await tarjetaGasto(id, { extra: [...alertas, `<i>${nota}</i>`] });
    return { ok: true, resumen: `${concepto} ${pesos(n.monto)}`, respuesta: t ?? `✅ ${esc(concepto)} ${pesos(n.monto)}` };
  }

  if (n.tipo === 'ingreso') {
    const id = await db.insertarIngreso({ concepto: n.comercio ?? 'Ingreso', monto: n.monto, cuentaId: cuenta?.id ?? null });
    const t = await tarjetaIngreso(id);
    return { ok: true, resumen: `Ingreso ${pesos(n.monto)}`, respuesta: t ? { ...t, texto: `${t.texto}\n<i>${nota}</i>` } : `💰 ${pesos(n.monto)}` };
  }

  if (n.tipo === 'retiro') {
    const efectivo = await db.cuentaEfectivo();
    const desde = cuenta && cuenta.id !== efectivo.id ? cuenta : undefined;
    await db.transferir({ desdeId: desde?.id ?? null, haciaId: efectivo.id, monto: n.monto, nota: 'Retiro' });
    return {
      ok: true, resumen: `Retiro ${pesos(n.monto)}`,
      respuesta: `🏧 Retiraste ${pesos(n.monto)}${desde ? ` de <b>${esc(desde.nombre)}</b>` : ''}. Pasó a tu <b>Efectivo</b> (${pesos(efectivo.saldo + n.monto)}).\n<i>${nota}</i>`,
    };
  }

  // Transferencia: si la cuenta destino es tuya, es solo cambiar de bolsillo; si no, es un envío (gasto).
  const destino = n.destino4 ? cuentas.find((c) => c.ultimos4 === n.destino4) : undefined;
  if (destino && cuenta && destino.id !== cuenta.id) {
    await db.transferir({ desdeId: cuenta.id, haciaId: destino.id, monto: n.monto });
    return {
      ok: true, resumen: `Transferencia ${pesos(n.monto)}`,
      respuesta: `🔁 Pasaste ${pesos(n.monto)} de <b>${esc(cuenta.nombre)}</b> a <b>${esc(destino.nombre)}</b>.\n<i>${nota}</i>`,
    };
  }
  const concepto = n.destino4 ? `Transferencia a cuenta *${n.destino4}` : 'Transferencia';
  const id = await db.insertarGasto({ concepto, monto: n.monto, categoria: 'Otros', origen: 'auto', texto, cuentaId: cuenta?.id ?? null });
  const t = await tarjetaGasto(id, { extra: [`<i>${nota}</i>`] });
  return { ok: true, resumen: `${concepto} ${pesos(n.monto)}`, respuesta: t ?? concepto };
}

function conceptoDe(n: Notificacion): string {
  if (!n.comercio) return 'Compra';
  // "Enviaste $20.000 a Juan Perez" → "Envío a Juan Perez"
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(n.comercio) && !/sas|ltda|s\.a/i.test(n.comercio)
    ? `Envío a ${n.comercio}`
    : n.comercio;
}

async function categoriaDe(concepto: string, n: Notificacion): Promise<string> {
  if (concepto.startsWith('Envío a')) return 'Otros';
  const aprendidas = await db.palabrasAprendidas();
  const directa = adivinarCategoria(concepto, aprendidas);
  if (directa) return directa;
  const ia = await interpretarConIA(`${concepto} ${n.monto}`, await db.nombresPropios());
  return ia.ok && ia.dato.categoria ? ia.dato.categoria : 'Otros';
}
