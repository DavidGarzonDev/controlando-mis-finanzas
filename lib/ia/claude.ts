import Anthropic from '@anthropic-ai/sdk';
import type { EsquemaJSON, Proveedor, ResIA } from './tipos';

/**
 * Claude (Anthropic) con el SDK oficial. Clave: ANTHROPIC_API_KEY (o IA_API_KEY).
 * Modelo por defecto: claude-opus-5-5; cámbialo con IA_MODELO (por ejemplo claude-haiku-5-5, más barato).
 * Si el modelo declina por sus filtros de seguridad, el servidor reintenta con otro modelo ("fallbacks").
 */

const FALLBACK = 'server-side-fallback-2026-07-01' as const;

function errorAMotivo(e: unknown): ResIA<never> {
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, motivo: 'sin_clave' };
  if (e instanceof Anthropic.RateLimitError) return { ok: false, motivo: 'limite' };
  console.error('Error llamando a Claude', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
  return { ok: false, motivo: 'error' };
}

/** El texto de la respuesta (sin bloques de razonamiento). null si el modelo declinó. */
function textoDe(r: Anthropic.Beta.BetaMessage): string | null {
  if (r.stop_reason === 'refusal') return null;
  return r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** Las imágenes que Claude acepta en base64. */
const MEDIA_IMAGEN = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type MediaImagen = (typeof MEDIA_IMAGEN)[number];

export function claude(apiKey: string, modelo: string): Proveedor {
  const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
  return {
    nombre: 'Claude',
    modelo,

    async json(sistema: string, texto: string, esquema: EsquemaJSON) {
      try {
        const r = await client.beta.messages.create({
          model: modelo,
          max_tokens: 8000,
          betas: [FALLBACK],
          fallbacks: 'default',
          system: sistema,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
          messages: [{ role: 'user', content: texto }],
        });
        const t = textoDe(r);
        if (!t) return { ok: false, motivo: 'error' };
        return { ok: true, valor: JSON.parse(t) };
      } catch (e) {
        return errorAMotivo(e);
      }
    },

    async texto(sistema: string, pregunta: string) {
      try {
        const r = await client.beta.messages.create({
          model: modelo,
          max_tokens: 16000,
          betas: [FALLBACK],
          fallbacks: 'default',
          system: sistema,
          output_config: { effort: 'medium' },
          messages: [{ role: 'user', content: pregunta }],
        });
        const t = textoDe(r);
        return t ? { ok: true, valor: t } : { ok: false, motivo: 'error' };
      } catch (e) {
        return errorAMotivo(e);
      }
    },

    async medio(prompt: string, base64: string, mime: string, tipo: 'audio' | 'imagen') {
      // Claude lee imágenes, pero no audio: las notas de voz necesitan Gemini u OpenAI.
      if (tipo === 'audio') return { ok: false, motivo: 'no_soporta' };
      const media = (MEDIA_IMAGEN as readonly string[]).includes(mime) ? (mime as MediaImagen) : 'image/jpeg';
      try {
        const r = await client.beta.messages.create({
          model: modelo,
          max_tokens: 8000,
          betas: [FALLBACK],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: media, data: base64 } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        });
        const t = textoDe(r);
        return t ? { ok: true, valor: t } : { ok: false, motivo: 'error' };
      } catch (e) {
        return errorAMotivo(e);
      }
    },
  };
}
