'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Delete, Plus, X } from 'lucide-react';
import { crearCategoriaAccion } from '@/app/actions';
import { adivinarCategoria } from '@/lib/parser';
import { IconoCat } from './IconoCat';
import { agregarCategoriaLocal, colorCat, emojiCat, todasCategorias } from './util';

const FUENTES = ['Quincena', 'Efectivo', 'Trabajo extra', 'Venta', 'Me enviaron', 'Préstamo'];
const EMOJIS = ['🐶', '🎓', '💼', '🏋️', '🎮', '✈️', '🎁', '👶', '💇', '🚗', '📚', '☕', '💻', '⚽', '🎵', '🌱'];
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'borrar'] as const;

/**
 * Registrar como en una app de banco: el monto grande arriba, teclado numérico propio,
 * y abajo la categoría (con emoji) y la cuenta en un toque. Va dentro del <form> del modal.
 */
export function RegistroRapido({ modo, cuenta }: { modo: 'gasto' | 'ingreso'; cuenta: React.ReactNode }) {
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [cat, setCat] = useState('Comida');
  const [manual, setManual] = useState(false);
  const [cats, setCats] = useState<string[]>(() => todasCategorias());
  const [creando, setCreando] = useState(false);
  const [pulso, setPulso] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  function tecla(t: (typeof TECLAS)[number]) {
    navigator.vibrate?.(8);
    setPulso((p) => p + 1);
    setMonto((m) => {
      if (t === 'borrar') return m.slice(0, -1);
      const sig = (m + t).replace(/^0+/, '');
      return sig.length > 10 ? m : sig;
    });
  }

  // Teclado físico: números y borrar funcionan aunque el foco no esté en un campo de texto.
  useEffect(() => {
    const el = caja.current?.closest('dialog');
    if (!el) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'hidden' && (t as HTMLInputElement).type !== 'radio') return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); tecla(e.key as (typeof TECLAS)[number]); }
      else if (e.key === 'Backspace') { e.preventDefault(); tecla('borrar'); }
    };
    el.addEventListener('keydown', k);
    return () => el.removeEventListener('keydown', k);
  }, []);

  function escribirConcepto(v: string) {
    setConcepto(v);
    if (modo === 'gasto' && !manual) {
      const g = adivinarCategoria(v);
      if (g) setCat(g);
    }
  }

  const valor = Number(monto || 0);
  return (
    <div className="registro" ref={caja}>
      <input type="hidden" name="monto" value={monto} />
      <div className={`reg-monto ${valor ? '' : 'vacio'}`} aria-live="polite" aria-label={`Monto: ${valor.toLocaleString('es-CO')} pesos`}>
        <span className="reg-signo" aria-hidden>{modo === 'gasto' ? '−' : '+'}</span>
        <span className="reg-peso" aria-hidden>$</span>
        <b key={pulso} className="num">{valor ? valor.toLocaleString('es-CO') : '0'}</b>
      </div>

      <div className="teclado" role="group" aria-label="Teclado numérico">
        {TECLAS.map((t) => (
          <button type="button" key={t} className={`tecla ${t === 'borrar' ? 'tecla-borrar' : ''}`} onClick={() => tecla(t)}
            aria-label={t === 'borrar' ? 'Borrar último número' : t === '000' ? 'Tres ceros' : t}>
            {t === 'borrar' ? <Delete size={22} aria-hidden /> : t}
          </button>
        ))}
      </div>

      <label className="reg-concepto">
        <span className="sr">{modo === 'gasto' ? '¿En qué?' : '¿De dónde viene?'}</span>
        <input name="concepto" required value={concepto} onChange={(e) => escribirConcepto(e.target.value)}
          placeholder={modo === 'gasto' ? '¿En qué? Ej: almuerzo' : '¿De dónde viene? Ej: quincena'} autoComplete="off" />
      </label>

      {modo === 'ingreso' && (
        <div className="reg-chips" aria-label="Sugerencias">
          {FUENTES.map((f) => (
            <button type="button" key={f} className={concepto === f ? 'chip on' : 'chip'} onClick={() => setConcepto(f)}>{f}</button>
          ))}
        </div>
      )}

      {modo === 'gasto' && (
        <>
          <input type="hidden" name="categoria" value={cat} />
          <div className="reg-chips" role="radiogroup" aria-label="Categoría">
            {cats.map((c) => (
              <button type="button" role="radio" aria-checked={cat === c} key={c} className={cat === c ? 'reg-cat on' : 'reg-cat'}
                style={{ '--c': colorCat(c) } as React.CSSProperties} onClick={() => { setCat(c); setManual(true); }}>
                <span className="reg-cat-ico">{emojiCat(c) ? <span aria-hidden>{emojiCat(c)}</span> : <IconoCat c={c} />}</span>
                {c}
              </button>
            ))}
            <button type="button" className="reg-cat nueva" onClick={() => setCreando(true)} aria-expanded={creando}>
              <span className="reg-cat-ico"><Plus size={16} aria-hidden /></span> Nueva
            </button>
          </div>
          {creando && (
            <NuevaCategoria
              cerrar={() => setCreando(false)}
              creada={(c) => { setCats(todasCategorias()); setCat(c); setManual(true); setCreando(false); }}
            />
          )}
        </>
      )}

      {cuenta}
    </div>
  );
}

function NuevaCategoria({ cerrar, creada }: { cerrar: () => void; creada: (nombre: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="nueva-cat" role="group" aria-label="Nueva categoría">
      <div className="nueva-cat-cab">
        <b>Nueva categoría</b>
        <button type="button" className="icono-btn" aria-label="Cancelar" onClick={cerrar}><X size={18} aria-hidden /></button>
      </div>
      <div className="nueva-cat-fila">
        <span className="nueva-cat-emoji" aria-hidden>{emoji}</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mascotas, Universidad…" maxLength={24} autoFocus aria-label="Nombre" />
      </div>
      <div className="emojis" role="radiogroup" aria-label="Emoji">
        {EMOJIS.map((e) => (
          <button type="button" key={e} role="radio" aria-checked={emoji === e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn primario" disabled={pendiente || nombre.trim().length < 2}
        onClick={() => iniciar(async () => {
          const r = await crearCategoriaAccion(nombre, emoji);
          if (!r) return setError('Escribe un nombre de al menos 2 letras.');
          agregarCategoriaLocal(r);
          creada(r.nombre);
        })}>
        {pendiente ? 'Creando…' : 'Crear categoría'}
      </button>
    </div>
  );
}
