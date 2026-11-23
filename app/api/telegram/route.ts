import { manejarMensaje, procesarBoton, type Respuesta } from '@/lib/bot';
import { leerMedio } from '@/lib/ia';
import { enviarResumenSemanal } from '@/lib/semanal';
import { asegurarComandos, asegurarWebhookConBotones, descargarArchivo, editarMensaje, enviarConMenu, enviarMensaje, esc, responderBoton } from '@/lib/telegram';

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
        : r.motivo === 'sin_clave' ? 'Para entender audios y fotos necesito una IA configurada (por ejemplo GEMINI_API_KEY en Vercel).'
        : r.motivo === 'no_soporta' ? 'La IA que tienes configurada no entiende notas de voz (Gemini, OpenAI y Groq sí). Escríbemelo: <code>almuerzo 15000</code>'
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

  // Para que lleguen los toques de los botones (se corrige solo, una vez).
  await asegurarWebhookConBotones();
  await asegurarComandos();

  // Tocaron un botón (ej. "¿De dónde salió?" → Nu)
  const toque = update?.callback_query;
  if (toque) {
    const chat = toque.message?.chat?.id;
    if (String(chat) !== String(process.env.TELEGRAM_CHAT_ID ?? '')) {
      await responderBoton(toque.id);
      return ok();
    }
    try {
      const r = await procesarBoton(String(toque.data ?? ''));
      await responderBoton(toque.id, r.aviso.trim() || undefined);
      // La tarjeta del movimiento se vuelve a dibujar con su estado nuevo (y sus botones).
      if (r.texto !== undefined && toque.message) await editarMensaje(chat, toque.message.message_id, r.texto, r.botones ?? []);
    } catch (e) {
      console.error('Error con el botón', e);
      await responderBoton(toque.id, 'No pude guardarlo, intenta otra vez');
    }
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
    const respuestas: Respuesta[] = [];
    for (const p of partes) respuestas.push(await manejarMensaje(p));
    // Las respuestas con botones van en su propio mensaje (cada una con sus botones).
    const simples = respuestas.filter((r): r is string => typeof r === 'string');
    const conBotones = respuestas.filter((r): r is Exclude<Respuesta, string> => typeof r !== 'string');
    if (entrada.leido || simples.length) await enviarMensaje(chatId, [entrada.leido, ...simples].filter(Boolean).join('\n\n'));
    for (const r of conBotones) {
      if (r.semana) await enviarResumenSemanal(chatId);
      else if (r.menu) await enviarConMenu(chatId, r.texto);
      else await enviarMensaje(chatId, r.texto, r.botones);
    }
  } catch (e) {
    console.error('Error procesando mensaje', e);
    await enviarMensaje(chatId, 'Ups, algo falló guardando eso. Intenta de nuevo en un momento.');
  }
  // Siempre 200: si no, Telegram reintenta y se duplicaría el gasto.
  return ok();
}
