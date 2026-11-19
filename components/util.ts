import {
  Bus, CircleEllipsis, Scale, HeartPulse, House, PartyPopper, ShoppingBag, UtensilsCrossed, Wifi, type LucideIcon,
} from 'lucide-react';

export const ZONA = 'America/Bogota';

export const pesos = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('es-CO');

/** Formato corto para ejes y etiquetas: $850 mil, $1,2 M. */
export function pesosCorto(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (a >= 1000) return `$${Math.round(v / 1000).toLocaleString('es-CO')} mil`;
  return pesos(v);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const nombreMes = (m: number) => MESES[m - 1];
export const mesCortoDe = (m: number) => MESES_CORTOS[m - 1];
export const mesCorto = (clave: string) => MESES_CORTOS[Number(clave.slice(5, 7)) - 1];

/** "2026-11-19" de una fecha, en hora de Colombia. */
export function claveDia(f: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(f));
}

export function fechaCorta(f: string | Date, hoyClave: string) {
  const clave = claveDia(f);
  if (clave === hoyClave) return 'Hoy';
  const ayer = new Date(`${hoyClave}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (clave === ayer.toISOString().slice(0, 10)) return 'Ayer';
  const texto = new Date(f).toLocaleDateString('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2027-06-30" → "30 jun 2027". */
export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

export function hora(f: string | Date) {
  return new Date(f).toLocaleTimeString('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' });
}

/** Color fijo por categoría (nunca por posición): sigue a la categoría aunque cambie el orden. */
export const COLOR_CAT: Record<string, string> = {
  Comida: 'var(--s1)', Transporte: 'var(--s2)', Salidas: 'var(--s3)', Compras: 'var(--s4)',
  Hogar: 'var(--s5)', Servicios: 'var(--s6)', Salud: 'var(--s7)', Otros: 'var(--s-otros)', Ajuste: 'var(--tinta-3)',
};

export const ICONO_CAT: Record<string, LucideIcon> = {
  Comida: UtensilsCrossed, Transporte: Bus, Salidas: PartyPopper, Compras: ShoppingBag,
  Hogar: House, Servicios: Wifi, Salud: HeartPulse, Otros: CircleEllipsis, Ajuste: Scale,
};
