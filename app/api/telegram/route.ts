import { manejarMensaje } from '@/lib/bot';
import { enviarMensaje } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ok = () => new Response('ok');

export async function GET() {
  return new Response('Bot de finanzas activo');
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
  const texto: string | undefined = msg?.text;
  const chatId = msg?.chat?.id;
  if (!texto || chatId == null) return ok();

  // Solo tú puedes usar el bot. A cualquier otro solo le decimos su chat ID.
  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID ?? '')) {
    if (texto.startsWith('/start')) {
      await enviarMensaje(chatId, `Tu chat ID es <code>${chatId}</code>. Ponlo en la variable TELEGRAM_CHAT_ID en Vercel y vuelve a desplegar.`);
    }
    return ok();
  }

  try {
    const respuesta = await manejarMensaje(texto);
    await enviarMensaje(chatId, respuesta);
  } catch (e) {
    console.error('Error procesando mensaje', e);
    await enviarMensaje(chatId, 'Ups, algo falló guardando eso. Intenta de nuevo en un momento.');
  }
  // Siempre 200: si no, Telegram reintenta y se duplicaría el gasto.
  return ok();
}
