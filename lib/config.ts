/** Zona horaria para "hoy", "este mes", etc. */
export const ZONA = 'America/Bogota';

/**
 * Días del mes en que te pagan. Por defecto quincena: 15 y 30 (si el mes es más corto, el último día).
 * Se puede cambiar con la variable DIAS_DE_PAGO, por ejemplo "30" o "5,20".
 */
export const DIAS_DE_PAGO: number[] = (process.env.DIAS_DE_PAGO || '15,30')
  .split(',')
  .map((d) => Number(d.trim()))
  .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
  .sort((a, b) => a - b);
