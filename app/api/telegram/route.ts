import { manejarMensaje } from '@/lib/bot';
import { leerMedio } from '@/lib/gemini';
import { descargarArchivo, enviarMensaje, esc } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ok = () => new Response('ok');

export async function GET() {
  return new Response('Bot de finanzas activo');
}

/** Saca el texto del mensaje: escrito, nota de voz (transcrita) o foto de un recibo (leída). */
async function textoDelMensaje(msg: any): Promise<{ texto: string; leido?: string } | { error: string } | null> {
  if (msg.text) return { texto: msg.text };

  const voz = msg.voice ?? msg.audio;
  const foto = Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1] : null;
  const docImagen = msg.document && /^image\//.test(msg.document.mime_type ?? '') ? msg.document : null;
  if (!voz && !foto && !docImagen) return null;

  // Foto con texto escrito ("almuerzo 23500"): manda lo escrito.
  if ((foto || docImagen) && msg.caption) return { texto: msg.caption };

  const archivo = await descargarArchivo((voz ?? foto ?? docImagen).file_id);
  if (!archivo) return { error: 'No pude descargar el archivo (máximo 8 MB).' };
  const mime = voz ? (voz.mime_type ?? 'audio/ogg') : docImagen ? docImagen.mime_type : 'image/jpeg';
  const r = await leerMedio(archivo.base64, mime, voz ? 'audio' : 'imagen');
  if (!r.ok) {
    return {
      error:
        r.motivo === 'limite' ? 'La IA ya llegó a su límite de hoy. Escríbemelo: <code>almuerzo 15000</code>'
        : r.motivo === 'sin_clave' ? 'Para entender audios y fotos necesito la clave de Gemini (GEMINI_API_KEY).'
        : 'No pude entender eso. Escríbemelo: <code>almuerzo 15000</code>',
    };
  }
  if (/no se ve el valor/i.test(r.texto)) return { error: 'No veo el valor en la foto. Escríbemelo: <code>mercado 85400</code>' };
  return { texto: r.texto, leido: `${voz ? '🎤' : '🧾'} Entendí: «${esc(r.texto)}»` };
}

export async function POST(req: Request) {
  // Solo Telegram conoce este secreto (se lo damos al registrar el webhook).
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto || req.headers.get('x-telegram-bot-api-secret-token') !== secreto) {
    return new Response('No autorizado', { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return ok();
  }

  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  if (!msg || chatId == null) return ok();

  // Solo tú puedes usar el bot. A cualquier otro solo le decimos su chat ID.
  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID ?? '')) {
    if (typeof msg.text === 'string' && msg.text.startsWith('/start')) {
      await enviarMensaje(chatId, `Tu chat ID es <code>${chatId}</code>. Ponlo en la variable TELEGRAM_CHAT_ID en Vercel y vuelve a desplegar.`);
    }
    return ok();
  }

  try {
    const entrada = await textoDelMensaje(msg);
    if (!entrada) return ok();
    if ('error' in entrada) {
      await enviarMensaje(chatId, entrada.error);
      return ok();
    }
    // Una nota de voz puede traer varios gastos separados por " ; ".
    const partes = entrada.leido ? entrada.texto.split(/\s*;\s*/).filter(Boolean).slice(0, 5) : [entrada.texto];
    const respuestas: string[] = [];
    for (const p of partes) respuestas.push(await manejarMensaje(p));
    await enviarMensaje(chatId, [entrada.leido, ...respuestas].filter(Boolean).join('\n\n'));
  } catch (e) {
    console.error('Error procesando mensaje', e);
    await enviarMensaje(chatId, 'Ups, algo falló guardando eso. Intenta de nuevo en un momento.');
  }
  // Siempre 200: si no, Telegram reintenta y se duplicaría el gasto.
  return ok();
}
