import { asegurarEsquema } from '@/lib/esquema';
import { haySesion } from '@/lib/guardia';
import { mesValido, movimientosParaExportar } from '@/lib/datos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Descarga los movimientos como CSV para Excel (separado por ; y con tildes bien). Protegido por la contraseña del dashboard. */
export async function GET(req: Request) {
  await asegurarEsquema();
  if (!(await haySesion())) return new Response('Sesión vencida. Vuelve a entrar.', { status: 401 });
  const url = new URL(req.url);
  const desde = mesValido(url.searchParams.get('desde'));
  const hasta = mesValido(url.searchParams.get('hasta') ?? desde);
  const filas = await movimientosParaExportar(desde, hasta);
  const celda = (v: string | number) => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [
    ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Monto', 'Cuenta'].join(';'),
    ...filas.map((f) => [f.fecha, f.tipo, f.concepto, f.categoria, f.monto, f.cuenta].map(celda).join(';')),
  ].join('\r\n');
  const nombre = desde === hasta ? `movimientos-${desde}.csv` : `movimientos-${desde}-a-${hasta}.csv`;
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` },
  });
}
