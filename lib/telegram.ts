export type Boton = { texto: string; dato: string };

async function api(metodo: string, cuerpo: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) console.error(`Telegram ${metodo} falló`, res.status, await res.text());
  return res.ok ? res.json() : null;
}

const teclado = (botones?: Boton[][]) =>
  botones?.length ? { inline_keyboard: botones.map((fila) => fila.map((b) => ({ text: b.texto, callback_data: b.dato }))) } : undefined;

/** Manda un mensaje; con `botones`, debajo aparecen botones que el usuario puede tocar. */
export async function enviarMensaje(chatId: number | string, texto: string, botones?: Boton[][]) {
  await api('sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: teclado(botones) });
}

/** Cambia el texto de un mensaje ya enviado (y quita sus botones). */
export async function editarMensaje(chatId: number | string, mensajeId: number, texto: string) {
  await api('editMessageText', { chat_id: chatId, message_id: mensajeId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
}

/** Responde al toque de un botón (quita el "cargando" del botón en Telegram). */
export async function responderBoton(id: string, texto?: string) {
  await api('answerCallbackQuery', { callback_query_id: id, text: texto });
}

let webhookRevisado = false;
/**
 * Para recibir los toques de los botones, el webhook debe aceptar "callback_query".
 * Si se registró solo con "message", lo corrige una vez (misma URL y mismo secreto).
 */
export async function asegurarWebhookConBotones() {
  if (webhookRevisado) return;
  webhookRevisado = true;
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !secreto) return;
    const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
    const url: string | undefined = info?.result?.url;
    const permitidos: string[] | undefined = info?.result?.allowed_updates;
    if (!url || !permitidos || permitidos.includes('callback_query')) return;
    await api('setWebhook', { url, secret_token: secreto, allowed_updates: [...new Set([...permitidos, 'message', 'callback_query'])] });
  } catch (e) {
    console.error('No se pudo revisar el webhook', e);
  }
}

/** Descarga un archivo que mandaron al bot (nota de voz, foto) y lo devuelve en base64. Máximo ~8 MB. */
export async function descargarArchivo(fileId: string): Promise<{ base64: string; ruta: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) => r.json());
  const ruta: string | undefined = info?.result?.file_path;
  if (!ruta || (info.result.file_size ?? 0) > 8_000_000) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${ruta}`);
  if (!res.ok) return null;
  return { base64: Buffer.from(await res.arrayBuffer()).toString('base64'), ruta };
}

/** Escapa texto del usuario para que no rompa el HTML de Telegram. */
export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const pesos = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('es-CO');
