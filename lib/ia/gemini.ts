import type { EsquemaJSON, Proveedor, ResIA } from './tipos';

/**
 * Gemini (Google AI Studio). Clave: GEMINI_API_KEY (o IA_API_KEY). Tiene plan gratis.
 * Modelo por defecto: gemini-3.1-flash-lite; cámbialo con IA_MODELO (o GEMINI_MODEL).
 */

/** Gemini usa tipos en mayúscula (OBJECT, STRING…) y no acepta additionalProperties. */
function aEsquemaGemini(e: unknown): unknown {
  if (Array.isArray(e)) return e.map(aEsquemaGemini);
  if (!e || typeof e !== 'object') return e;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 'additionalProperties') continue;
    out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : aEsquemaGemini(v);
  }
  return out;
}

export function gemini(apiKey: string, modelo: string): Proveedor {
  async function llamar(cuerpo: unknown, espera = 25_000): Promise<ResIA<string>> {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(espera),
      });
      if (res.status === 429) return { ok: false, motivo: 'limite' };
      if (res.status === 400 || res.status === 403) {
        const t = await res.text();
        console.error('Gemini respondió', res.status, t);
        return { ok: false, motivo: /API key/i.test(t) ? 'sin_clave' : 'error' };
      }
      if (!res.ok) {
        console.error('Gemini respondió', res.status, await res.text());
        return { ok: false, motivo: 'error' };
      }
      const data = await res.json();
      const texto: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
      return texto ? { ok: true, valor: texto } : { ok: false, motivo: 'error' };
    } catch (e) {
      console.error('Error llamando a Gemini', e);
      return { ok: false, motivo: 'error' };
    }
  }

  return {
    nombre: 'Gemini',
    modelo,
    async json(sistema: string, texto: string, esquema: EsquemaJSON) {
      const r = await llamar({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: aEsquemaGemini(esquema) },
      }, 15_000);
      if (!r.ok) return r;
      try {
        return { ok: true, valor: JSON.parse(r.valor) };
      } catch {
        return { ok: false, motivo: 'error' };
      }
    },
    texto(sistema: string, pregunta: string) {
      return llamar({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: pregunta }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
      });
    },
    medio(prompt: string, base64: string, mime: string) {
      return llamar({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: base64 } }] }] });
    },
  };
}
