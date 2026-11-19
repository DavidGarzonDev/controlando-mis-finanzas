'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { X } from 'lucide-react';
import { borrar, guardarAjuste, guardarCuenta, guardarDeuda, guardarFijo, guardarGasto, guardarIngreso, registrarAbono, registrarCompra } from '@/app/actions';
import { BANCOS, FRANQUICIAS } from '@/lib/bancos';
import { CATEGORIAS } from '@/lib/categorias';
import type { Cuenta, Deuda, Fijo, Gasto, Ingreso, TipoCredito } from '@/lib/datos';
import { COLOR_CAT, ICONO_CAT, pesos } from './util';

export type Editor =
  | { tipo: 'nuevo'; modo: Modo }
  | { tipo: 'gasto'; item: Gasto }
  | { tipo: 'ingreso'; item: Ingreso }
  | { tipo: 'deuda'; item?: Deuda; nuevoTipo?: TipoCredito }
  | { tipo: 'fijo'; item?: Fijo }
  | { tipo: 'abono'; item: Deuda }
  | { tipo: 'compra'; item: Deuda }
  | { tipo: 'cuenta'; item?: Cuenta };

type Modo = 'gasto' | 'ingreso' | 'ajuste';

const FUENTES = ['Quincena', 'Efectivo', 'Trabajo extra', 'Venta', 'Me enviaron', 'Préstamo'];

export function Modal({ editor, cerrar, avisar }: { editor: Editor; cerrar: () => void; avisar: (msg: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [modo, setModo] = useState<Modo>(editor.tipo === 'nuevo' ? editor.modo : 'gasto');
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const tipo = editor.tipo === 'nuevo' ? modo : editor.tipo;
  const item = 'item' in editor ? (editor.item as (Gasto & Ingreso & Deuda & Fijo & Cuenta) | undefined) : undefined;
  const esEdicion = editor.tipo !== 'nuevo' && editor.tipo !== 'abono' && editor.tipo !== 'compra' && !!item?.id;
  const [tipoCredito, setTipoCredito] = useState<TipoCredito>(item?.tipo ?? (editor.tipo === 'deuda' ? editor.nuevoTipo : undefined) ?? 'tarjeta');

  const titulo = {
    gasto: esEdicion ? 'Editar gasto' : 'Registrar',
    ingreso: esEdicion ? 'Editar ingreso' : 'Registrar',
    deuda: esEdicion ? `Editar ${item?.nombre ?? 'crédito'}` : tipoCredito === 'tarjeta' ? 'Nueva tarjeta de crédito' : 'Nuevo crédito',
    compra: `Compra con ${item?.nombre ?? 'tarjeta'}`,
    cuenta: esEdicion ? `Editar ${item?.nombre ?? 'cuenta'}` : 'Nueva cuenta o tarjeta débito',
    fijo: esEdicion ? 'Editar gasto fijo' : 'Nuevo gasto fijo',
    abono: `Pagar ${item?.nombre ?? ''}`,
    ajuste: 'Registrar',
  }[tipo];

  const accion = { gasto: guardarGasto, ingreso: guardarIngreso, deuda: guardarDeuda, fijo: guardarFijo, abono: registrarAbono, ajuste: guardarAjuste, compra: registrarCompra, cuenta: guardarCuenta }[tipo];
  const mensaje = {
    gasto: esEdicion ? 'Gasto actualizado' : 'Gasto registrado',
    ingreso: esEdicion ? 'Ingreso actualizado' : 'Ingreso registrado',
    deuda: esEdicion ? 'Crédito actualizado' : 'Crédito agregado',
    compra: 'Compra registrada',
    cuenta: esEdicion ? 'Cuenta actualizada' : 'Cuenta agregada',
    fijo: esEdicion ? 'Gasto fijo actualizado' : 'Gasto fijo agregado',
    abono: 'Pago registrado',
    ajuste: 'Ajuste registrado',
  }[tipo];

  /** Al elegir el banco, pone su nombre si el campo está vacío o tenía otro banco. */
  function autoNombre(e: React.ChangeEvent<HTMLSelectElement>) {
    const input = e.currentTarget.form?.elements.namedItem('nombre') as HTMLInputElement | null;
    const banco = BANCOS.find((b) => b.id === e.currentTarget.value);
    if (!input || !banco || banco.id === 'otro') return;
    if (!input.value.trim() || BANCOS.some((b) => b.nombre === input.value.trim())) input.value = banco.nombre;
  }

  async function enviar(fd: FormData) {
    setError('');
    try {
      await accion(fd);
      avisar(mensaje);
      ref.current?.close();
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e inténtalo otra vez.');
    }
  }

  async function eliminar() {
    if (!confirmar) return setConfirmar(true);
    setBorrando(true);
    try {
      await borrar(tipo as 'gasto' | 'ingreso' | 'deuda' | 'fijo' | 'cuenta', item!.id);
      avisar('Eliminado');
      ref.current?.close();
    } catch {
      setBorrando(false);
      setError('No se pudo eliminar. Inténtalo otra vez.');
    }
  }

  const faltaCuota = tipo === 'abono' && item ? Math.max(0, Math.min(item.saldo, item.cuota - item.abonadoMes)) : 0;

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-titulo"
      {...({ closedby: 'any' } as object)}
      onClose={cerrar}
      // Respaldo para navegadores sin closedby: tocar fuera del cuadro lo cierra.
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!dentro) ref.current.close();
      }}
    >
      <form action={enviar} key={tipo}>
        <input type="hidden" name="id" defaultValue={item?.id ?? ''} />
        <header className="modal-cab">
          <h2 id="modal-titulo">{titulo}</h2>
          <button type="button" className="icono-btn" aria-label="Cerrar" onClick={() => ref.current?.close()}>
            <X size={20} aria-hidden />
          </button>
        </header>

        {editor.tipo === 'nuevo' && (
          <div className="segmento" role="radiogroup" aria-label="Tipo de movimiento">
            {(['gasto', 'ingreso', 'ajuste'] as const).map((m) => (
              <label key={m} className={modo === m ? 'on' : ''}>
                <input type="radio" name="_modo" value={m} checked={modo === m} onChange={() => setModo(m)} />
                {{ gasto: 'Gasto', ingreso: 'Ingreso', ajuste: 'Ajuste' }[m]}
              </label>
            ))}
          </div>
        )}

        {tipo === 'gasto' && (
          <>
            <Campo label="Monto"><Monto name="monto" defaultValue={item?.monto} autoFocus /></Campo>
            <Campo label="¿En qué?"><input name="concepto" required defaultValue={item?.concepto} placeholder="Almuerzo" autoComplete="off" /></Campo>
            {item?.categoria === 'Ajuste' ? (
              <input type="hidden" name="categoria" value="Ajuste" />
            ) : (
              <fieldset className="cats-sel">
                <legend>Categoría</legend>
                {CATEGORIAS.map((c) => {
                  const Icono = ICONO_CAT[c];
                  return (
                    <label key={c} style={{ '--c': COLOR_CAT[c] } as React.CSSProperties}>
                      <input type="radio" name="categoria" value={c} defaultChecked={(item?.categoria ?? 'Comida') === c} />
                      <span><Icono size={16} aria-hidden /> {c}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </>
        )}

        {tipo === 'ingreso' && <FormIngreso item={item} />}

        {tipo === 'ajuste' && <FormAjuste />}

        {tipo === 'fijo' && (
          <>
            <Campo label="¿Qué pagas cada mes?"><input name="concepto" required defaultValue={item?.concepto} placeholder="Gimnasio" autoFocus autoComplete="off" /></Campo>
            <Campo label="Monto al mes"><Monto name="monto" defaultValue={item?.monto} /></Campo>
          </>
        )}

        {tipo === 'deuda' && (
          <>
            <div className="segmento" role="radiogroup" aria-label="Tipo de crédito">
              {(['tarjeta', 'prestamo', 'otro'] as const).map((t) => (
                <label key={t} className={tipoCredito === t ? 'on' : ''}>
                  <input type="radio" name="tipo" value={t} checked={tipoCredito === t} onChange={() => setTipoCredito(t)} />
                  {{ tarjeta: 'Tarjeta', prestamo: 'Préstamo', otro: 'Otro' }[t]}
                </label>
              ))}
            </div>
            <div className="fila2">
              <Campo label={tipoCredito === 'tarjeta' ? 'Banco' : 'Entidad (opcional)'}>
                <select name="banco" defaultValue={item?.banco ?? (tipoCredito === 'tarjeta' ? 'bancolombia' : '')} onChange={autoNombre}>
                  {tipoCredito !== 'tarjeta' && <option value="">Ninguna</option>}
                  {BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Nombre" ayuda={tipoCredito === 'tarjeta' ? 'Como la llamas: “AV Villas”, “Nu”' : undefined}>
                <input name="nombre" required defaultValue={item?.nombre} placeholder={tipoCredito === 'tarjeta' ? 'AV Villas' : 'Addi'} autoComplete="off" />
              </Campo>
            </div>
            {tipoCredito === 'tarjeta' && (
              <div className="fila2">
                <Campo label="Franquicia">
                  <select name="franquicia" defaultValue={item?.franquicia ?? 'Visa'}>
                    {FRANQUICIAS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </Campo>
                <Campo label="Últimos 4 dígitos" ayuda="Solo para reconocerla">
                  <input name="ultimos4" inputMode="numeric" maxLength={4} pattern="\d{0,4}" defaultValue={item?.ultimos4 ?? ''} placeholder="1234" autoComplete="off" />
                </Campo>
              </div>
            )}
            {tipoCredito === 'tarjeta' && (
              <Campo label="Cupo total"><Monto name="cupo" defaultValue={item?.cupo ?? undefined} opcional /></Campo>
            )}
            <div className="fila2">
              <Campo label={tipoCredito === 'tarjeta' ? 'Cupo usado (lo que debes)' : 'Saldo que debes'}><Monto name="saldo" defaultValue={item?.saldo} opcional /></Campo>
              <Campo label="Cuota al mes"><Monto name="cuota" defaultValue={item?.cuota} opcional /></Campo>
            </div>
            <div className="fila2">
              <Campo label="Tasa de interés" ayuda="Ej. 28% E.A. o 2,1% M.V.">
                <input name="tasa" defaultValue={item?.tasa ?? ''} placeholder="28% E.A." autoComplete="off" />
              </Campo>
              <Campo label="Prioridad" ayuda="1 = la que pagas primero">
                <input name="prioridad" type="number" min={1} inputMode="numeric" defaultValue={item?.prioridad && item.prioridad < 99 ? item.prioridad : ''} placeholder="1" />
              </Campo>
            </div>
          </>
        )}

        {tipo === 'compra' && item && <FormCompra />}

        {tipo === 'cuenta' && (
          <>
            <div className="fila2">
              <Campo label="Banco o billetera">
                <select name="banco" defaultValue={item?.banco ?? 'bancolombia'} onChange={autoNombre}>
                  {BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Nombre"><input name="nombre" required defaultValue={item?.nombre} placeholder="Ahorros Bancolombia" autoComplete="off" /></Campo>
            </div>
            <div className="fila2">
              <Campo label="Saldo actual"><Monto name="saldo" defaultValue={item?.saldo} opcional /></Campo>
              <Campo label="Últimos 4 dígitos" ayuda="Opcional">
                <input name="ultimos4" inputMode="numeric" maxLength={4} defaultValue={item?.ultimos4 ?? ''} placeholder="1234" autoComplete="off" />
              </Campo>
            </div>
            <p className="nota">El saldo lo actualizas tú cuando quieras (o desde Telegram: <code>/saldo nequi 250000</code>).</p>
          </>
        )}

        {tipo === 'abono' && item && (
          <>
            <p className="nota">
              Saldo actual <b className="num">{pesos(item.saldo)}</b>
              {faltaCuota > 0 ? <> · falta <b className="num">{pesos(faltaCuota)}</b> de la cuota de este mes</> : <> · la cuota de este mes ya está cubierta</>}
            </p>
            <Campo label="¿Cuánto abonaste?"><Monto name="monto" defaultValue={faltaCuota || undefined} autoFocus /></Campo>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="modal-acciones">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
          <Guardar texto={tipo === 'abono' ? 'Registrar abono' : 'Guardar'} />
        </div>
        {esEdicion && (
          <button type="button" className={confirmar ? 'btn peligro lleno' : 'btn peligro'} onClick={eliminar} disabled={borrando}>
            {borrando ? 'Eliminando…' : confirmar ? 'Toca otra vez para eliminar' : 'Eliminar'}
          </button>
        )}
      </form>
    </dialog>
  );
}

function FormIngreso({ item }: { item?: Ingreso }) {
  const [concepto, setConcepto] = useState(item?.concepto ?? '');
  return (
    <>
      <Campo label="Monto"><Monto name="monto" defaultValue={item?.monto} autoFocus /></Campo>
      <Campo label="¿De dónde viene?">
        <input name="concepto" required value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Quincena" autoComplete="off" />
      </Campo>
      <div className="sugerencias" aria-label="Sugerencias">
        {FUENTES.map((f) => (
          <button type="button" key={f} className={concepto === f ? 'chip on' : 'chip'} onClick={() => setConcepto(f)}>{f}</button>
        ))}
      </div>
    </>
  );
}

function FormCompra() {
  const [cuotas, setCuotas] = useState(1);
  return (
    <>
      <Campo label="Monto"><Monto name="monto" autoFocus /></Campo>
      <Campo label="¿Qué compraste?"><input name="concepto" placeholder="Tenis" autoComplete="off" /></Campo>
      <fieldset className="cats-sel">
        <legend>¿A cuántas cuotas?</legend>
        {[1, 3, 6, 12, 24, 36].map((n) => (
          <label key={n} style={{ '--c': 'var(--azul)' } as React.CSSProperties}>
            <input type="radio" name="cuotas" value={n} checked={cuotas === n} onChange={() => setCuotas(n)} />
            <span>{n === 1 ? '1 cuota' : `${n} cuotas`}</span>
          </label>
        ))}
      </fieldset>
      <p className="nota">Sube lo que debes en la tarjeta{cuotas > 1 ? ' y la cuota mensual' : ''}. No resta de tu plata del mes: sale cuando pagas la cuota.</p>
    </>
  );
}

function FormAjuste() {
  const [signo, setSigno] = useState<'menos' | 'mas'>('menos');
  return (
    <>
      <p className="nota">
        Úsalo cuando tu plata real no cuadra con lo registrado: algo que se te olvidó anotar o plata que apareció.
      </p>
      <div className="segmento" role="radiogroup" aria-label="Tipo de ajuste">
        {(['menos', 'mas'] as const).map((v) => (
          <label key={v} className={signo === v ? 'on' : ''}>
            <input type="radio" name="signo" value={v} checked={signo === v} onChange={() => setSigno(v)} />
            {v === 'menos' ? '− Me falta plata' : '+ Me sobra plata'}
          </label>
        ))}
      </div>
      <Campo label={signo === 'menos' ? '¿Cuánto falta?' : '¿Cuánto sobra?'}><Monto name="monto" autoFocus /></Campo>
      <Campo label="Nota (opcional)">
        <input name="nota" placeholder={signo === 'menos' ? 'No sé en qué se fue' : 'Encontré en el bolsillo'} autoComplete="off" />
      </Campo>
    </>
  );
}

function Guardar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primario crece" disabled={pending}>
      {pending ? 'Guardando…' : texto}
    </button>
  );
}

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="campo">
      <span>{label}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

/** Campo de dinero que pone los puntos de miles mientras escribes. */
function Monto({ name, defaultValue, autoFocus, opcional }: { name: string; defaultValue?: number; autoFocus?: boolean; opcional?: boolean }) {
  const [v, setV] = useState(defaultValue ? Math.round(defaultValue).toLocaleString('es-CO') : '');
  return (
    <div className="monto">
      <span aria-hidden>$</span>
      <input
        name={name}
        inputMode="numeric"
        required={!opcional}
        autoFocus={autoFocus}
        autoComplete="off"
        value={v}
        placeholder="0"
        pattern={opcional ? undefined : '[0-9.]*[1-9][0-9.]*'}
        title="Escribe un monto mayor que cero"
        onChange={(e) => {
          const solo = e.target.value.replace(/\D/g, '').slice(0, 12);
          setV(solo ? Number(solo).toLocaleString('es-CO') : '');
        }}
      />
    </div>
  );
}
