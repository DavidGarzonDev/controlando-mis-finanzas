'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { mesCorto, mesCortoDe, pesos, pesosCorto } from './util';
import type { MesHistorial } from '@/lib/datos';

const usarLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Ancho real del contenedor, para dibujar el SVG en píxeles (el texto no se deforma). */
function useAncho<T extends HTMLElement>(inicial = 640) {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(inicial);
  usarLayout(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    setAncho(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Escala "bonita" para el eje Y: 3 líneas en múltiplos redondos. */
function escala(max: number) {
  if (max <= 0) return { tope: 100_000, paso: 50_000 };
  const crudo = max / 3;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= crudo) ?? 10 * mag;
  return { tope: paso * Math.ceil(max / paso), paso };
}

// ---------------------------------------------------------------------------
// Curva del mes: gasto acumulado contra el ritmo que te alcanza

export function CurvaMes({ porDia, diaHoy, presupuestoMes }: { porDia: number[]; diaHoy: number; presupuestoMes: number }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const dias = porDia.length;
  const acumulado: number[] = [];
  porDia.reduce((s, v, i) => ((acumulado[i] = s + v), s + v), 0);
  const ideal = (d: number) => (presupuestoMes * d) / dias;
  const max = Math.max(presupuestoMes, acumulado[Math.min(diaHoy, dias) - 1] ?? 0, 1);
  const { tope, paso } = escala(max * 1.05);

  const alto = 200;
  const m = { t: 12, r: 12, b: 26, l: 58 };
  const w = Math.max(ancho - m.l - m.r, 10);
  const h = alto - m.t - m.b;
  const x = (d: number) => m.l + ((d - 1) / Math.max(dias - 1, 1)) * w;
  const y = (v: number) => m.t + h - (v / tope) * h;

  const hasta = Math.min(diaHoy, dias);
  const puntos = acumulado.slice(0, hasta).map((v, i) => `${x(i + 1)},${y(v)}`);
  const linea = `M${puntos.join('L')}`;
  const area = `${linea}L${x(hasta)},${y(0)}L${x(1)},${y(0)}Z`;
  const lineas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const marcas = [1, 8, 15, 22, dias].filter((d, i, a) => a.indexOf(d) === i && (d === dias || dias - d > 3));

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const d = Math.round(((e.clientX - r.left - m.l) / w) * (dias - 1)) + 1;
    setFoco(Math.min(Math.max(d, 1), hasta));
  }

  const f = foco ?? null;
  const pasado = f !== null && presupuestoMes > 0 && acumulado[f - 1] > ideal(f);

  return (
    <div className="grafica" ref={ref}>
      <svg
        width={ancho}
        height={alto}
        role="img"
        aria-label={`Gasto acumulado del mes: ${pesos(acumulado[hasta - 1] ?? 0)} al día ${hasta}${presupuestoMes > 0 ? `, de ${pesos(presupuestoMes)} disponibles para el mes` : ''}`}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        {lineas.map((v) => (
          <g key={v}>
            <line className="grid" x1={m.l} x2={m.l + w} y1={y(v)} y2={y(v)} />
            <text className="eje" x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">{v === 0 ? '$0' : pesosCorto(v)}</text>
          </g>
        ))}
        {marcas.map((d) => (
          <text key={d} className="eje" x={x(d)} y={alto - 6} textAnchor="middle">{d}</text>
        ))}
        {presupuestoMes > 0 && (
          <line className="ideal" x1={x(1)} y1={y(ideal(1))} x2={x(dias)} y2={y(presupuestoMes)} />
        )}
        {hasta > 0 && (
          <>
            <path className="area" d={area} />
            <path className="real" d={linea} pathLength={1} />
            <circle className="punto" cx={x(hasta)} cy={y(acumulado[hasta - 1])} r={4.5} />
          </>
        )}
        {f !== null && (
          <g className="mira">
            <line x1={x(f)} x2={x(f)} y1={m.t} y2={m.t + h} />
            <circle className="punto" cx={x(f)} cy={y(acumulado[f - 1])} r={4.5} />
          </g>
        )}
      </svg>
      {f !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(f), 90), ancho - 90) }}>
          <b>Día {f}</b>
          <span>Ese día: {pesos(porDia[f - 1])}</span>
          <span>Acumulado: {pesos(acumulado[f - 1])}</span>
          {presupuestoMes > 0 && (
            <span className={pasado ? 'neg' : ''}>Ritmo que alcanza: {pesos(ideal(f))}</span>
          )}
        </div>
      )}
      <div className="leyenda" aria-hidden>
        <span><i className="sw real" /> Lo que llevas gastado</span>
        {presupuestoMes > 0 && <span><i className="sw ideal" /> Ritmo para que alcance</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendario del mes: cada día pintado según cuánto gastaste

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function Calendario({ porDia, anio, mes, diaHoy, limite }: {
  porDia: number[]; anio: number; mes: number; diaHoy: number; limite: number;
}) {
  const primero = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const max = Math.max(...porDia, limite, 1);
  const nivel = (v: number) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  return (
    <div className="calendario">
      <div className="cal-grid" role="grid" aria-label={`Gastos por día de ${mesCortoDe(mes)}`}>
        {DIAS_SEMANA.map((d, i) => (
          <span key={i} className="cal-cab" aria-hidden>{d}</span>
        ))}
        {Array.from({ length: primero }, (_, i) => <span key={`v${i}`} aria-hidden />)}
        {porDia.map((v, i) => {
          const d = i + 1;
          const futuro = d > diaHoy;
          const pasado = limite > 0 && v > limite;
          return (
            <span
              key={d}
              role="gridcell"
              tabIndex={futuro ? -1 : 0}
              className={`cal-dia n${futuro ? 'f' : nivel(v)}${d === diaHoy ? ' hoy' : ''}${pasado ? ' sobre' : ''}`}
              aria-label={`${d} de ${mesCortoDe(mes)}: ${futuro ? 'aún no llega' : pesos(v)}${pasado ? ', por encima del límite diario' : ''}`}
              data-tip={futuro ? undefined : `${d} ${mesCortoDe(mes)} · ${pesos(v)}`}
            >
              {d}
            </span>
          );
        })}
      </div>
      <div className="cal-escala" aria-hidden>
        <span>Menos</span>
        {[0, 1, 2, 3, 4, 5].map((k) => <i key={k} className={`cal-dia n${k}`} />)}
        <span>Más</span>
        {limite > 0 && <span className="cal-sobre-ley"><i className="cal-dia n3 sobre" /> pasó el límite del día</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Últimos meses: ingresos contra gastos registrados

export function BarrasHistorial({ historial }: { historial: MesHistorial[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>(320);
  const [foco, setFoco] = useState<number | null>(null);
  const id = useId();
  const max = Math.max(...historial.flatMap((h) => [h.ingresos, h.gastos]), 1);
  const { tope, paso } = escala(max * 1.05);
  const alto = 180;
  const m = { t: 10, r: 4, b: 24, l: 52 };
  const w = Math.max(ancho - m.l - m.r, 10);
  const h = alto - m.t - m.b;
  const grupo = w / historial.length;
  const barra = Math.min(16, (grupo - 14) / 2);
  const y = (v: number) => m.t + h - (v / tope) * h;
  const lineas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const sel = foco !== null ? historial[foco] : null;

  /** Barra con la punta de arriba redondeada y la base recta, apoyada en el eje. */
  const pathBarra = (x0: number, v: number) => {
    const top = y(v);
    const base = y(0);
    const r = Math.min(4, barra / 2, base - top);
    if (base - top < 0.5) return '';
    return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barra - r}Q${x0 + barra},${top} ${x0 + barra},${top + r}V${base}Z`;
  };

  return (
    <div className="grafica" ref={ref}>
      <svg width={ancho} height={alto} role="img" aria-labelledby={id}>
        <title id={id}>
          {historial.map((x) => `${mesCorto(x.mes)}: ingresos ${pesos(x.ingresos)}, gastos ${pesos(x.gastos)}`).join('. ')}
        </title>
        {lineas.map((v) => (
          <g key={v}>
            <line className="grid" x1={m.l} x2={m.l + w} y1={y(v)} y2={y(v)} />
            <text className="eje" x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">{v === 0 ? '$0' : pesosCorto(v)}</text>
          </g>
        ))}
        {historial.map((x, i) => {
          const cx = m.l + grupo * i + grupo / 2;
          return (
            <g key={x.mes} onPointerEnter={() => setFoco(i)} onPointerLeave={() => setFoco(null)}>
              <rect className="hit" x={m.l + grupo * i} y={m.t} width={grupo} height={h} />
              {foco === i && <rect className="hover-col" x={m.l + grupo * i + 2} y={m.t} width={grupo - 4} height={h} rx={6} />}
              <path className="b-ing" d={pathBarra(cx - barra - 1, x.ingresos)} />
              <path className="b-gas" d={pathBarra(cx + 1, x.gastos)} />
              <text className="eje" x={cx} y={alto - 6} textAnchor="middle">{mesCorto(x.mes)}</text>
            </g>
          );
        })}
      </svg>
      {sel && foco !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(m.l + grupo * foco + grupo / 2, 90), ancho - 90) }}>
          <b>{mesCorto(sel.mes)} {sel.mes.slice(0, 4)}</b>
          <span><i className="sw b-ing" /> Ingresos: {pesos(sel.ingresos)}</span>
          <span><i className="sw b-gas" /> Gastos: {pesos(sel.gastos)}</span>
        </div>
      )}
      <div className="leyenda" aria-hidden>
        <span><i className="sw b-ing" /> Ingresos</span>
        <span><i className="sw b-gas" /> Gastos del día a día</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patrimonio en el tiempo: lo que tienes menos lo que debes

export function CurvaPatrimonio({ puntos }: { puntos: { fecha: string; activos: number; deudas: number }[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const valores = puntos.map((p) => p.activos - p.deudas);
  const min = Math.min(0, ...valores);
  const max = Math.max(0, ...valores);
  const { paso } = escala(Math.max(Math.abs(min), Math.abs(max)) * 1.1 || 100_000);
  const bajo = Math.floor(min / paso) * paso;
  const alto = Math.ceil(max / paso) * paso || paso;

  const altoSvg = 170;
  const m = { t: 10, r: 10, b: 24, l: 64 };
  const w = Math.max(ancho - m.l - m.r, 10);
  const h = altoSvg - m.t - m.b;
  const x = (i: number) => m.l + (puntos.length > 1 ? (i / (puntos.length - 1)) * w : w / 2);
  const y = (v: number) => m.t + h - ((v - bajo) / (alto - bajo || 1)) * h;
  const linea = `M${valores.map((v, i) => `${x(i)},${y(v)}`).join('L')}`;
  const area = `${linea}L${x(valores.length - 1)},${y(Math.max(bajo, 0))}L${x(0)},${y(Math.max(bajo, 0))}Z`;
  const lineas: number[] = [];
  for (let v = bajo; v <= alto; v += paso) lineas.push(v);
  const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${mesCortoDe(Number(f.slice(5, 7)))}`;
  const etiquetas = [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const sel = foco !== null ? puntos[foco] : null;

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - m.l) / w) * (puntos.length - 1));
    setFoco(Math.min(Math.max(i, 0), puntos.length - 1));
  }

  return (
    <div className="grafica" ref={ref}>
      <svg width={ancho} height={altoSvg} role="img" aria-label={`Patrimonio: ${pesos(valores[valores.length - 1] ?? 0)} hoy`} onPointerMove={mover} onPointerLeave={() => setFoco(null)}>
        {lineas.map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'grid cero' : 'grid'} x1={m.l} x2={m.l + w} y1={y(v)} y2={y(v)} />
            <text className="eje" x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">{v === 0 ? '$0' : pesosCorto(v)}</text>
          </g>
        ))}
        {etiquetas.map((i) => (
          <text key={i} className="eje" x={x(i)} y={altoSvg - 6} textAnchor={i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle'}>{fechaCorta(puntos[i].fecha)}</text>
        ))}
        <path className="area" d={area} />
        <path className="real" d={linea} pathLength={1} />
        <circle className="punto" cx={x(valores.length - 1)} cy={y(valores[valores.length - 1])} r={4.5} />
        {foco !== null && (
          <g className="mira">
            <line x1={x(foco)} x2={x(foco)} y1={m.t} y2={m.t + h} />
            <circle className="punto" cx={x(foco)} cy={y(valores[foco])} r={4.5} />
          </g>
        )}
      </svg>
      {sel && foco !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(foco), 90), ancho - 90) }}>
          <b>{fechaCorta(sel.fecha)}</b>
          <span>Tienes: {pesos(sel.activos)}</span>
          <span>Debes: {pesos(sel.deudas)}</span>
          <span>Patrimonio: {pesos(sel.activos - sel.deudas)}</span>
        </div>
      )}
    </div>
  );
}
