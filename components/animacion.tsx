'use client';

import { useEffect, useRef, useState } from 'react';
import { pesos } from './util';

// Momento en que cargó la página: solo en el primer segundo y medio las cifras cuentan desde 0.
const CARGA = typeof performance !== 'undefined' ? performance.now() : 0;

const reducido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Un monto en pesos que "cuenta" hasta su valor cuando aparece o cambia.
 * El HTML del servidor ya trae el valor final, así que sin JavaScript también se lee bien.
 */
export function Contador({ valor, formato = pesos, duracion = 900 }: { valor: number; formato?: (v: number) => string; duracion?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const previo = useRef<number | null>(null);

  useEffect(() => {
    // Al cambiar de pestaña no se vuelve a contar desde 0 (se veía como un parpadeo): solo si el valor cambia.
    const desde = previo.current ?? (performance.now() - CARGA < 1500 ? 0 : valor);
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
export function conTransicion(cambio: () => void, direccion: 'adelante' | 'atras' | null = null) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || reducido()) return cambio();
  const html = document.documentElement;
  if (direccion) html.dataset.vt = direccion;
  else delete html.dataset.vt;
  doc.startViewTransition(cambio).finished.finally(() => delete html.dataset.vt);
}
