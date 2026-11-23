'use client';

import { useEffect, useState } from 'react';
import { datosAnio } from '@/app/actions';
import type { Anio } from '@/lib/datos';
import { Contador } from './animacion';
import { IconoCat } from './IconoCat';
import { ReproductorHistorias, type Lamina } from './Historias';
import { colorCat, emojiCat, nombreMes, pesos } from './util';

/** "Tu año en Pilas": el resumen del año en historias (como el del mes, pero de todo el año). */
export function AnioEnPilas({ anio, cerrar }: { anio: number; cerrar: () => void }) {
  const [d, setD] = useState<Anio | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    datosAnio(anio).then(setD).catch(() => setError(true));
  }, [anio]);

  useEffect(() => {
    if (error) cerrar();
  }, [error, cerrar]);
  if (error) return null;
  if (!d) return <div className="historias-cargando" aria-busy="true"><span className="girando" /> Armando tu {anio}…</div>;
  return <ReproductorHistorias laminas={laminasDe(d)} titulo={`Tu ${anio} en Pilas`} cerrar={cerrar} />;
}

function laminasDe(d: Anio): Lamina[] {
  const conGastos = d.porMes.filter((m) => m.gastos > 0);
  const promedio = conGastos.length ? d.gastos / conGastos.length : 0;
  const caro = [...conGastos].sort((a, b) => b.gastos - a.gastos)[0];
  const juicioso = [...conGastos].sort((a, b) => a.gastos - b.gastos)[0];
  const top = d.categorias[0];
  const max = Math.max(...d.porMes.map((m) => m.gastos), 1);
  const bajoDeuda = d.deudaInicio !== null && d.deudaFin !== null ? d.deudaInicio - d.deudaFin : 0;
  const fecha = (f: string) => `${Number(f.slice(8))} de ${nombreMes(Number(f.slice(5, 7)))}`;

  const l: Lamina[] = [
    { id: 'intro', fondo: 'l-azul', eyebrow: 'Pilas', titulo: <>Tu {d.anio}<br />en Pilas</>, texto: `${d.movimientos} gastos registrados en ${d.diasConGasto} días. Toca para ver cómo te fue.` },
    {
      id: 'total', fondo: 'l-violeta', eyebrow: 'En todo el año gastaste',
      titulo: <span className="num"><Contador valor={d.gastos} /></span>,
      texto: <>Unos <b className="num">{pesos(promedio)}</b> al mes. Te entraron <b className="num">{pesos(d.ingresos)}</b>.</>,
      extra: (
        <span className="lamina-meses" aria-hidden>
          {d.porMes.map((m) => (
            <span key={m.mes}><i style={{ height: `${Math.max(4, (m.gastos / max) * 100)}%` }} /><small>{nombreMes(m.mes).slice(0, 1).toUpperCase()}</small></span>
          ))}
        </span>
      ),
    },
  ];
  if (top) {
    l.push({
      id: 'cat', fondo: 'l-noche', eyebrow: 'Tu categoría del año',
      titulo: <span className="lamina-cat"><span className="lamina-cat-ico">{emojiCat(top.categoria) ?? <IconoCat c={top.categoria} size={40} />}</span>{top.categoria}</span>,
      texto: <><b className="num">{pesos(top.total)}</b> · el {Math.round((top.total / Math.max(d.gastos, 1)) * 100)} % de todo</>,
      extra: (
        <span className="lamina-barras">
          {d.categorias.slice(0, 5).map((c) => (
            <span key={c.categoria}><i style={{ width: `${(c.total / top.total) * 100}%`, background: colorCat(c.categoria) }} /><small>{c.categoria} · {pesos(c.total)}</small></span>
          ))}
        </span>
      ),
    });
  }
  if (caro && juicioso && caro.mes !== juicioso.mes) {
    l.push({
      id: 'meses', fondo: 'l-rojo', eyebrow: 'Tu mes más caro',
      titulo: <>{nombreMes(caro.mes)}</>,
      texto: <>Gastaste <b className="num">{pesos(caro.gastos)}</b>. El más juicioso fue <b>{nombreMes(juicioso.mes)}</b>, con <b className="num">{pesos(juicioso.gastos)}</b>.</>,
    });
  }
  if (d.repetidos[0]) {
    const r = d.repetidos[0];
    l.push({
      id: 'rep', fondo: 'l-verde', eyebrow: 'Lo que más repetiste',
      titulo: <>{r.concepto} ×{r.veces}</>,
      texto: <>En total <b className="num">{pesos(r.total)}</b>.{d.repetidos[1] ? <> Le siguen {d.repetidos.slice(1, 3).map((x) => `${x.concepto} (×${x.veces})`).join(' y ')}.</> : null}</>,
    });
  }
  if (d.diaMasCaro) {
    l.push({ id: 'dia', fondo: 'l-ambar', eyebrow: 'Tu día más caro', titulo: <>{fecha(d.diaMasCaro.fecha)}</>, texto: <>Ese día se fueron <b className="num">{pesos(d.diaMasCaro.total)}</b>.</> });
  }
  l.push({
    id: 'cierre', fondo: 'l-azul', eyebrow: 'Así cierras el año',
    titulo: <>{d.ingresos >= d.gastos ? 'Con las cuentas claras' : 'Con aprendizajes'}</>,
    texto: (
      <>
        {d.ahorro > 0 && <>Ahorraste <b className="num">{pesos(d.ahorro)}</b> en tus metas. </>}
        {bajoDeuda > 0 && <>Bajaste tus deudas <b className="num">{pesos(bajoDeuda)}</b>. </>}
        {d.ingresos >= d.gastos ? '¡Pilas que vamos bien para el próximo año!' : 'El próximo año lo cuadramos mejor. ¡Pilas!'}
      </>
    ),
  });
  return l;
}
