import { asegurarEsquema } from '@/lib/esquema';
import { registrarPatrimonio } from '@/lib/datos';
import { marcarEnviado, mensajeDelDia } from '@/lib/recordatorios';
import { enviarMensaje } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Lo llama Vercel una vez al día (vercel.json → crons) con "Authorization: Bearer CRON_SECRET".
 * Guarda la foto del patrimonio y te escribe por Telegram si hay pagos que vencen, corte de tarjeta o quincena.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 });
  }
  await asegurarEsquema();
  await registrarPatrimonio();

  const chat = process.env.TELEGRAM_CHAT_ID;
  const mensaje = await mensajeDelDia();
  if (!chat || !mensaje) return Response.json({ enviado: false, motivo: !chat ? 'sin TELEGRAM_CHAT_ID' : 'nada que avisar' });
  if (!(await marcarEnviado())) return Response.json({ enviado: false, motivo: 'ya se envió hoy' });

  await enviarMensaje(chat, mensaje);
  return Response.json({ enviado: true });
}
