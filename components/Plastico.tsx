'use client';

import { useId, useState } from 'react';
import { Nfc } from 'lucide-react';
import { bancoPorId, estiloTarjeta, logoBanco, sello, type Banco } from '@/lib/bancos';

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
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
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

/** La franquicia escrita como en el plástico (solo texto, sin logos). */
function Franquicia({ f }: { f: string | null }) {
  if (!f || f === 'Otra') return null;
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
  return (
    <span
      className={`tarjeta plastico${mini ? ' mini' : ''}${e.metal ? ' metal' : ''}`}
      onPointerMove={inclinar}
      onPointerLeave={soltar}
      style={{ '--t1': e.t1, '--t2': e.t2, '--tt': e.tt, '--ta': e.ta } as React.CSSProperties}
    >
      <span className="tarjeta-cab">
        <span className="tarjeta-marca">
          <SelloBanco b={b} chico={mini} />
          <span className="tarjeta-banco">{nombreBanco}</span>
        </span>
        {arriba ?? <Nfc size={mini ? 18 : 22} aria-hidden className="tarjeta-nfc-mini" />}
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
          <small>{clase === 'credito' ? 'CRÉDITO' : 'DÉBITO'}{mini && d.ultimos4 ? ` · ${d.ultimos4}` : ''}</small>
          <span className="tarjeta-nombre">{d.nombre || nombreBanco}</span>
        </span>
        <Franquicia f={d.franquicia} />
      </span>
    </span>
  );
}
