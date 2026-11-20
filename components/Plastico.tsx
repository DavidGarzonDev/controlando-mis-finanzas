'use client';

import { useEffect, useId, useState } from 'react';
import { Nfc } from 'lucide-react';
import { bancoPorId, disenoTarjeta, estiloTarjeta, logoBanco, sello, type Banco } from '@/lib/bancos';

/** Inclina la tarjeta siguiendo el dedo o el mouse, con un brillo que se mueve encima. */
function inclinar(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
  el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
}
function soltar(e: React.PointerEvent<HTMLElement>) {
  // Al soltar vuelve a seguir el giro del celular (si lo hay) o queda derecha.
  for (const v of ['--rx', '--ry', '--mx', '--my']) e.currentTarget.style.removeProperty(v);
}

/**
 * Inclina las tarjetas dentro de `raiz` con el giroscopio del celular (el brillo se mueve al girarlo).
 * En iPhone hay que pedir permiso con un toque: devuelve la función para pedirlo.
 */
export function useGiroscopio(raiz: React.RefObject<HTMLElement | null>) {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: coarse)').matches) return;
    let base: number | null = null;
    let cuadro = 0;
    const leer = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      base ??= e.beta;
      const beta = e.beta - base;
      const gamma = e.gamma;
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const el = raiz.current;
        if (!el) return;
        const lim = (v: number, m: number) => Math.max(-m, Math.min(m, v));
        el.style.setProperty('--grx', `${lim(-beta / 3, 9)}deg`);
        el.style.setProperty('--gry', `${lim(gamma / 3, 12)}deg`);
        el.style.setProperty('--gmx', `${50 + lim(gamma * 1.5, 50)}%`);
        el.style.setProperty('--gmy', `${30 + lim(beta * 1.5, 50)}%`);
      });
    };
    window.addEventListener('deviceorientation', leer);
    return () => { window.removeEventListener('deviceorientation', leer); cancelAnimationFrame(cuadro); };
  }, [raiz, activo]);

  return async () => {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (activo || !DOE?.requestPermission) return;
    try {
      if ((await DOE.requestPermission()) === 'granted') setActivo(true);
    } catch {
      /* el usuario dijo que no: las tarjetas quedan quietas */
    }
  };
}

/** El reverso de la tarjeta: banda magnética, firma y los datos que importan (cupo, corte, pago). */
export function Reverso({ d, filas }: { d: DatosPlastico; filas: { etiqueta: string; valor: string }[] }) {
  const e = estiloTarjeta(d.color, d.banco);
  return (
    <span className={`tarjeta plastico reverso-tarjeta${e.metal ? ' metal' : ''}`} style={{ '--t1': e.t1, '--t2': e.t2, '--tt': e.tt, '--ta': e.ta } as React.CSSProperties}>
      <span className="banda" aria-hidden />
      <span className="firma" aria-hidden><i>{d.nombre}</i><b>{d.ultimos4 ? `•••${d.ultimos4.slice(-3)}` : '•••'}</b></span>
      <span className="reverso-datos">
        {filas.map((f) => (
          <span key={f.etiqueta}><small>{f.etiqueta}</small><b className="num">{f.valor}</b></span>
        ))}
      </span>
      <span className="reverso-pie">Toca para voltear</span>
    </span>
  );
}

/** El logo del banco sobre una placa blanca; si no carga, sus iniciales. */
export function SelloBanco({ b, chico }: { b: Banco; chico?: boolean }) {
  const [falla, setFalla] = useState(false);
  const url = logoBanco(b);
  if (!url || falla) return <span className={`tarjeta-sello${chico ? ' chico' : ''}`} aria-hidden>{sello(b)}</span>;
  return (
    <span className={`tarjeta-sello logo${chico ? ' chico' : ''}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalla(true)} />
    </span>
  );
}

/** El chip EMV, dibujado con sus contactos. */
function Chip() {
  const id = useId();
  return (
    <svg className="plastico-chip" viewBox="0 0 46 34" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e3a6" />
          <stop offset="0.45" stopColor="#cfa851" />
          <stop offset="0.7" stopColor="#f2d88f" />
          <stop offset="1" stopColor="#b88c38" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="45" height="33" rx="6" fill={`url(#${id})`} stroke="rgb(0 0 0 / 0.25)" />
      <g fill="none" stroke="rgb(70 45 5 / 0.45)" strokeWidth="1">
        <path d="M0.5 11.5h12c2 0 3-1 3-3v-8M0.5 22.5h12c2 0 3 1 3 3v8M45.5 11.5h-12c-2 0-3-1-3-3v-8M45.5 22.5h-12c-2 0-3 1-3 3v8" />
        <rect x="15.5" y="8.5" width="15" height="17" rx="3" />
        <path d="M15.5 17h-15M30.5 17h15" />
      </g>
    </svg>
  );
}

/** Los dos círculos de Mastercard (rojo, amarillo y naranja donde se cruzan). */
function CirculosMastercard() {
  const id = useId();
  return (
    <svg className="plastico-franq f-master-circulos" viewBox="0 0 48 30" role="img" aria-label="Mastercard">
      <defs>
        <clipPath id={id}><circle cx="17" cy="15" r="13" /></clipPath>
      </defs>
      <circle cx="17" cy="15" r="13" fill="#eb001b" />
      <circle cx="31" cy="15" r="13" fill="#f79e1b" />
      <circle cx="31" cy="15" r="13" fill="#ff5f00" clipPath={`url(#${id})`} />
    </svg>
  );
}

/** La franquicia como se ve en el plástico. */
function Franquicia({ f }: { f: string | null }) {
  if (!f || f === 'Otra') return null;
  if (f === 'Mastercard') return <CirculosMastercard />;
  const clase = f === 'Visa' ? 'f-visa' : f === 'Mastercard' ? 'f-master' : f === 'American Express' ? 'f-amex' : 'f-diners';
  const texto = f === 'Mastercard' ? 'mastercard' : f === 'American Express' ? 'AMERICAN EXPRESS' : f === 'Diners' ? 'Diners Club' : 'VISA';
  return <span className={`plastico-franq ${clase}`}>{texto}</span>;
}

export type DatosPlastico = {
  banco: string | null;
  nombre: string;
  franquicia: string | null;
  ultimos4: string | null;
  color: string | null;
};

/**
 * Una tarjeta (débito o crédito) dibujada como el plástico real.
 * `arriba` va en la esquina superior derecha (ej. cupo disponible) y `centro` reemplaza al número (ej. saldo).
 */
export function Plastico({ d, clase, arriba, centro, mini }: {
  d: DatosPlastico; clase: 'credito' | 'debito'; arriba?: React.ReactNode; centro?: React.ReactNode; mini?: boolean;
}) {
  const b = bancoPorId(d.banco);
  const e = estiloTarjeta(d.color, d.banco);
  const nombreBanco = d.banco && d.banco !== 'otro' ? b.nombre : d.nombre || 'Tarjeta';
  const esEfectivo = d.banco === 'efectivo';
  // El efectivo es un billete, no una tarjeta: sin chip, sin franquicia, sin número.
  const diseno = esEfectivo ? 'd-efectivo' : d.color ? null : disenoTarjeta(d.banco, clase);
  return (
    <span
      className={`tarjeta plastico${mini ? ' mini' : ''}${e.metal ? ' metal' : ''}${diseno ? ` diseno ${diseno}` : ''}`}
      onPointerMove={inclinar}
      onPointerLeave={soltar}
      style={{ '--t1': e.t1, '--t2': e.t2, '--tt': e.tt, '--ta': e.ta } as React.CSSProperties}
    >
      <span className="tarjeta-cab">
        <span className="tarjeta-marca">
          <SelloBanco b={b} chico={mini} />
          <span className="tarjeta-banco">{nombreBanco}</span>
        </span>
        {arriba ?? (esEfectivo ? null : <Nfc size={mini ? 18 : 22} aria-hidden className="tarjeta-nfc-mini" />)}
      </span>

      {centro ? (
        centro
      ) : (
        <>
          <span className="tarjeta-medio" aria-hidden>
            <Chip />
            {arriba && <Nfc className="tarjeta-nfc" size={22} />}
          </span>
          <span className="tarjeta-numero num" aria-label={d.ultimos4 ? `Termina en ${d.ultimos4}` : undefined}>
            •••• •••• •••• {d.ultimos4 || '••••'}
          </span>
        </>
      )}

      <span className="tarjeta-pie">
        <span className="tarjeta-titular">
          <small>{esEfectivo ? 'EN LA BILLETERA' : clase === 'credito' ? 'CRÉDITO' : 'DÉBITO'}{!esEfectivo && mini && d.ultimos4 ? ` · ${d.ultimos4}` : ''}</small>
          <span className="tarjeta-nombre">{d.nombre || nombreBanco}</span>
        </span>
        {esEfectivo ? <span className="billete-signo" aria-hidden>$</span> : <Franquicia f={d.franquicia} />}
      </span>
    </span>
  );
}
