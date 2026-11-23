'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Gasto, MesHistorial, Meta, PuntoPatrimonio, Resumen } from '@/lib/datos';
import { Contador } from './animacion';
import { confeti } from './Celebrar';
import { IconoCat } from './IconoCat';
import { colorCat, emojiCat, nombreMes, pesos } from './util';

export type Lamina = { id: string; fondo: string; eyebrow: string; titulo: React.ReactNode; texto?: React.ReactNode; extra?: React.ReactNode };
const DURACION = 5500;

/**
 * "Tu mes en Pilas": láminas tipo historias con lo más importante del mes
 * (cuánto gastaste, en qué, tu día más caro, tu mejor racha, lo que más repetiste y cómo cerraste).
 */
export function Historias({ mes, r, porDia, historial, gastos, metas, patrimonio, cerrar }: {
  mes: string; r: Resumen; porDia: number[]; historial: MesHistorial[]; gastos: Gasto[]; metas: Meta[]; patrimonio: PuntoPatrimonio[];
  cerrar: () => void;
}) {
  const nombre = nombreMes(Number(mes.slice(5)));

  const laminas = useMemo<Lamina[]>(() => {
    const dias = r.esActual ? Math.max(r.diaHoy, 1) : porDia.length;
    const anterior = historial.length >= 2 ? historial[historial.length - 2] : null;
    const cambio = anterior?.gastos ? (r.variables - anterior.gastos) / anterior.gastos : null;
    const top = r.porCategoria.filter((c) => c.categoria !== 'Ajuste')[0];
    const totalCats = r.porCategoria.reduce((s, c) => s + c.total, 0) || 1;
    // Día más caro
    let diaCaro = 0;
    porDia.slice(0, dias).forEach((v, d) => { if (v > (porDia[diaCaro] ?? 0)) diaCaro = d; });
    // Mejor racha: días seguidos sin pasar el ritmo que alcanza (o en $0 si no hay presupuesto)
    const limite = Math.max(0, r.ingresos - r.cuotas - r.fijos - r.extraAbonos - r.ahorro) / r.diasMes;
    let racha = 0;
    let mejor = 0;
    for (const v of porDia.slice(0, dias)) {
      racha = (limite > 0 ? v <= limite : v === 0) ? racha + 1 : 0;
      mejor = Math.max(mejor, racha);
    }
    // Lo que más repetiste
    const veces = new Map<string, { n: number; total: number; nombre: string }>();
    for (const g of gastos) {
      const k = g.concepto.trim().toLowerCase();
      const x = veces.get(k) ?? { n: 0, total: 0, nombre: g.concepto };
      veces.set(k, { ...x, n: x.n + 1, total: x.total + g.monto });
    }
    const repetido = [...veces.values()].sort((a, b) => b.n - a.n || b.total - a.total)[0];
    // Deudas: cómo cambiaron en el mes (según la foto diaria)
    const delMes = patrimonio.filter((p) => p.fecha.startsWith(mes));
    const bajaDeuda = delMes.length >= 2 ? delMes[0].deudas - delMes[delMes.length - 1].deudas : 0;
    const metasCumplidas = metas.filter((m) => m.objetivo > 0 && m.ahorrado >= m.objetivo).length;

    const l: Lamina[] = [
      {
        id: 'intro', fondo: 'l-azul', eyebrow: 'Pilas', titulo: <>Tu {nombre}<br />en Pilas</>,
        texto: r.esActual ? `Así va tu mes, hasta el día ${r.diaHoy}.` : 'Así te fue este mes. Toca para seguir.',
      },
      {
        id: 'gasto', fondo: 'l-violeta', eyebrow: 'Gastaste en el día a día',
        titulo: <span className="num"><Contador valor={r.variables} /></span>,
        texto: cambio === null ? `En ${gastos.length} movimientos.` : Math.abs(cambio) < 0.05 ? 'Casi lo mismo que el mes pasado.' : cambio > 0 ? `${Math.round(cambio * 100)} % más que el mes pasado.` : `${Math.round(-cambio * 100)} % menos que el mes pasado. ¡Bien ahí!`,
      },
    ];
    if (top) {
      l.push({
        id: 'cat', fondo: 'l-noche', eyebrow: 'En lo que más gastaste',
        titulo: <span className="lamina-cat" style={{ '--c': colorCat(top.categoria) } as React.CSSProperties}>
          <span className="lamina-cat-ico">{emojiCat(top.categoria) ?? <IconoCat c={top.categoria} size={40} />}</span>{top.categoria}
        </span>,
        texto: <><b className="num">{pesos(top.total)}</b> · el {Math.round((top.total / totalCats) * 100)} % de todo</>,
        extra: (
          <span className="lamina-barras">
            {r.porCategoria.filter((c) => c.categoria !== 'Ajuste').slice(0, 5).map((c) => (
              <span key={c.categoria}><i style={{ width: `${(c.total / top.total) * 100}%`, background: colorCat(c.categoria) }} /><small>{c.categoria}</small></span>
            ))}
          </span>
        ),
      });
    }
    if (porDia[diaCaro]) {
      l.push({
        id: 'dia', fondo: 'l-rojo', eyebrow: 'Tu día más caro',
        titulo: <>{diaCaro + 1} de {nombre}</>,
        texto: <>Gastaste <b className="num">{pesos(porDia[diaCaro])}</b> ese día.</>,
      });
    }
    l.push({
      id: 'racha', fondo: 'l-ambar', eyebrow: 'Tu mejor racha',
      titulo: <>{mejor} {mejor === 1 ? 'día' : 'días'} 🔥</>,
      texto: limite > 0 ? `Seguidos sin pasarte de ${pesos(limite)} al día.` : 'Seguidos sin gastar.',
    });
    if (repetido && repetido.n >= 2) {
      l.push({
        id: 'rep', fondo: 'l-verde', eyebrow: 'Lo que más repetiste',
        titulo: <>{repetido.nombre} ×{repetido.n}</>,
        texto: <>En total <b className="num">{pesos(repetido.total)}</b>.</>,
      });
    }
    l.push({
      id: 'cierre', fondo: 'l-azul', eyebrow: r.esActual ? 'Hasta hoy' : 'Cerraste el mes',
      titulo: <>Entró <span className="num">{pesos(r.ingresos)}</span></>,
      texto: (
        <>
          {r.ahorro > 0 && <>Ahorraste <b className="num">{pesos(r.ahorro)}</b>. </>}
          {bajaDeuda > 0 && <>Bajaste tus deudas <b className="num">{pesos(bajaDeuda)}</b>. </>}
          {metasCumplidas > 0 && <>Cumpliste {metasCumplidas} {metasCumplidas === 1 ? 'meta' : 'metas'}. </>}
          {r.disponible >= 0 ? 'Vas con las cuentas claras. ¡Pilas que vamos bien!' : 'El próximo mes lo cuadramos mejor. ¡Pilas!'}
        </>
      ),
    });
    return l;
  }, [mes, nombre, r, porDia, historial, gastos, metas, patrimonio]);

  return <ReproductorHistorias laminas={laminas} titulo={`Tu ${nombre} en Pilas`} cerrar={cerrar} />;
}

/** Reproduce láminas tipo historias: avanzan solas, se tocan a los lados y se pausan manteniendo el dedo. */
export function ReproductorHistorias({ laminas, titulo, cerrar }: { laminas: Lamina[]; titulo: string; cerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Avanza sola; se pausa mientras mantienes el dedo
  useEffect(() => {
    if (pausa) return;
    const t = setTimeout(() => {
      if (i < laminas.length - 1) setI(i + 1);
    }, DURACION);
    return () => clearTimeout(t);
  }, [i, pausa, laminas.length]);
  useEffect(() => {
    if (i === laminas.length - 1) confeti();
  }, [i, laminas.length]);

  const ir = (d: number) => setI((x) => Math.max(0, Math.min(laminas.length - 1, x + d)));
  const l = laminas[i];

  return (
    <dialog
      ref={ref}
      className="historias"
      aria-label={titulo}
      onClose={cerrar}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') ir(1); if (e.key === 'ArrowLeft') ir(-1); }}
    >
      <div className={`lamina ${l.fondo}`} key={l.id}>
        <div className="historias-barras" aria-hidden>
          {laminas.map((x, k) => (
            <span key={x.id}><i className={k < i ? 'llena' : k === i ? (pausa ? 'activa pausa' : 'activa') : ''} style={{ animationDuration: `${DURACION}ms` }} /></span>
          ))}
        </div>
        <button className="historias-cerrar" aria-label="Cerrar" onClick={() => ref.current?.close()}><X size={22} aria-hidden /></button>

        <div className="lamina-cuerpo" aria-live="polite">
          <p className="lamina-eyebrow">{l.eyebrow}</p>
          <h2 className="lamina-titulo">{l.titulo}</h2>
          {l.texto && <p className="lamina-texto">{l.texto}</p>}
          {l.extra}
        </div>

        {/* Zonas para tocar: izquierda atrás, derecha adelante; mantener pausa */}
        <button className="historias-zona izq" aria-label="Anterior" onClick={() => ir(-1)}
          onPointerDown={() => setPausa(true)} onPointerUp={() => setPausa(false)} onPointerLeave={() => setPausa(false)}>
          <ChevronLeft size={28} aria-hidden />
        </button>
        <button className="historias-zona der" aria-label="Siguiente" onClick={() => (i === laminas.length - 1 ? ref.current?.close() : ir(1))}
          onPointerDown={() => setPausa(true)} onPointerUp={() => setPausa(false)} onPointerLeave={() => setPausa(false)}>
          <ChevronRight size={28} aria-hidden />
        </button>
      </div>
    </dialog>
  );
}
