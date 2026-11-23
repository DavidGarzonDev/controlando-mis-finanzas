/** Lo común a todos los proveedores de IA (Gemini, Claude, OpenAI y compatibles). */

export type FalloIA = 'sin_clave' | 'limite' | 'error' | 'no_soporta';
export type ResIA<T> = { ok: true; valor: T } | { ok: false; motivo: FalloIA };

/** Esquema JSON estándar (minúsculas), el mismo para todos; cada proveedor lo adapta si hace falta. */
export type EsquemaJSON = { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };

export interface Proveedor {
  /** Nombre para mostrar ("Gemini", "Claude", "OpenAI"…). */
  nombre: string;
  modelo: string;
  /** Respuesta en JSON que cumple el esquema (para interpretar gastos). */
  json(sistema: string, texto: string, esquema: EsquemaJSON): Promise<ResIA<unknown>>;
  /** Respuesta en texto libre (para "Pregúntale a Pilas"). */
  texto(sistema: string, pregunta: string): Promise<ResIA<string>>;
  /** Leer una imagen (recibo) o una nota de voz y devolver texto. */
  medio(prompt: string, base64: string, mime: string, tipo: 'audio' | 'imagen'): Promise<ResIA<string>>;
}
