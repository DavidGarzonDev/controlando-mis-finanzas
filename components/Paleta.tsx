'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardList, CornerDownLeft, Download, Gauge, LayoutDashboard,
  LogOut, MessageSquareText, PiggyBank, Sparkles, Plus, Search, Target, WalletCards,
} from 'lucide-react';
import { registrarTexto, tocarBoton } from '@/app/actions';
import { salir } from '@/app/entrar/acciones';
import type { Editor } from './Modal';

type Tab = 'resumen' | 'movimientos' | 'billetera' | 'plan';
type Opcion = { id: string; titulo: string; detalle?: string; Icono: typeof Search; hacer: () => void };

/**
 * Paleta rápida (Ctrl+K o el buscador): escribe como en el bot ("almuerzo 15 mil con nu")
 * o salta a cualquier sección o acción.
 */
export function Paleta({ abierta, cerrar, ir, abrir, mes, verAnio }: {
  abierta: boolean; cerrar: () => void; ir: (t: Tab) => void; abrir: (e: Editor) => void; mes: string; verAnio: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [respuesta, setRespuesta] = useState<{ html: string; botones: { texto: string; dato: string }[][] } | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) {
      d.showModal();
      setQ('');
      setRespuesta(null);
      setSel(0);
      requestAnimationFrame(() => entrada.current?.focus());
    } else if (!abierta && d.open) d.close();
  }, [abierta]);

  const conNumero = /\d/.test(q);
  const opciones: Opcion[] = useMemo(() => {
    const todas: Opcion[] = [
      { id: 'resumen', titulo: 'Ir a Resumen', Icono: LayoutDashboard, hacer: () => ir('resumen') },
      { id: 'movimientos', titulo: 'Ir a Movimientos', Icono: ArrowLeftRight, hacer: () => ir('movimientos') },
      { id: 'billetera', titulo: 'Ir a Billetera', detalle: 'Cuentas, tarjetas y préstamos', Icono: WalletCards, hacer: () => ir('billetera') },
      { id: 'plan', titulo: 'Ir a Plan', detalle: 'Metas, topes, retos y fijos', Icono: ClipboardList, hacer: () => ir('plan') },
      { id: 'gasto', titulo: 'Nuevo gasto', Icono: Plus, hacer: () => abrir({ tipo: 'nuevo', modo: 'gasto' }) },
      { id: 'ingreso', titulo: 'Nuevo ingreso', Icono: Plus, hacer: () => abrir({ tipo: 'nuevo', modo: 'ingreso' }) },
      { id: 'mover', titulo: 'Mover plata entre cuentas', Icono: ArrowLeftRight, hacer: () => abrir({ tipo: 'transferir', modo: 'transferir' }) },
      { id: 'retirar', titulo: 'Retirar a efectivo', Icono: ArrowUpFromLine, hacer: () => abrir({ tipo: 'transferir', modo: 'retiro' }) },
      { id: 'consignar', titulo: 'Consignar efectivo', Icono: ArrowDownToLine, hacer: () => abrir({ tipo: 'transferir', modo: 'consignacion' }) },
      { id: 'meta', titulo: 'Nueva meta de ahorro', Icono: Target, hacer: () => abrir({ tipo: 'meta' }) },
      { id: 'topes', titulo: 'Poner topes por categoría', Icono: Gauge, hacer: () => abrir({ tipo: 'topes' }) },
      { id: 'tarjeta', titulo: 'Agregar tarjeta de crédito', Icono: WalletCards, hacer: () => abrir({ tipo: 'deuda', nuevoTipo: 'tarjeta' }) },
      { id: 'cuenta', titulo: 'Agregar cuenta o efectivo', Icono: PiggyBank, hacer: () => abrir({ tipo: 'cuenta' }) },
      { id: 'excel', titulo: 'Descargar movimientos en Excel', Icono: Download, hacer: () => { window.location.href = `/api/exportar?desde=${mes}`; } },
      { id: 'anio', titulo: 'Tu año en Pilas', detalle: 'El resumen del año en historias', Icono: Sparkles, hacer: verAnio },
      { id: 'salir', titulo: 'Cerrar sesión', detalle: 'Para volver a entrar necesitas clave y código', Icono: LogOut, hacer: () => { void salir(); } },
    ];
    const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const filtradas = t ? todas.filter((o) => `${o.titulo} ${o.detalle ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)) : todas;
    const bot: Opcion[] = q.trim()
      ? [{
          id: 'bot', titulo: conNumero ? `Registrar «${q.trim()}»` : `Preguntarle al bot «${q.trim()}»`,
          detalle: 'Igual que escribirle en Telegram', Icono: MessageSquareText, hacer: () => enviar(q.trim()),
        }]
      : [];
    return conNumero ? [...bot, ...filtradas] : [...filtradas, ...bot];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mes]);

  function enviar(texto: string) {
    iniciar(async () => {
      const r = await registrarTexto(texto);
      setRespuesta(r);
    });
  }

  function elegir(o: Opcion) {
    if (o.id === 'bot') return o.hacer();
    cerrar();
    o.hacer();
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, opciones.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && opciones[sel]) { e.preventDefault(); elegir(opciones[sel]); }
  }

  return (
    <dialog ref={ref} className="paleta" aria-label="Buscar o registrar" onClose={cerrar} {...({ closedby: 'any' } as object)}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="paleta-caja">
        <label className="paleta-entrada">
          <Search size={20} aria-hidden />
          <input
            ref={entrada}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); setRespuesta(null); }}
            onKeyDown={tecla}
            placeholder="Escribe un gasto (almuerzo 15 mil con nu) o busca…"
            aria-label="Buscar o registrar"
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </label>

        {respuesta ? (
          <div className="paleta-respuesta" aria-live="polite">
            {/* El texto viene del bot (escapado en el servidor); solo usa <b> y <code>. */}
            <p dangerouslySetInnerHTML={{ __html: respuesta.html.replace(/\n/g, '<br/>') }} />
            {respuesta.botones.length > 0 && (
              <div className="paleta-botones">
                {respuesta.botones.flat().map((b) => (
                  <button key={b.dato} className="chip" disabled={pendiente}
                    onClick={() => iniciar(async () => {
                      const r = await tocarBoton(b.dato);
                      setRespuesta(r);
                    })}>
                    {b.texto}
                  </button>
                ))}
              </div>
            )}
            <div className="paleta-acciones">
              <button className="btn chico" onClick={() => { setQ(''); setRespuesta(null); entrada.current?.focus(); }}>Registrar otro</button>
              <button className="btn chico primario" onClick={cerrar}>Listo</button>
            </div>
          </div>
        ) : (
          <ul className="paleta-lista" role="listbox" aria-label="Opciones">
            {opciones.map((o, i) => (
              <li key={o.id} role="option" aria-selected={i === sel}>
                <button className={i === sel ? 'paleta-op on' : 'paleta-op'} onMouseEnter={() => setSel(i)} onClick={() => elegir(o)} disabled={pendiente && o.id === 'bot'}>
                  <span className="paleta-ico"><o.Icono size={18} aria-hidden /></span>
                  <span className="paleta-txt"><b>{pendiente && o.id === 'bot' ? 'Registrando…' : o.titulo}</b>{o.detalle && <small>{o.detalle}</small>}</span>
                  {i === sel && <CornerDownLeft size={16} aria-hidden className="paleta-enter" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
