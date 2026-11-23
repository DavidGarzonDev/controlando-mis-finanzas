import App from '@/components/App';
import * as db from '@/lib/datos';
import { generarConsejos } from '@/lib/consejos';
import { asegurarEsquema } from '@/lib/esquema';
import { exigirSesionPagina } from '@/lib/guardia';
import { hoyEnColombia, mesClave } from '@/lib/fechas';
import { retos as cargarRetos } from '@/lib/retos';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await asegurarEsquema();
  await exigirSesionPagina();
  const mes = db.mesValido((await searchParams).mes);
  const esActual = mes === mesClave();
  if (esActual) await db.registrarPatrimonio().catch(() => {});

  const [categoriasPropias, prestamos] = await Promise.all([db.categoriasPropias(), db.prestamos()]);
  const [resumen, gastos, ingresos, deudas, fijos, porDia, historial, movCredito, cuentas, metas, transferencias, hormiga, suscripciones, patrimonio, meses, retos] =
    await Promise.all([
      db.resumen(mes),
      db.gastosDelMes(mes),
      db.ingresosDelMes(mes),
      db.deudas(mes),
      db.fijos(mes),
      db.gastosPorDia(mes),
      db.historial(6, mes),
      db.movimientosCredito(),
      db.cuentas(),
      db.metas(mes),
      db.transferenciasDelMes(mes),
      db.gastosHormiga(mes),
      db.suscripciones(),
      db.historialPatrimonio(180),
      db.mesesConDatos(),
      cargarRetos(),
    ]);

  return (
    <App
      mes={mes}
      meses={meses}
      categorias={categoriasPropias}
      prestamos={prestamos}
      resumen={resumen}
      gastos={gastos}
      ingresos={ingresos}
      deudas={deudas}
      fijos={fijos}
      porDia={porDia}
      historial={historial}
      movCredito={movCredito}
      cuentas={cuentas}
      metas={metas}
      transferencias={transferencias}
      hormiga={hormiga}
      suscripciones={suscripciones}
      patrimonio={patrimonio}
      retos={retos}
      consejos={generarConsejos(resumen, deudas, fijos, { metas, hormiga, suscripciones })}
      hoy={hoyEnColombia()}
    />
  );
}
