import { CATEGORIAS, esCategoria } from './categorias';
import { claude } from './ia/claude';
import { gemini } from './ia/gemini';
import { compatible } from './ia/openai';
import type { EsquemaJSON, FalloIA, Proveedor } from './ia/tipos';
import type { Interpretado } from './parser';

/**
 * La inteligencia artificial de Pilas, con el proveedor que tú elijas (cada quien con su propia clave).
 *
 *   IA_PROVEEDOR = gemini | claude | openai | groq | openrouter | deepseek | compatible
 *   IA_MODELO    = el modelo (opcional; cada proveedor tiene uno por defecto)
 *   IA_API_KEY   = la clave (o la variable propia de cada uno: GEMINI_API_KEY, ANTHROPIC_API_KEY,
 *                  OPENAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY)
 *   IA_BASE_URL  = solo para "compatible": la dirección del servicio (…/v1)
 *
 * Sin IA_PROVEEDOR, se usa el primero que tenga clave (en ese orden). Sin ninguna clave, el bot
 * funciona igual con su intérprete propio; solo se pierden las notas de voz, las fotos de recibos,
 * los mensajes raros y "Pregúntale a Pilas".
 */

type Config = { id: string; nombre: string; clave: string | undefined; modelo: string; crear: (clave: string, modelo: string) => Proveedor };

const env = (k: string) => process.env[k]?.trim() || undefined;

function configuraciones(): Config[] {
  const comp = (id: string, nombre: string, claveEnv: string, modelo: string, baseUrl: string, modeloAudio?: string): Config => ({
    id, nombre, clave: env(claveEnv), modelo,
    crear: (clave, m) => compatible({ nombre, apiKey: clave, modelo: m, baseUrl: env('IA_BASE_URL') ?? baseUrl, modeloAudio }),
  });
  return [
    { id: 'gemini', nombre: 'Gemini', clave: env('GEMINI_API_KEY'), modelo: env('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite', crear: gemini },
    { id: 'claude', nombre: 'Claude', clave: env('ANTHROPIC_API_KEY'), modelo: 'claude-opus-5-5', crear: claude },
    comp('openai', 'OpenAI', 'OPENAI_API_KEY', 'gpt-4.1-mini', 'https://api.openai.com/v1', 'whisper-1'),
    comp('groq', 'Groq', 'GROQ_API_KEY', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1', 'whisper-large-v3-turbo'),
    comp('openrouter', 'OpenRouter', 'OPENROUTER_API_KEY', 'openrouter/auto', 'https://openrouter.ai/api/v1'),
    comp('deepseek', 'DeepSeek', 'DEEPSEEK_API_KEY', 'deepseek-chat', 'https://api.deepseek.com/v1'),
    comp('compatible', 'Compatible OpenAI', 'IA_API_KEY', 'modelo', env('IA_BASE_URL') ?? ''),
  ];
}

/** El proveedor activo, o null si no hay ninguno configurado. */
export function proveedorIA(): Proveedor | null {
  const todos = configuraciones();
  const elegido = env('IA_PROVEEDOR')?.toLowerCase();
  const c = elegido ? todos.find((x) => x.id === elegido || x.nombre.toLowerCase() === elegido) : todos.find((x) => x.clave);
  if (!c) return null;
  const clave = env('IA_API_KEY') ?? c.clave;
  if (!clave) return null;
  if (c.id === 'compatible' && !env('IA_BASE_URL')) return null;
  return c.crear(clave, env('IA_MODELO') ?? c.modelo);
}

/** Para mostrar en Conexiones qué IA está activa (sin exponer la clave). */
export function estadoIA(): { activa: boolean; nombre: string | null; modelo: string | null; voz: boolean } {
  const p = proveedorIA();
  const voz = !!p && ['Gemini', 'OpenAI', 'Groq'].includes(p.nombre);
  return { activa: !!p, nombre: p?.nombre ?? null, modelo: p?.modelo ?? null, voz };
}

// ---------------------------------------------------------------------------
// Interpretar mensajes raros ("me gasté 20 lucas en el parche") → gasto o ingreso

const instrucciones = (cats: string[]) => `Eres el asistente de un bot de finanzas personales en Colombia (pesos colombianos, COP).
Recibes un mensaje corto y debes decir si registra un gasto o un ingreso.
Reglas:
- "mil", "k", "lucas" = x1000. "palo", "millón" = x1.000.000. "15" sin unidad para comida o transporte casi siempre es 15000.
- monto: número entero en pesos, sin puntos ni símbolos.
- concepto: 1 a 5 palabras, en español, con mayúscula inicial (ej. "Almuerzo", "Gasolina moto").
- categoria: una de ${cats.join(', ')}. Usa "Otros" si ninguna aplica.
- Es ingreso si dice que le pagaron, le llegó, le mandaron, vendió algo o que "tiene" una plata ("tengo 300 mil en efectivo").
- Si el mensaje no describe un gasto ni un ingreso con un monto claro, responde es_transaccion=false.`;

const esquema = (cats: string[]): EsquemaJSON => ({
  type: 'object',
  properties: {
    es_transaccion: { type: 'boolean' },
    tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
    monto: { type: 'integer' },
    concepto: { type: 'string' },
    categoria: { type: 'string', enum: cats },
  },
  required: ['es_transaccion', 'tipo', 'monto', 'concepto', 'categoria'],
  additionalProperties: false,
});

export type ResultadoIA =
  | { ok: true; dato: Interpretado }
  | { ok: false; motivo: FalloIA | 'no_entendio' };

/** Le pregunta a la IA qué significa el mensaje. Solo se llama cuando el intérprete hecho a mano no basta. */
export async function interpretarConIA(texto: string, propias: string[] = []): Promise<ResultadoIA> {
  const ia = proveedorIA();
  if (!ia) return { ok: false, motivo: 'sin_clave' };
  const cats = [...CATEGORIAS, ...propias];
  const r = await ia.json(instrucciones(cats), texto, esquema(cats));
  if (!r.ok) return r;
  const d = r.valor as Record<string, unknown>;
  const monto = Math.round(Number(d.monto));
  if (!d.es_transaccion || !Number.isFinite(monto) || monto <= 0) return { ok: false, motivo: 'no_entendio' };
  return {
    ok: true,
    dato: {
      tipo: d.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      monto,
      concepto: String(d.concepto || 'Gasto').slice(0, 80),
      categoria: esCategoria(String(d.categoria), propias) ? String(d.categoria) : 'Otros',
    },
  };
}

// ---------------------------------------------------------------------------
// Notas de voz y fotos de recibos

const PROMPT_AUDIO = `Transcribe esta nota de voz en español de Colombia, en una sola línea y sin comillas.
Si menciona varios gastos o ingresos, sepáralos con " ; " (ej. "almuerzo 15 mil ; gasolina 40 mil").
Escribe los montos como los dijo ("15 mil", "1.200.000").`;

const PROMPT_IMAGEN = `Es la foto de un recibo, factura, voucher o pantallazo de pago en Colombia.
Responde SOLO una línea con: <qué se compró, 1 a 3 palabras> <valor total en pesos, solo dígitos>.
Mira los productos de la factura y resume QUÉ son, como lo diría un colombiano:
- paquetes, papas, dulces, chocolatinas, galletas, gaseosas → "Mecato"
- comida para la casa (arroz, carne, verduras, leche, huevos) → "Mercado"
- jabón, detergente, papel higiénico, cloro → "Aseo"
- medicamentos → "Droguería"; gasolina → "Gasolina"; comida servida → "Almuerzo" o "Comida restaurante"
Nunca respondas algo genérico como "Compra productos" o "Compra varios".
Ejemplos: "Mecato 10650", "Mercado D1 85400", "Gasolina Terpel 60000", "Aseo 23400".
Si es una transferencia o pago recibido, empieza con "me pagaron". Si no se ve un valor, responde "no se ve el valor".`;

export type ResultadoMedio = { ok: true; texto: string } | { ok: false; motivo: FalloIA };

/** Convierte una nota de voz o la foto de un recibo en texto que el bot ya entiende. */
export async function leerMedio(base64: string, mime: string, tipo: 'audio' | 'imagen'): Promise<ResultadoMedio> {
  const ia = proveedorIA();
  if (!ia) return { ok: false, motivo: 'sin_clave' };
  const r = await ia.medio(tipo === 'audio' ? PROMPT_AUDIO : PROMPT_IMAGEN, base64, mime, tipo);
  return r.ok ? { ok: true, texto: r.valor.replace(/^["'«]|["'»]$/g, '').slice(0, 400) } : r;
}

// ---------------------------------------------------------------------------
// Pregúntale a Pilas

/** Pregunta libre (texto en, texto out). */
export async function preguntarIA(sistema: string, pregunta: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: FalloIA }> {
  const ia = proveedorIA();
  if (!ia) return { ok: false, motivo: 'sin_clave' };
  const r = await ia.texto(sistema, pregunta);
  return r.ok ? { ok: true, texto: r.valor } : r;
}
