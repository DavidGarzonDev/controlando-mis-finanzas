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
export async function enviarMensaje(chatId: number | string, texto: string, botones?: Boton[][]): Promise<boolean> {
  return Boolean(await api('sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: teclado(botones) }));
}

/** Manda una imagen (PNG) con un texto debajo (máx. 1024 caracteres). */
export async function enviarFoto(chatId: number | string, png: ArrayBuffer, texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const fd = new FormData();
  fd.set('chat_id', String(chatId));
  fd.set('caption', texto.slice(0, 1024));
  fd.set('parse_mode', 'HTML');
  fd.set('photo', new Blob([png], { type: 'image/png' }), 'semana.png');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
  if (!res.ok) console.error('Telegram sendPhoto falló', res.status, await res.text());
  return res.ok;
}

/** Menú fijo abajo del chat (botones de texto, sin emojis). Al tocarlos, Telegram manda ese texto. */
export const MENU = [['Hoy', 'Resumen', 'Por pagar'], ['Metas', 'Tarjetas', 'Deshacer']];

/** Manda un mensaje y deja el menú fijo abajo del chat. */
export async function enviarConMenu(chatId: number | string, texto: string): Promise<boolean> {
  return Boolean(await api('sendMessage', {
    chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { keyboard: MENU.map((f) => f.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Ej: almuerzo 15 mil con nequi' },
  }));
}

let comandosListos = false;
/** La lista de comandos que sale al escribir "/" en Telegram (se registra una vez por arranque). */
export async function asegurarComandos() {
  if (comandosListos || !process.env.TELEGRAM_BOT_TOKEN) return;
  comandosListos = true;
  await api('setMyCommands', {
    commands: [
      { command: 'hoy', description: 'Cuánto puedes gastar hoy' },
      { command: 'resumen', description: 'Cómo vas este mes' },
      { command: 'pendientes', description: 'Lo que te falta pagar' },
      { command: 'metas', description: 'Tus metas de ahorro' },
      { command: 'tarjetas', description: 'Cupo de tus tarjetas' },
      { command: 'deshacer', description: 'Borra el último movimiento' },
      { command: 'categorias', description: 'Ver y crear categorías' },
      { command: 'consejos', description: 'Recomendaciones con tus números' },
      { command: 'retos', description: 'Tus retos y rachas' },
      { command: 'menu', description: 'Mostrar el menú de botones' },
      { command: 'ayuda', description: 'Todo lo que puedo hacer' },
    ],
  }).catch(() => (comandosListos = false));
}

/** Cambia el texto de un mensaje ya enviado (y quita sus botones). */
export async function editarMensaje(chatId: number | string, mensajeId: number, texto: string, botones?: Boton[][]) {
  await api('editMessageText', {
    chat_id: chatId, message_id: mensajeId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: teclado(botones),
  });
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

/** Datos del bot (para el asistente): su @usuario y nombre. null si el token no sirve. */
export async function infoBot(): Promise<{ usuario: string; nombre: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json());
    return r?.ok ? { usuario: String(r.result.username), nombre: String(r.result.first_name) } : null;
  } catch {
    return null;
  }
}

/** A dónde manda Telegram los mensajes del bot (y el último error, si hubo). */
export async function infoWebhook(): Promise<{ url: string; error: string | null; pendientes: number } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json());
    if (!r?.ok) return null;
    return { url: String(r.result.url ?? ''), error: r.result.last_error_message ? String(r.result.last_error_message) : null, pendientes: Number(r.result.pending_update_count) || 0 };
  } catch {
    return null;
  }
}

/** Conecta el bot con esta app: Telegram mandará los mensajes a <sitio>/api/telegram con el secreto. */
export async function conectarWebhook(sitio: string): Promise<boolean> {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN || !secreto) return false;
  const r = await api('setWebhook', {
    url: `${sitio.replace(/\/+$/, '')}/api/telegram`, secret_token: secreto, allowed_updates: ['message', 'edited_message', 'callback_query'],
  });
  webhookRevisado = true;
  return Boolean(r?.ok);
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
