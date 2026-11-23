import { CATEGORIAS, esCategoria } from './categorias';
import type { Interpretado } from './parser';

const instrucciones = (cats: string[]) => `Eres el asistente de un bot de finanzas personales en Colombia (pesos colombianos, COP).
Recibes un mensaje corto y debes decir si registra un gasto o un ingreso.
Reglas:
- "mil", "k", "lucas" = x1000. "palo", "millón" = x1.000.000. "15" sin unidad para comida o transporte casi siempre es 15000.
- monto: número entero en pesos, sin puntos ni símbolos.
- concepto: 1 a 5 palabras, en español, con mayúscula inicial (ej. "Almuerzo", "Gasolina moto").
- categoria: una de ${cats.join(', ')}. Usa "Otros" si ninguna aplica.
- Es ingreso si dice que le pagaron, le llegó, le mandaron, vendió algo o que "tiene" una plata ("tengo 300 mil en efectivo").
- Si el mensaje no describe un gasto ni un ingreso con un monto claro, responde es_transaccion=false.`;

const esquema = (cats: string[]) => ({
  type: 'OBJECT',
  properties: {
    es_transaccion: { type: 'BOOLEAN' },
    tipo: { type: 'STRING', enum: ['gasto', 'ingreso'] },
    monto: { type: 'INTEGER' },
    concepto: { type: 'STRING' },
    categoria: { type: 'STRING', enum: cats },
  },
  required: ['es_transaccion', 'tipo', 'monto', 'concepto', 'categoria'],
});

export type ResultadoIA =
  | { ok: true; dato: Interpretado }
  | { ok: false; motivo: 'sin_clave' | 'no_entendio' | 'limite' | 'error' };

/** Le pregunta a Gemini qué significa el mensaje. Solo se llama cuando el intérprete hecho a mano no basta. */
export async function interpretarConIA(texto: string, propias: string[] = []): Promise<ResultadoIA> {
  const cats = [...CATEGORIAS, ...propias];
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucciones(cats) }] },
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: esquema(cats) },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) return { ok: false, motivo: 'limite' };
    if (!res.ok) {
      console.error('Gemini respondió', res.status, await res.text());
      return { ok: false, motivo: 'error' };
    }

    const data = await res.json();
    const textoRespuesta: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('');
    const r = JSON.parse(textoRespuesta);

    const monto = Math.round(Number(r.monto));
    if (!r.es_transaccion || !Number.isFinite(monto) || monto <= 0) return { ok: false, motivo: 'no_entendio' };

    return {
      ok: true,
      dato: {
        tipo: r.tipo === 'ingreso' ? 'ingreso' : 'gasto',
        monto,
        concepto: String(r.concepto || 'Gasto').slice(0, 80),
        categoria: esCategoria(r.categoria, propias) ? r.categoria : 'Otros',
      },
    };
  } catch (e) {
    console.error('Error llamando a Gemini', e);
    return { ok: false, motivo: 'error' };
  }
}

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

export type ResultadoMedio = { ok: true; texto: string } | { ok: false; motivo: 'sin_clave' | 'limite' | 'error' };

/** Convierte una nota de voz o la foto de un recibo en texto que el bot ya entiende. */
export async function leerMedio(base64: string, mime: string, tipo: 'audio' | 'imagen'): Promise<ResultadoMedio> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: tipo === 'audio' ? PROMPT_AUDIO : PROMPT_IMAGEN }, { inlineData: { mimeType: mime, data: base64 } }] }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 429) return { ok: false, motivo: 'limite' };
    if (!res.ok) {
      console.error('Gemini (medio) respondió', res.status, await res.text());
      return { ok: false, motivo: 'error' };
    }
    const data = await res.json();
    const texto: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
    return texto ? { ok: true, texto: texto.replace(/^["'«]|["'»]$/g, '').slice(0, 400) } : { ok: false, motivo: 'error' };
  } catch (e) {
    console.error('Error leyendo audio/imagen con Gemini', e);
    return { ok: false, motivo: 'error' };
  }
}

/** Pregunta libre a Gemini (texto en, texto out). La usa "Pregúntale a Pilas". */
export async function preguntarIA(sistema: string, pregunta: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: 'sin_clave' | 'limite' | 'error' }> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: pregunta }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 429) return { ok: false, motivo: 'limite' };
    if (!res.ok) {
      console.error('Gemini respondió', res.status, await res.text());
      return { ok: false, motivo: 'error' };
    }
    const data = await res.json();
    const texto: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
    return texto ? { ok: true, texto } : { ok: false, motivo: 'error' };
  } catch (e) {
    console.error('Error llamando a Gemini', e);
    return { ok: false, motivo: 'error' };
  }
}
