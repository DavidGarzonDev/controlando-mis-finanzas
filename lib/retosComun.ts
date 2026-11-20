import { ZONA } from './config';

/**
 * Retos para que ahorrar sea un juego.
 * - 'sin':    días sin gastar en algo (por palabra o categoría), ej. "Semana sin domicilios".
 * - 'limite': días seguidos sin pasar un límite diario (el que tenías al empezar).
 * - 'cero':   cuántos días sin gastar nada dentro del periodo, ej. "3 días sin gastar en la semana".
 */
export type TipoReto = 'sin' | 'limite' | 'cero';
export type EstadoReto = 'activo' | 'logrado' | 'roto';
export type Reto = {
  id: number; tipo: TipoReto; nombre: string; inicio: string; dias: number; regla: string | null; monto: number | null;
  estado: EstadoReto;
  /** Días que van bien (para 'cero': días en $0). */
  cumplidos: number;
  /** Meta: días del periodo (o días en $0 que hay que lograr). */
  meta: number;
  /** Día del reto en que va (1..dias). */
  diaActual: number;
  detalle: string;
  avisado: boolean;
};

/** Los retos que se pueden activar con un toque. */
export const CATALOGO: { clave: string; tipo: TipoReto; nombre: string; dias: number; regla?: string; monto?: number; descripcion: string }[] = [
  { clave: 'domicilios', tipo: 'sin', nombre: 'Semana sin domicilios', dias: 7, regla: 'palabra:domicilio|rappi|ifood|didi food|uber eats|pedidosya', descripcion: 'Nada de Rappi ni domicilios por 7 días' },
  { clave: 'salidas', tipo: 'sin', nombre: 'Semana sin salidas', dias: 7, regla: 'categoria:Salidas', descripcion: 'Cero gastos en Salidas por 7 días' },
  { clave: 'limite', tipo: 'limite', nombre: '7 días sin pasarte del límite', dias: 7, descripcion: 'Cada día por debajo de tu límite diario' },
  { clave: 'cero', tipo: 'cero', nombre: '3 días sin gastar', dias: 7, monto: 3, descripcion: 'Logra 3 días en $0 esta semana' },
];

const n = (v: unknown) => Number(v) || 0;
const hoyClave = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
function sumarDias(fecha: string, d: number) {
  const x = new Date(`${fecha}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export type GastoDia = { fecha: string; concepto: string; categoria: string; monto: number };
export type RetoGuardado = {
  id: number; tipo: TipoReto; nombre: string; inicio: string; dias: number; regla: string | null; monto: number | null;
  estado: EstadoReto; avisado: boolean;
};

function coincide(regla: string | null, g: GastoDia) {
  if (!regla) return false;
  if (regla.startsWith('categoria:')) return g.categoria === regla.slice(10);
  if (regla.startsWith('palabra:')) return new RegExp(regla.slice(8), 'i').test(g.concepto);
  return false;
}

/** Evalúa un reto con los gastos desde su inicio. Pura: se puede probar sola. */
export function evaluarReto(r: RetoGuardado, gastos: GastoDia[], hoy = hoyClave()): Reto {
  const fin = sumarDias(r.inicio, r.dias - 1);
  const diaActual = Math.min(r.dias, Math.max(1, diasEntre(r.inicio, hoy) + 1));
  const terminado = hoy > fin;
  const enVentana = gastos.filter((g) => g.fecha >= r.inicio && g.fecha <= fin && g.fecha <= hoy);
  const totalDia = (f: string) => enVentana.filter((g) => g.fecha === f).reduce((s, g) => s + g.monto, 0);
  // Días ya completos (antes de hoy) dentro del reto
  const completos = Math.min(r.dias, Math.max(0, diasEntre(r.inicio, hoy)));
  const base = { ...r, diaActual };

  if (r.tipo === 'sin') {
    const rompe = enVentana.find((g) => coincide(r.regla, g));
    if (rompe) {
      return { ...base, estado: 'roto', cumplidos: Math.max(0, diasEntre(r.inicio, rompe.fecha)), meta: r.dias, detalle: `Se rompió con "${rompe.concepto}"` };
    }
    return {
      ...base, estado: terminado ? 'logrado' : 'activo', cumplidos: terminado ? r.dias : completos, meta: r.dias,
      detalle: terminado ? '¡Lo lograste!' : `Día ${diaActual} de ${r.dias}`,
    };
  }

  if (r.tipo === 'limite') {
    const limite = r.monto ?? 0;
    // Hoy también cuenta: si ya te pasaste hoy, se rompe hoy.
    for (let i = 0; i < r.dias; i++) {
      const f = sumarDias(r.inicio, i);
      if (f > hoy) break;
      const t = totalDia(f);
      if (t > limite) {
        return { ...base, estado: 'roto', cumplidos: i, meta: r.dias, detalle: `El día ${i + 1} gastaste $${t.toLocaleString('es-CO')} (límite $${limite.toLocaleString('es-CO')})` };
      }
    }
    return {
      ...base, estado: terminado ? 'logrado' : 'activo', cumplidos: terminado ? r.dias : completos, meta: r.dias,
      detalle: terminado ? '¡Lo lograste!' : `Límite: $${limite.toLocaleString('es-CO')} por día`,
    };
  }

  // 'cero': días en $0 (solo cuentan días ya terminados)
  const meta = r.monto ?? 3;
  let ceros = 0;
  for (let i = 0; i < completos; i++) if (totalDia(sumarDias(r.inicio, i)) === 0) ceros++;
  const quedan = r.dias - completos;
  if (ceros >= meta) return { ...base, estado: 'logrado', cumplidos: ceros, meta, detalle: '¡Lo lograste!' };
  if (ceros + quedan < meta) return { ...base, estado: 'roto', cumplidos: ceros, meta, detalle: 'Ya no alcanzan los días' };
  return { ...base, estado: 'activo', cumplidos: ceros, meta, detalle: `${ceros} de ${meta} días en $0` };
}

/** Días seguidos (hasta ayer) en que gastaste igual o menos que `limite`. */
export function rachaLimite(porDia: number[], limite: number, diaHoy: number): number {
  if (limite <= 0) return 0;
  let racha = 0;
  for (let d = diaHoy - 1; d >= 1; d--) {
    if ((porDia[d - 1] ?? 0) <= limite) racha++;
    else break;
  }
  return racha;
}
