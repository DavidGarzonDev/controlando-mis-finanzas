import { procesarNotificacion } from '@/lib/automatico';
import { tokenValido } from '@/lib/datos';
import { asegurarEsquema } from '@/lib/esquema';
import { huella } from '@/lib/sesion';
import { enviarMensaje } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Registro automático: el celular (Atajo de iPhone, MacroDroid o Tasker) manda aquí el texto
 * de la notificación del banco. Protegido con una llave que creas en Pilas (Plan → Conexiones).
 *
 *   POST /api/registro
 *   Authorization: Bearer <tu llave>
 *   { "texto": "Pagaste $15.000 en D1 SAS", "app": "Nequi" }
 *
 * También acepta texto plano en el cuerpo, o ?texto=… para probar.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const llave = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-pilas-llave') || url.searchParams.get('llave') || '';
  if (llave.length < 20) return Response.json({ ok: false, error: 'Falta la llave' }, { status: 401 });
  await asegurarEsquema();
  if (!(await tokenValido(await huella(`api:${llave}`)))) return Response.json({ ok: false, error: 'Llave inválida' }, { status: 401 });

  let texto = url.searchParams.get('texto') ?? '';
  let app: string | null = url.searchParams.get('app');
  const tipo = req.headers.get('content-type') ?? '';
  try {
    if (tipo.includes('json')) {
      const b = await req.json();
      texto = String(b.texto ?? b.text ?? b.notificacion ?? b.mensaje ?? b.body ?? texto);
      app = b.app ? String(b.app) : app;
    } else if (tipo.includes('form')) {
      const f = await req.formData();
      texto = String(f.get('texto') ?? f.get('text') ?? texto);
      app = f.get('app') ? String(f.get('app')) : app;
    } else {
      texto = (await req.text()) || texto;
    }
  } catch {
    /* cuerpo mal formado: se usa lo que venga en la URL */
  }
  texto = texto.slice(0, 1000);
  if (!texto.trim()) return Response.json({ ok: false, error: 'Falta el texto' }, { status: 400 });

  const r = await procesarNotificacion(texto, app);
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (chat) {
    if (r.ok) {
      if (typeof r.respuesta === 'string') await enviarMensaje(chat, r.respuesta);
      else await enviarMensaje(chat, r.respuesta.texto, r.respuesta.botones);
    } else if (r.respuesta) {
      await enviarMensaje(chat, r.respuesta);
    }
  }
  return Response.json(r.ok ? { ok: true, registrado: r.resumen } : { ok: false, motivo: r.motivo });
}
