import { CATEGORIAS, esCategoria } from './categorias';
import type { Interpretado } from './parser';

const INSTRUCCIONES = `Eres el asistente de un bot de finanzas personales en Colombia (pesos colombianos, COP).
Recibes un mensaje corto y debes decir si registra un gasto o un ingreso.
Reglas:
- "mil", "k", "lucas" = x1000. "palo", "millón" = x1.000.000. "15" sin unidad para comida o transporte casi siempre es 15000.
- monto: número entero en pesos, sin puntos ni símbolos.
- concepto: 1 a 5 palabras, en español, con mayúscula inicial (ej. "Almuerzo", "Gasolina moto").
- categoria: una de ${CATEGORIAS.join(', ')}. Usa "Otros" si ninguna aplica.
- Si el mensaje no describe un gasto ni un ingreso con un monto claro, responde es_transaccion=false.`;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    es_transaccion: { type: 'BOOLEAN' },
    tipo: { type: 'STRING', enum: ['gasto', 'ingreso'] },
    monto: { type: 'INTEGER' },
    concepto: { type: 'STRING' },
    categoria: { type: 'STRING', enum: [...CATEGORIAS] },
  },
  required: ['es_transaccion', 'tipo', 'monto', 'concepto', 'categoria'],
};

export type ResultadoIA =
  | { ok: true; dato: Interpretado }
  | { ok: false; motivo: 'sin_clave' | 'no_entendio' | 'limite' | 'error' };

/** Le pregunta a Gemini qué significa el mensaje. Solo se llama cuando el intérprete hecho a mano no basta. */
export async function interpretarConIA(texto: string): Promise<ResultadoIA> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA },
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
        categoria: esCategoria(r.categoria) ? r.categoria : 'Otros',
      },
    };
  } catch (e) {
    console.error('Error llamando a Gemini', e);
    return { ok: false, motivo: 'error' };
  }
}
