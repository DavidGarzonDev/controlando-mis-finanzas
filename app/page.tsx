import App from '@/components/App';
import * as db from '@/lib/datos';
import { generarConsejos } from '@/lib/consejos';
import { asegurarEsquema } from '@/lib/esquema';
import { hoyEnColombia } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await asegurarEsquema();
  const [resumen, gastos, ingresos, deudas, fijos, porDia, historial, movCredito, cuentas] = await Promise.all([
    db.resumen(),
    db.gastosDelMes(),
    db.ingresosDelMes(),
    db.deudas(),
    db.fijos(),
    db.gastosPorDia(),
    db.historial(6),
    db.movimientosCredito(),
    db.cuentas(),
  ]);
  const hoy = hoyEnColombia();
  return (
    <App
      resumen={resumen}
      gastos={gastos}
      ingresos={ingresos}
      deudas={deudas}
      fijos={fijos}
      porDia={porDia}
      historial={historial}
      movCredito={movCredito}
      cuentas={cuentas}
      consejos={generarConsejos(resumen, deudas, fijos)}
      hoy={hoy}
    />
  );
}
