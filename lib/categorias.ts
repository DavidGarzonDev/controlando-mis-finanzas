export const CATEGORIAS = [
  'Comida',
  'Transporte',
  'Salidas',
  'Compras',
  'Hogar',
  'Servicios',
  'Salud',
  'Otros',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export function esCategoria(v: string): v is Categoria {
  return (CATEGORIAS as readonly string[]).includes(v);
}

/** Busca una categoría escrita a mano ("salidas", "SALIDAS", "salida") y la normaliza. */
export function normalizarCategoria(v: string): Categoria | null {
  const t = sinTildes(v.trim().toLowerCase());
  for (const c of CATEGORIAS) {
    const cn = sinTildes(c.toLowerCase());
    if (cn === t || cn.replace(/s$/, '') === t.replace(/s$/, '')) return c;
  }
  return null;
}

export function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Palabras que dicen DÓNDE fue el gasto, no QUÉ se compró ("gatorade en el gym").
 * Solo deciden la categoría si no hay otra palabra más concreta.
 */
export const PALABRAS_CONTEXTO = new Set(['gym', 'gimnasio', 'casa', 'calle', 'oficina', 'universidad', 'u', 'trabajo', 'tienda', 'exito', 'd1', 'ara']);

/** Palabras clave base (sin tildes, en minúscula). El bot aprende más con /cat. */
export const PALABRAS_BASE: Record<string, Categoria> = {
  // Comida
  almuerzo: 'Comida', desayuno: 'Comida', cena: 'Comida', comida: 'Comida', mercado: 'Comida',
  onces: 'Comida', mecato: 'Comida', empanada: 'Comida', empanadas: 'Comida', arepa: 'Comida',
  pan: 'Comida', panaderia: 'Comida', cafe: 'Comida', tinto: 'Comida', gaseosa: 'Comida',
  pizza: 'Comida', hamburguesa: 'Comida', perro: 'Comida', pollo: 'Comida', frutas: 'Comida',
  fruta: 'Comida', tienda: 'Comida', d1: 'Comida', ara: 'Comida', exito: 'Comida', rappi: 'Comida',
  // Bebidas y snacks
  gatorade: 'Comida', powerade: 'Comida', cocacola: 'Comida', coca: 'Comida', pony: 'Comida', malta: 'Comida',
  postobon: 'Comida', redbull: 'Comida', monster: 'Comida', energizante: 'Comida', bebida: 'Comida', refresco: 'Comida',
  galletas: 'Comida', galleta: 'Comida', papas: 'Comida', chocolatina: 'Comida', chocolate: 'Comida', mani: 'Comida',
  yogurt: 'Comida', leche: 'Comida', huevos: 'Comida', buñuelo: 'Comida', bunuelo: 'Comida', pandebono: 'Comida',
  almojabana: 'Comida', salchipapa: 'Comida', perro_caliente: 'Comida', jugos: 'Comida', cafeteria: 'Comida', restaurante: 'Comida',
  proteina: 'Salud', vitaminas: 'Salud',
  // Hogar (aseo y casa)
  shampoo: 'Hogar', papel: 'Hogar', escoba: 'Hogar', trapero: 'Hogar', cloro: 'Hogar', suavizante: 'Hogar',
  domicilio: 'Comida', helado: 'Comida', jugo: 'Comida', agua: 'Comida', snack: 'Comida',
  // Transporte
  gasolina: 'Transporte', tanqueo: 'Transporte', tanquear: 'Transporte', bus: 'Transporte',
  mio: 'Transporte', uber: 'Transporte', didi: 'Transporte', taxi: 'Transporte', indrive: 'Transporte',
  parqueadero: 'Transporte', peaje: 'Transporte', moto: 'Transporte', taller: 'Transporte',
  aceite: 'Transporte', llanta: 'Transporte', soat: 'Transporte', pasaje: 'Transporte',
  // Salidas
  salida: 'Salidas', salidas: 'Salidas', cine: 'Salidas', rumba: 'Salidas', cerveza: 'Salidas',
  cervezas: 'Salidas', polas: 'Salidas', pola: 'Salidas', trago: 'Salidas', tragos: 'Salidas',
  bar: 'Salidas', discoteca: 'Salidas', paseo: 'Salidas', novia: 'Salidas', cita: 'Salidas',
  concierto: 'Salidas', partido: 'Salidas',
  // Compras
  ropa: 'Compras', zapatos: 'Compras', tenis: 'Compras', camisa: 'Compras', pantalon: 'Compras',
  regalo: 'Compras', celular: 'Compras', audifonos: 'Compras', cargador: 'Compras', amazon: 'Compras',
  temu: 'Compras', shein: 'Compras',
  // Hogar
  arriendo: 'Hogar', aseo: 'Hogar', jabon: 'Hogar', detergente: 'Hogar', lavadora: 'Hogar',
  casa: 'Hogar', ferreteria: 'Hogar',
  // Servicios
  internet: 'Servicios', luz: 'Servicios', recarga: 'Servicios', datos: 'Servicios', plan: 'Servicios',
  netflix: 'Servicios', spotify: 'Servicios', gimnasio: 'Servicios', gym: 'Servicios',
  suscripcion: 'Servicios', platzi: 'Servicios', funeraria: 'Servicios',
  // Salud
  drogueria: 'Salud', medicamento: 'Salud', medicamentos: 'Salud', pastillas: 'Salud',
  medico: 'Salud', cita_medica: 'Salud', odontologo: 'Salud', farmacia: 'Salud',
};
