'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Moon, SunMedium, SunMoon } from 'lucide-react';

type Tema = 'auto' | 'light' | 'dark';
const SIGUIENTE: Record<Tema, Tema> = { auto: 'light', light: 'dark', dark: 'auto' };
const NOMBRE: Record<Tema, string> = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };
const ICONO = { auto: SunMoon, light: SunMedium, dark: Moon };

/** Botón que alterna el tema: automático (el del celular) → claro → oscuro. Se recuerda en este navegador. */
export function BotonTema({ avisar }: { avisar: (m: string) => void }) {
  const [tema, setTema] = useState<Tema>('auto');

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') setTema(t);
  }, []);

  function cambiar() {
    const nuevo = SIGUIENTE[tema];
    setTema(nuevo);
    const raiz = document.documentElement;
    const aplicar = () => {
      if (nuevo === 'auto') delete raiz.dataset.theme;
      else raiz.dataset.theme = nuevo;
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(aplicar);
    else aplicar();
    try {
      if (nuevo === 'auto') localStorage.removeItem('tema');
      else localStorage.setItem('tema', nuevo);
    } catch {
      /* sin almacenamiento: el tema dura hasta recargar */
    }
    avisar(`Tema: ${NOMBRE[nuevo]}`);
  }

  const Icono = ICONO[tema];
  return (
    <button className="btn icono-tema" onClick={cambiar} aria-label={`Tema: ${NOMBRE[tema]}. Toca para cambiar`} title={`Tema: ${NOMBRE[tema]}`}>
      <Icono size={20} aria-hidden />
      <span>{NOMBRE[tema]}</span>
    </button>
  );
}

/**
 * Modo privado: oculta (desenfoca) las cifras con un toque, para abrir la app en la calle o en el trabajo.
 * Se recuerda en este navegador.
 */
export function BotonPrivado({ avisar }: { avisar: (m: string) => void }) {
  const [privado, setPrivado] = useState(false);
  useEffect(() => setPrivado(document.documentElement.dataset.privado === '1'), []);
  function cambiar() {
    const nuevo = !privado;
    setPrivado(nuevo);
    if (nuevo) document.documentElement.dataset.privado = '1';
    else delete document.documentElement.dataset.privado;
    try {
      if (nuevo) localStorage.setItem('privado', '1');
      else localStorage.removeItem('privado');
    } catch {
      /* sin almacenamiento */
    }
    avisar(nuevo ? 'Montos ocultos' : 'Montos visibles');
  }
  return (
    <button className="btn icono-tema privado" onClick={cambiar} aria-pressed={privado} aria-label={privado ? 'Mostrar montos' : 'Ocultar montos'} title={privado ? 'Mostrar montos' : 'Ocultar montos'}>
      {privado ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
    </button>
  );
}
