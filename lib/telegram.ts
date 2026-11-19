export async function enviarMensaje(chatId: number | string, texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('Telegram sendMessage falló', res.status, await res.text());
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
