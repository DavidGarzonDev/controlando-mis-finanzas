import { asegurarEsquema } from '@/lib/esquema';
import { marcarSemana, registrarPatrimonio } from '@/lib/datos';
import { enviarResumenSemanal } from '@/lib/semanal';
import { enviarPush, sinHtml } from '@/lib/push';
import { marcarEnviado, mensajeDelDia } from '@/lib/recordatorios';
import { enviarMensaje } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // Domingo: resumen de la semana con imagen (una vez por semana)
  const domingo = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short' }).format(new Date()) === 'Sun';
  let semanal = false;
  if (chat && domingo) {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    if (await marcarSemana(hoy)) {
      semanal = await enviarResumenSemanal(chat);
      await enviarPush({ titulo: 'Tu semana en Pilas', cuerpo: 'Ya está tu resumen de la semana. Míralo en Telegram.', etiqueta: 'semana' });
    }
  }

  const mensaje = await mensajeDelDia();
  if (!chat || !mensaje) return Response.json({ enviado: false, semanal, motivo: !chat ? 'sin TELEGRAM_CHAT_ID' : 'nada que avisar' });
  if (!(await marcarEnviado())) return Response.json({ enviado: false, motivo: 'ya se envió hoy' });

  await enviarMensaje(chat, mensaje);
  await enviarPush({ titulo: 'Pilas · tu día', cuerpo: sinHtml(mensaje), url: '/', etiqueta: 'dia' });
  return Response.json({ enviado: true, semanal });
}
