'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CADA = 20_000; // cada cuánto pregunta si hubo cambios (con la pestaña a la vista)
const INACTIVO = 10 * 60_000; // después de 10 min sin tocar nada deja de preguntar (ahorra la base gratis)

/**
 * Mantiene el dashboard al día sin recargar: si registras algo desde Telegram (o en otro dispositivo),
 * la página se actualiza sola. No guarda nada; solo compara una "huella" de los datos.
 * Se pausa con la pestaña escondida o si llevas un rato sin usarla, y revisa apenas vuelves.
 */
export function Sincronizar() {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const ultimoUso = useRef(Date.now());
  const revisando = useRef(false);

  useEffect(() => {
    let cancelado = false;

    async function revisar() {
      if (revisando.current || document.visibilityState !== 'visible') return;
      revisando.current = true;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (res.status === 401) {
          // La sesión venció (o la cerraron desde Telegram): a la entrada
          window.location.href = '/entrar';
          return;
        }
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (cancelado) return;
        if (version.current && v !== version.current) router.refresh();
        version.current = v;
      } catch {
        /* sin conexión: se intenta en la próxima vuelta */
      } finally {
        revisando.current = false;
      }
    }

    const tic = setInterval(() => {
      if (Date.now() - ultimoUso.current < INACTIVO) revisar();
    }, CADA);
    const usar = () => {
      const estabaQuieto = Date.now() - ultimoUso.current >= INACTIVO;
      ultimoUso.current = Date.now();
      if (estabaQuieto) revisar();
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        ultimoUso.current = Date.now();
        revisar();
      }
    };

    revisar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('pointerdown', usar, { passive: true });
    window.addEventListener('keydown', usar);
    window.addEventListener('scroll', usar, { passive: true });
    return () => {
      cancelado = true;
      clearInterval(tic);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('pointerdown', usar);
      window.removeEventListener('keydown', usar);
      window.removeEventListener('scroll', usar);
    };
  }, [router]);

  return null;
}
