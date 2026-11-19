import { DIAS_DE_PAGO, ZONA } from './config';

export type Hoy = { anio: number; mes: number; dia: number; diasMes: number };
export type ProximoPago = { anio: number; mes: number; dia: number; dias: number };

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/** Fecha de hoy en Colombia (mes de 1 a 12). `ahora` permite probar con otra fecha. */
export function hoyEnColombia(ahora: Date = new Date()): Hoy {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value]),
  );
  const anio = Number(p.year);
  const mes = Number(p.month);
  return { anio, mes, dia: Number(p.day), diasMes: diasDelMes(anio, mes) };
}

/** "2026-11": la clave del mes actual en Colombia. */
export function mesClave(h: Hoy = hoyEnColombia()) {
  return `${h.anio}-${String(h.mes).padStart(2, '0')}`;
}

/**
 * El siguiente día de pago después de hoy, y cuántos días faltan contando hoy.
 * Con quincena (15 y 30): el 4 → el 15 (11 días); el 15 → el 30; el 30 → el 15 del mes siguiente.
 * En meses cortos, "30" se vuelve el último día del mes.
 */
export function proximoPago(h: Hoy, dias: number[] = DIAS_DE_PAGO): ProximoPago {
  const lista = dias.length ? dias : [30];
  for (const d of lista) {
    const efectivo = Math.min(d, h.diasMes);
    if (efectivo > h.dia) return { anio: h.anio, mes: h.mes, dia: efectivo, dias: efectivo - h.dia };
  }
  const anio = h.mes === 12 ? h.anio + 1 : h.anio;
  const mes = h.mes === 12 ? 1 : h.mes + 1;
  const dia = Math.min(lista[0], diasDelMes(anio, mes));
  return { anio, mes, dia, dias: h.diasMes - h.dia + dia };
}
