import { sql } from '@/lib/db';
import { asegurarEsquema } from '@/lib/esquema';
import { haySesion } from '@/lib/guardia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Una "huella" de tus datos. La página la consulta de vez en cuando (solo con la pestaña a la vista):
 * si cambió (por ejemplo, registraste algo desde Telegram), se actualiza sola sin recargar.
 * Es una sola consulta pequeña: conteos y sumas de las tablas que se ven en el dashboard.
 */
export async function GET() {
  if (!(await haySesion())) return new Response('Sesión vencida', { status: 401 });
  await asegurarEsquema();
  const [r] = await sql().query(`SELECT md5(concat_ws('|',
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) || ':' || COALESCE(max(id), 0) || ':' || COALESCE(sum(hashtext(categoria || concepto || COALESCE(cuenta_id, 0))), 0) FROM gastos),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) || ':' || COALESCE(max(id), 0) || ':' || COALESCE(sum(hashtext(concepto || COALESCE(cuenta_id, 0))), 0) FROM ingresos),
      (SELECT count(*) || ':' || COALESCE(sum(saldo), 0) || ':' || COALESCE(max(actualizado)::text, '') FROM cuentas),
      (SELECT count(*) || ':' || COALESCE(sum(saldo), 0) || ':' || COALESCE(sum(cuota), 0) FROM deudas),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM transferencias),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM abonos),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM compras_credito),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM fijos),
      (SELECT count(*) FROM pagos_fijos),
      (SELECT count(*) FROM cuotas_marcadas),
      (SELECT count(*) || ':' || COALESCE(sum(objetivo), 0) FROM metas),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM aportes_meta),
      (SELECT count(*) || ':' || COALESCE(sum(monto), 0) FROM presupuestos),
      (SELECT count(*) || ':' || COALESCE(sum(hashtext(estado)), 0) FROM retos),
      (SELECT count(*) || ':' || COALESCE(sum(pendiente), 0) FROM prestamos)
    )) AS v`);
  return Response.json({ v: String(r?.v ?? '') }, { headers: { 'Cache-Control': 'no-store' } });
}
