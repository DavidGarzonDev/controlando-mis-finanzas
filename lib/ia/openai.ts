import type { EsquemaJSON, Proveedor, ResIA } from './tipos';

/**
 * OpenAI y todo lo que habla su mismo formato ("chat completions"): Groq, OpenRouter, DeepSeek,
 * Mistral, Together, o tu propio servidor (IA_BASE_URL). Clave: la de cada servicio (o IA_API_KEY).
 * Las notas de voz solo funcionan con OpenAI y Groq (tienen transcripción).
 */
export function compatible(opts: { nombre: string; apiKey: string; modelo: string; baseUrl: string; modeloAudio?: string }): Proveedor {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  async function chat(mensajes: unknown[], extra: Record<string, unknown> = {}): Promise<ResIA<string>> {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ model: opts.modelo, messages: mensajes, ...extra }),
        signal: AbortSignal.timeout(40_000),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, motivo: 'sin_clave' };
      if (res.status === 429) return { ok: false, motivo: 'limite' };
      if (!res.ok) {
        console.error(`${opts.nombre} respondió`, res.status, await res.text());
        return { ok: false, motivo: 'error' };
      }
      const data = await res.json();
      const texto = String(data?.choices?.[0]?.message?.content ?? '').trim();
      return texto ? { ok: true, valor: texto } : { ok: false, motivo: 'error' };
    } catch (e) {
      console.error(`Error llamando a ${opts.nombre}`, e);
      return { ok: false, motivo: 'error' };
    }
  }

  return {
    nombre: opts.nombre,
    modelo: opts.modelo,
    async json(sistema: string, texto: string, esquema: EsquemaJSON) {
      // "json_object" lo entienden casi todos los compatibles; el esquema va en las instrucciones.
      const r = await chat(
        [
          { role: 'system', content: `${sistema}\nResponde SOLO un objeto JSON que cumpla este esquema:\n${JSON.stringify(esquema)}` },
          { role: 'user', content: texto },
        ],
        { response_format: { type: 'json_object' } },
      );
      if (!r.ok) return r;
      try {
        return { ok: true, valor: JSON.parse(r.valor.replace(/^```(?:json)?\s*|\s*```$/g, '')) };
      } catch {
        return { ok: false, motivo: 'error' };
      }
    },
    texto(sistema: string, pregunta: string) {
      return chat([{ role: 'system', content: sistema }, { role: 'user', content: pregunta }]);
    },
    async medio(prompt: string, base64: string, mime: string, tipo: 'audio' | 'imagen') {
      if (tipo === 'imagen') {
        return chat([{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }] }]);
      }
      if (!opts.modeloAudio) return { ok: false, motivo: 'no_soporta' };
      // Transcripción de la nota de voz (OpenAI / Groq)
      try {
        const fd = new FormData();
        fd.set('model', opts.modeloAudio);
        fd.set('language', 'es');
        fd.set('file', new Blob([Buffer.from(base64, 'base64')], { type: mime }), mime.includes('ogg') ? 'nota.ogg' : 'nota.m4a');
        const res = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(40_000) });
        if (res.status === 429) return { ok: false, motivo: 'limite' };
        if (!res.ok) {
          console.error(`${opts.nombre} (audio) respondió`, res.status, await res.text());
          return { ok: false, motivo: 'error' };
        }
        const t = String((await res.json())?.text ?? '').trim();
        return t ? { ok: true, valor: t } : { ok: false, motivo: 'error' };
      } catch (e) {
        console.error(`Error transcribiendo con ${opts.nombre}`, e);
        return { ok: false, motivo: 'error' };
      }
    },
  };
}
