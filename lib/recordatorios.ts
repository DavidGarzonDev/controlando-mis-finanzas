import { DIAS_DE_PAGO } from './config';
import { hoyEnColombia } from './fechas';
import { sql } from './db';
import * as db from './datos';
import { esc, pesos } from './telegram';

/** "30" en un mes de 28 días cae el 28. */
const diaReal = (dia: number, diasMes: number) => Math.min(dia, diasMes);

/**
 * El mensaje de la mañana: pagos que vencen hoy o mañana, fechas de corte, día de quincena
 * (cuánto apartar y para qué) y cómo te fue ayer. Devuelve null si no hay nada que decir.
 */
export async function mensajeDelDia(): Promise<string | null> {
  const h = hoyEnColombia();
  const manana = h.dia === h.diasMes ? 1 : h.dia + 1;
  const [r, ds, fs, ms, ayer] = await Promise.all([db.resumen(), db.deudas(), db.fijos(), db.metas(), db.gastosDeAyer()]);
  const bloques: string[] = [];

  // 1) Día de pago: aparta lo que falta pagar antes de la próxima quincena
  const esDiaDePago = DIAS_DE_PAGO.some((d) => diaReal(d, h.diasMes) === h.dia);
  if (esDiaDePago) {
    const hasta = r.proximoPago.mes === h.mes ? r.proximoPago.dia : h.diasMes + r.proximoPago.dia;
    const antesDelProximo = r.pendientes.filter((p) => p.diaPago == null || (p.diaPago >= h.dia && p.diaPago < hasta) || p.diaPago < h.dia);
    const totalApartar = antesDelProximo.reduce((s, p) => s + p.monto, 0);
    const metasConFecha = ms.filter((m) => m.fechaMeta && m.ahorrado < m.objetivo);
    const lineas = [`💰 <b>Hoy es día de pago.</b> Antes de gastar, aparta:`];
    if (antesDelProximo.length) {
      lineas.push(...antesDelProximo.slice(0, 8).map((p) => `• ${esc(p.nombre)} ${pesos(p.monto)}${p.diaPago ? ` (día ${p.diaPago})` : ''}`));
      lineas.push(`<b>Total: ${pesos(totalApartar)}</b>`);
    }
    for (const m of metasConFecha.slice(0, 2)) {
      const fecha = new Date(`${m.fechaMeta}T12:00:00`);
      const quincenas = Math.max(1, Math.round((fecha.getTime() - Date.now()) / (15 * 86_400_000)));
      lineas.push(`🎯 ${esc(m.nombre)}: aparta ~${pesos(Math.ceil((m.objetivo - m.ahorrado) / quincenas / 1000) * 1000)} esta quincena para llegar a tiempo.`);
    }
    if (lineas.length > 1) bloques.push(lineas.join('\n'));
  }

  // 2) Pagos que vencen hoy o mañana
  const vencen: string[] = [];
  for (const f of fs) {
    if (f.pagadoMes || !f.diaPago) continue;
    const d = diaReal(f.diaPago, h.diasMes);
    if (d === h.dia) vencen.push(`• <b>Hoy</b>: ${esc(f.concepto)} ${pesos(f.monto)}`);
    else if (d === manana) vencen.push(`• Mañana: ${esc(f.concepto)} ${pesos(f.monto)}`);
  }
  for (const d of ds) {
    if (d.saldo <= 0 || !d.diaPago) continue;
    const falta = d.faltaMes;
    if (falta <= 0) continue;
    const dia = diaReal(d.diaPago, h.diasMes);
    if (dia === h.dia) vencen.push(`• <b>Hoy</b>: cuota de ${esc(d.nombre)} ${pesos(falta)}`);
    else if (dia === manana) vencen.push(`• Mañana: cuota de ${esc(d.nombre)} ${pesos(falta)}`);
  }
  if (vencen.length) bloques.push(`📅 <b>Pagos que vencen</b>\n${vencen.join('\n')}\nCuando pagues: <code>/pague gimnasio</code> o <code>pagué la cuota de la nu</code>`);

  // 3) Fechas de corte de las tarjetas
  const cortes = ds.filter((d) => d.tipo === 'tarjeta' && d.diaCorte && diaReal(d.diaCorte, h.diasMes) === manana);
  if (cortes.length) {
    bloques.push(`✂️ Mañana es el corte de ${cortes.map((d) => `<b>${esc(d.nombre)}</b>`).join(', ')}. Lo que compres desde pasado mañana se cobra en el siguiente extracto.`);
  }

  // 4) Cómo te fue ayer y cuánto puedes gastar hoy
  if (r.ingresos > 0) {
    const ayerTxt = ayer.veces ? `Ayer gastaste ${pesos(ayer.total)} en ${ayer.veces} ${ayer.veces === 1 ? 'cosa' : 'cosas'}. ` : '';
    bloques.push(
      r.disponible > 0
        ? `☀️ ${ayerTxt}Hoy puedes gastar <b>${pesos(r.presupuestoHoy)}</b> (faltan ${r.proximoPago.dias} días para el ${r.proximoPago.dia}).`
        : `☀️ ${ayerTxt}Vas <b>${pesos(-r.disponible)}</b> por encima este mes: hoy, solo lo necesario.`,
    );
  }

  // Solo mandamos algo si hay un aviso real (el "cómo vas" solo no justifica escribirte… salvo en quincena).
  const hayAviso = esDiaDePago || vencen.length > 0 || cortes.length > 0;
  return hayAviso ? bloques.join('\n\n') : null;
}

/** Marca el día como enviado. Devuelve false si ya se había enviado hoy (Vercel a veces repite). */
export async function marcarEnviado(): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO recordatorios_enviados (fecha) VALUES ((now() AT TIME ZONE 'America/Bogota')::date)
    ON CONFLICT DO NOTHING RETURNING fecha`;
  return rows.length > 0;
}
