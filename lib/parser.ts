import { PALABRAS_BASE, sinTildes, type Categoria } from './categorias';

export type Interpretado = {
  tipo: 'gasto' | 'ingreso';
  monto: number;
  concepto: string;
  categoria: Categoria | null;
};

// Sin \b: con tildes ("recibí") \b no funciona en JavaScript.
const PALABRAS_INGRESO = /^(ingreso|me pagaron|me consignaron|recib[ií]|sueldo|salario|quincena|me lleg[oó])(?=\s|$)/iu;

// Palabras de relleno que no aportan al concepto
const RELLENO = new Set([
  'gaste', 'gasté', 'pague', 'pagué', 'compre', 'compré', 'en', 'de', 'del', 'el', 'la', 'los', 'las',
  'un', 'una', 'por', 'para', 'y', 'me', 'costo', 'costó', 'valio', 'valió', 'fue', 'fueron', 'pesos',
  'ingreso', 'me pagaron', 'recibi', 'recibí', 'hoy', 'ayer',
]);

type Candidato = { valor: number; explicito: boolean; inicio: number; fin: number };

const RE_MONTO =
  /\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(millones|millon|millón|mill|palos?|mil|lucas?|k)?(?![\p{L}\d])/giu;

/** Extrae el monto de un texto. "15 mil" → 15000, "40k" → 40000, "1.100.000" → 1100000, "1,5 millones" → 1500000. */
export function extraerMonto(texto: string): { monto: number; resto: string } | null {
  const candidatos: Candidato[] = [];
  for (const m of texto.matchAll(RE_MONTO)) {
    const crudo = m[1];
    const unidad = (m[2] || '').toLowerCase();
    let numero: number;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(crudo)) {
      numero = Number(crudo.replace(/[.,]/g, '')); // separadores de miles
    } else {
      numero = Number(crudo.replace(',', '.')); // decimal (1,5 millones)
    }
    if (!Number.isFinite(numero) || numero <= 0) continue;

    let valor = numero;
    let explicito = false;
    if (/^(millones|millon|millón|mill|palo|palos)$/.test(unidad)) {
      valor = numero * 1_000_000;
      explicito = true;
    } else if (/^(mil|luca|lucas|k)$/.test(unidad)) {
      valor = numero * 1000;
      explicito = true;
    } else if (numero >= 1000) {
      explicito = true;
    } else {
      // "almuerzo 15" en Colombia normalmente significa 15 mil
      valor = numero * 1000;
    }
    candidatos.push({ valor: Math.round(valor), explicito, inicio: m.index!, fin: m.index! + m[0].length });
  }
  if (!candidatos.length) return null;

  const explicitos = candidatos.filter((c) => c.explicito);
  const elegido = (explicitos.length ? explicitos : candidatos).at(-1)!;
  const resto = (texto.slice(0, elegido.inicio) + ' ' + texto.slice(elegido.fin)).replace(/\s+/g, ' ').trim();
  return { monto: elegido.valor, resto };
}

function limpiarConcepto(resto: string): string {
  const palabras = resto
    .replace(/[$*_~`]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !RELLENO.has(p.toLowerCase()));
  const c = palabras.join(' ').trim();
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : '';
}

/** Busca la categoría por palabras clave: primero las aprendidas, luego las base. */
export function adivinarCategoria(texto: string, aprendidas: Record<string, Categoria> = {}): Categoria | null {
  const palabras = sinTildes(texto.toLowerCase()).split(/[^\p{L}\d]+/u).filter(Boolean);
  for (const p of palabras) if (aprendidas[p]) return aprendidas[p];
  for (const p of palabras) if (PALABRAS_BASE[p]) return PALABRAS_BASE[p];
  return null;
}

/**
 * Intérprete hecho a mano. Devuelve null si no encuentra monto o concepto
 * (en ese caso el bot le pregunta a la IA).
 */
export function interpretar(texto: string, aprendidas: Record<string, Categoria> = {}): Interpretado | null {
  const t = texto.trim();
  const tipo: Interpretado['tipo'] = PALABRAS_INGRESO.test(t) ? 'ingreso' : 'gasto';
  const sinPrefijo = tipo === 'ingreso' ? t.replace(PALABRAS_INGRESO, '').trim() : t;

  const m = extraerMonto(sinPrefijo);
  if (!m) return null;

  let concepto = limpiarConcepto(m.resto);
  if (!concepto) {
    if (tipo !== 'ingreso') return null;
    const prefijo = t.match(PALABRAS_INGRESO)?.[1]?.toLowerCase() ?? '';
    concepto = /sueldo|salario|quincena/.test(prefijo) ? prefijo.charAt(0).toUpperCase() + prefijo.slice(1) : 'Ingreso';
  }

  return {
    tipo,
    monto: m.monto,
    concepto,
    categoria: tipo === 'gasto' ? adivinarCategoria(concepto, aprendidas) : null,
  };
}
