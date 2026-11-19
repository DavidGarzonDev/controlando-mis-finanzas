import App from '@/components/App';
import * as db from '@/lib/datos';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [resumen, gastos, ingresos, deudas, fijos] = await Promise.all([
    db.resumen(),
    db.gastosDelMes(),
    db.ingresosDelMes(),
    db.deudas(),
    db.fijos(),
  ]);
  return <App resumen={resumen} gastos={gastos} ingresos={ingresos} deudas={deudas} fijos={fijos} />;
}
