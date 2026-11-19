'use client';

import { useEffect, useRef, useState } from 'react';
import { pesos } from './util';

const reducido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Un monto en pesos que "cuenta" hasta su valor cuando aparece o cambia.
 * El HTML del servidor ya trae el valor final, así que sin JavaScript también se lee bien.
 */
export function Contador({ valor, formato = pesos, duracion = 900 }: { valor: number; formato?: (v: number) => string; duracion?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const previo = useRef<number | null>(null);

  useEffect(() => {
    const desde = previo.current ?? 0;
    previo.current = valor;
    if (reducido() || desde === valor) {
      setMostrado(valor);
      return;
    }
    let raf = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min((t - inicio) / duracion, 1);
      const suave = 1 - Math.pow(2, -10 * p); // ease-out exponencial
      setMostrado(desde + (valor - desde) * (p === 1 ? 1 : suave));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracion]);

  return <>{formato(Math.round(mostrado))}</>;
}

/** Cambia de vista con una transición suave donde el navegador la soporte. */
export function conTransicion(cambio: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reducido()) return cambio();
  doc.startViewTransition(cambio);
}
