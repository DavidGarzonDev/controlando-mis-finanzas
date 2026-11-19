'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Banknote, X } from 'lucide-react';
import {
  aportarMeta, borrar, marcarCuota, guardarAjuste, guardarCuenta, guardarDeuda, guardarFijo, guardarGasto, guardarIngreso, guardarMeta, guardarTopes,
  registrarAbono, registrarCompra, transferir,
} from '@/app/actions';
import { ACABADOS, BANCOS, FRANQUICIAS, bancoPorId, estiloTarjeta } from '@/lib/bancos';
import { CATEGORIAS } from '@/lib/categorias';
import type { Cuenta, Deuda, Fijo, Gasto, Ingreso, Meta, Resumen, TipoCredito, Transferencia } from '@/lib/datos';
import { COLOR_CAT, ICONO_CAT, pesos } from './util';
import { Plastico, SelloBanco } from './Plastico';

export type Editor =
  | { tipo: 'nuevo'; modo: Modo }
  | { tipo: 'gasto'; item: Gasto }
  | { tipo: 'ingreso'; item: Ingreso }
  | { tipo: 'deuda'; item?: Deuda; nuevoTipo?: TipoCredito }
  | { tipo: 'fijo'; item?: Fijo }
  | { tipo: 'abono'; item: Deuda; capital?: number }
  | { tipo: 'compra'; item: Deuda }
  | { tipo: 'cuenta'; item?: Cuenta }
  | { tipo: 'topes' }
  | { tipo: 'meta'; item?: Meta }
  | { tipo: 'aporte'; item: Meta }
  | { tipo: 'transferir'; modo?: 'transferir' | 'retiro' | 'consignacion'; desde?: number }
  | { tipo: 'verTransferencia'; item: Transferencia; de: string; a: string };

type Modo = 'gasto' | 'ingreso' | 'ajuste';

const FUENTES = ['Quincena', 'Efectivo', 'Trabajo extra', 'Venta', 'Me enviaron', 'Préstamo'];

export function Modal({ editor, cuentas, metas, r, cerrar, avisar }: {
  editor: Editor; cuentas: Cuenta[]; metas: Meta[]; r: Resumen; cerrar: () => void; avisar: (msg: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [modo, setModo] = useState<Modo>(editor.tipo === 'nuevo' ? editor.modo : 'gasto');
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const tipo = editor.tipo === 'nuevo' ? modo : editor.tipo;
  const item = 'item' in editor ? (editor.item as (Gasto & Ingreso & Deuda & Fijo & Cuenta & Meta) | undefined) : undefined;
  const esEdicion = ['gasto', 'ingreso', 'deuda', 'fijo', 'cuenta', 'meta', 'verTransferencia'].includes(editor.tipo) && !!item?.id;
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
    topes: 'Topes del mes',
    meta: esEdicion ? `Editar ${item?.nombre ?? 'meta'}` : 'Nueva meta de ahorro',
    aporte: item?.nombre ?? 'Aportar',
    transferir: editor.tipo === 'transferir' && editor.modo === 'retiro' ? 'Retirar a efectivo' : editor.tipo === 'transferir' && editor.modo === 'consignacion' ? 'Consignar efectivo' : 'Mover plata entre cuentas',
    verTransferencia: 'Movimiento entre cuentas',
  }[tipo];

  const accion = { gasto: guardarGasto, ingreso: guardarIngreso, deuda: guardarDeuda, fijo: guardarFijo, abono: registrarAbono, ajuste: guardarAjuste, compra: registrarCompra, cuenta: guardarCuenta,
    topes: guardarTopes, meta: guardarMeta, aporte: aportarMeta, transferir, verTransferencia: async () => {} }[tipo];
  const mensaje = {
    gasto: esEdicion ? 'Gasto actualizado' : 'Gasto registrado',
    ingreso: esEdicion ? 'Ingreso actualizado' : 'Ingreso registrado',
    deuda: esEdicion ? 'Crédito actualizado' : 'Crédito agregado',
    compra: 'Compra registrada',
    cuenta: esEdicion ? 'Cuenta actualizada' : 'Cuenta agregada',
    fijo: esEdicion ? 'Gasto fijo actualizado' : 'Gasto fijo agregado',
    abono: 'Pago registrado',
    ajuste: 'Ajuste registrado',
    topes: 'Topes guardados',
    meta: esEdicion ? 'Meta actualizada' : 'Meta creada',
    aporte: 'Listo',
    transferir: 'Movimiento registrado',
    verTransferencia: '',
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
      await borrar((tipo === 'verTransferencia' ? 'transferencia' : tipo) as 'gasto' | 'ingreso' | 'deuda' | 'fijo' | 'cuenta' | 'meta' | 'transferencia', item!.id);
      avisar('Eliminado');
      ref.current?.close();
    } catch {
      setBorrando(false);
      setError('No se pudo eliminar. Inténtalo otra vez.');
    }
  }

  const faltaCuota = tipo === 'abono' && item ? item.faltaMes : 0;

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
            <SelectorCuenta cuentas={cuentas} etiqueta="¿Con qué pagaste?" defecto={item ? item.cuentaId ?? null : cuentas.find((c) => c.principal)?.id ?? null} />
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

        {tipo === 'ingreso' && (
          <>
            <FormIngreso item={item} />
            <SelectorCuenta cuentas={cuentas} etiqueta="¿A dónde entró?" defecto={item ? item.cuentaId ?? null : cuentas.find((c) => c.principal)?.id ?? null} />
          </>
        )}

        {tipo === 'ajuste' && (
          <>
            <FormAjuste />
            <SelectorCuenta cuentas={cuentas} etiqueta="¿En qué cuenta?" defecto={null} />
          </>
        )}

        {tipo === 'topes' && <FormTopes r={r} />}

        {tipo === 'meta' && (
          <>
            <Campo label="¿Para qué ahorras?"><input name="nombre" required defaultValue={item?.nombre} placeholder="Fondo de emergencia" autoFocus autoComplete="off" /></Campo>
            <div className="fila2">
              <Campo label="¿Cuánto necesitas?"><Monto name="objetivo" defaultValue={item?.objetivo} /></Campo>
              <Campo label="¿Para cuándo?" ayuda="Opcional">
                <input name="fecha_meta" type="date" defaultValue={item?.fechaMeta ?? ''} />
              </Campo>
            </div>
            <p className="nota">Consejo: un fondo de emergencia de 3 meses de gastos fijos te salva de endeudarte cuando algo se daña.</p>
          </>
        )}

        {tipo === 'aporte' && item && <FormAporte meta={item} />}

        {tipo === 'transferir' && editor.tipo === 'transferir' && (
          <FormTransferir cuentas={cuentas} modo={editor.modo ?? 'transferir'} desde={editor.desde} />
        )}

        {tipo === 'verTransferencia' && editor.tipo === 'verTransferencia' && (
          <p className="nota">
            <b className="num">{pesos(editor.item.monto)}</b> de <b>{editor.de}</b> a <b>{editor.a}</b>
            {editor.item.nota ? ` · ${editor.item.nota}` : ''}. Si lo eliminas, los saldos de las dos cuentas vuelven a como estaban.
          </p>
        )}

        {tipo === 'fijo' && (
          <>
            <Campo label="¿Qué pagas cada mes?"><input name="concepto" required defaultValue={item?.concepto} placeholder="Gimnasio" autoFocus autoComplete="off" /></Campo>
            <div className="fila2">
              <Campo label="Monto al mes"><Monto name="monto" defaultValue={item?.monto} /></Campo>
              <Campo label="Día de pago" ayuda="Te aviso un día antes">
                <input name="dia_pago" type="number" min={1} max={31} inputMode="numeric" defaultValue={item?.diaPago ?? ''} placeholder="5" />
              </Campo>
            </div>
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
            {tipoCredito === 'tarjeta' ? (
              <EditorPlastico clase="credito" item={item} />
            ) : (
              <div className="fila2">
                <Campo label="Entidad (opcional)">
                  <select name="banco" defaultValue={item?.banco ?? ''} onChange={autoNombre}>
                    <option value="">Ninguna</option>
                    {BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Nombre">
                  <input name="nombre" required defaultValue={item?.nombre} placeholder="Addi" autoComplete="off" />
                </Campo>
              </div>
            )}
            {tipoCredito === 'tarjeta' && (
              <Campo label="Cupo total"><Monto name="cupo" defaultValue={item?.cupo ?? undefined} opcional /></Campo>
            )}
            <div className="fila2">
              <Campo label={tipoCredito === 'tarjeta' ? 'Cupo usado (lo que debes)' : 'Saldo que debes'}><Monto name="saldo" defaultValue={item?.saldo} opcional /></Campo>
              <Campo label={tipoCredito === 'tarjeta' ? 'Cuota fija al mes' : 'Cuota al mes'} ayuda={tipoCredito === 'tarjeta' ? 'Sin contar compras nuevas: esas se suman solas' : undefined}>
                <Monto name="cuota" defaultValue={item?.cuotaBase ?? item?.cuota} opcional />
              </Campo>
            </div>
            <div className="fila2">
              <Campo label="Tasa de interés" ayuda="Ej. 28% E.A. o 2,1% M.V.">
                <input name="tasa" defaultValue={item?.tasa ?? ''} placeholder="28% E.A." autoComplete="off" />
              </Campo>
              <Campo label="Prioridad" ayuda="1 = la que pagas primero">
                <input name="prioridad" type="number" min={1} inputMode="numeric" defaultValue={item?.prioridad && item.prioridad < 99 ? item.prioridad : ''} placeholder="1" />
              </Campo>
            </div>
            <div className="fila2">
              <Campo label="Día de pago de la cuota" ayuda="Te aviso un día antes">
                <input name="dia_pago" type="number" min={1} max={31} inputMode="numeric" defaultValue={item?.diaPago ?? ''} placeholder="10" />
              </Campo>
              {tipoCredito === 'tarjeta' && (
                <Campo label="Día de corte" ayuda="Cuando cierra el extracto">
                  <input name="dia_corte" type="number" min={1} max={31} inputMode="numeric" defaultValue={item?.diaCorte ?? ''} placeholder="25" />
                </Campo>
              )}
            </div>
          </>
        )}

        {tipo === 'compra' && item && <FormCompra />}

        {tipo === 'cuenta' && (
          <>
            <EditorPlastico clase="debito" item={item} />
            <Campo label="Saldo actual"><Monto name="saldo" defaultValue={item?.saldo} opcional /></Campo>
            <label className="interruptor">
              <input type="checkbox" name="principal" defaultChecked={item?.principal ?? !cuentas.some((c) => c.principal)} />
              <span>
                <b>Cuenta principal</b>
                <small>Los gastos que registres sin decir de dónde salen se descuentan de esta cuenta.</small>
              </span>
            </label>
            <p className="nota">El saldo lo actualizas tú cuando quieras (o desde Telegram: <code>/saldo nequi 250000</code>).</p>
          </>
        )}

        {tipo === 'abono' && item && (
          <>
            <p className="nota">
              Saldo actual <b className="num">{pesos(item.saldo)}</b>
              {faltaCuota > 0 ? <> · falta <b className="num">{pesos(faltaCuota)}</b> de la cuota de este mes</> : <> · la cuota de este mes ya está cubierta</>}
            </p>
            {faltaCuota > 0 && (
              <button
                type="button"
                className="btn chico ya-pague"
                onClick={async () => {
                  await marcarCuota(item.id, true);
                  avisar(`Cuota de ${item.nombre} marcada como pagada`);
                  ref.current?.close();
                }}
              >
                Ya la pagué en el banco: solo marcarla como pagada
              </button>
            )}
            <FormAbono faltaCuota={faltaCuota} saldo={item.saldo} capital={editor.tipo === 'abono' ? editor.capital : undefined} />
            <SelectorCuenta cuentas={cuentas} etiqueta="¿De qué cuenta salió?" defecto={null} />
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="modal-acciones">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
          {tipo !== 'verTransferencia' && <Guardar texto={tipo === 'abono' ? 'Registrar pago' : tipo === 'aporte' ? 'Guardar' : 'Guardar'} />}
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

/**
 * Banco, nombre, franquicia, últimos 4 y color de una tarjeta, con la tarjeta en vivo arriba.
 * Sirve para débito y crédito.
 */
function EditorPlastico({ clase, item }: { clase: 'credito' | 'debito'; item?: Partial<Deuda & Cuenta> }) {
  const [banco, setBanco] = useState(item?.banco ?? 'bancolombia');
  const [nombre, setNombre] = useState(item?.nombre ?? bancoPorId(item?.banco ?? 'bancolombia').nombre);
  const [franquicia, setFranquicia] = useState(item?.franquicia ?? (clase === 'credito' ? 'Visa' : 'Mastercard'));
  const [ultimos4, setUltimos4] = useState(item?.ultimos4 ?? '');
  const [color, setColor] = useState(item?.color ?? 'banco');
  const libre = /^#[0-9a-f]{6}$/i.test(color);
  const delBanco = estiloTarjeta(null, banco);

  function cambiarBanco(id: string) {
    // El nombre sigue al banco mientras no lo hayas escrito tú.
    if (!nombre.trim() || BANCOS.some((b) => b.nombre === nombre.trim())) setNombre(id === 'otro' ? '' : bancoPorId(id).nombre);
    setBanco(id);
  }

  return (
    <>
      <div className="vista-previa" aria-hidden>
        <Plastico d={{ banco, nombre, franquicia, ultimos4: ultimos4 || null, color: color === 'banco' ? null : color }} clase={clase} />
      </div>
      <div className="fila2">
        <Campo label={clase === 'credito' ? 'Banco' : 'Banco o billetera'}>
          <select name="banco" value={banco} onChange={(e) => cambiarBanco(e.target.value)}>
            {BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Nombre" ayuda="Como la llamas en el bot">
          <input name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={clase === 'credito' ? 'AV Villas' : 'Ahorros Bancolombia'} autoComplete="off" />
        </Campo>
      </div>
      <fieldset className="opciones-franq">
        <legend>Franquicia</legend>
        {FRANQUICIAS.map((f) => (
          <label key={f}>
            <input type="radio" name="franquicia" value={f} checked={franquicia === f} onChange={() => setFranquicia(f)} />
            <span>{f}</span>
          </label>
        ))}
      </fieldset>
      <Campo label="Últimos 4 dígitos" ayuda="Opcional, solo para reconocerla">
        <input name="ultimos4" inputMode="numeric" maxLength={4} value={ultimos4} onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" autoComplete="off" />
      </Campo>
      <fieldset className="colores">
        <legend>Color de la tarjeta</legend>
        <input type="hidden" name="color" value={color} />
        <button type="button" className={color === 'banco' ? 'muestra on' : 'muestra'} aria-pressed={color === 'banco'} onClick={() => setColor('banco')}
          style={{ '--m1': delBanco.t1, '--m2': delBanco.t2 } as React.CSSProperties} title="Colores del banco">
          <span className="sr">Colores del banco</span>
        </button>
        {ACABADOS.map((a) => (
          <button type="button" key={a.id} className={`muestra${a.metal ? ' metal' : ''}${color === a.id ? ' on' : ''}`} aria-pressed={color === a.id} onClick={() => setColor(a.id)}
            style={{ '--m1': a.fondo[0], '--m2': a.fondo[1] } as React.CSSProperties} title={a.nombre}>
            <span className="sr">{a.nombre}</span>
          </button>
        ))}
        <label className={libre ? 'muestra libre on' : 'muestra libre'} title="Otro color" style={libre ? ({ '--m1': color, '--m2': color } as React.CSSProperties) : undefined}>
          <span className="sr">Elegir otro color</span>
          <input type="color" value={libre ? color : '#3d6bff'} onChange={(e) => setColor(e.target.value)} />
        </label>
        <small className="colores-nombre">
          {color === 'banco' ? `Colores de ${bancoPorId(banco).nombre}` : libre ? 'Color personalizado' : ACABADOS.find((a) => a.id === color)?.nombre}
        </small>
      </fieldset>
    </>
  );
}

/** Elige de qué cuenta sale o a cuál entra la plata. "Efectivo" se crea solo si no existe. */
function SelectorCuenta({ cuentas, etiqueta, defecto }: { cuentas: Cuenta[]; etiqueta: string; defecto: number | null }) {
  const tieneEfectivo = cuentas.some((c) => c.banco === 'efectivo');
  const [valor, setValor] = useState<string>(defecto ? String(defecto) : '');
  return (
    <fieldset className="cuentas-sel">
      <legend>{etiqueta}</legend>
      <input type="hidden" name="cuenta" value={valor} />
      <button type="button" className={valor === '' ? 'cuenta-op on' : 'cuenta-op'} aria-pressed={valor === ''} onClick={() => setValor('')}>
        Sin especificar
      </button>
      {cuentas.map((c) => (
        <button type="button" key={c.id} className={valor === String(c.id) ? 'cuenta-op on' : 'cuenta-op'} aria-pressed={valor === String(c.id)} onClick={() => setValor(String(c.id))}>
          <SelloBanco b={bancoPorId(c.banco)} chico /> {c.nombre}
        </button>
      ))}
      {!tieneEfectivo && (
        <button type="button" className={valor === 'efectivo' ? 'cuenta-op on' : 'cuenta-op'} aria-pressed={valor === 'efectivo'} onClick={() => setValor('efectivo')}>
          <Banknote size={16} aria-hidden /> Efectivo
        </button>
      )}
    </fieldset>
  );
}

function FormAbono({ faltaCuota, saldo, capital }: { faltaCuota: number; saldo: number; capital?: number }) {
  const [tipo, setTipo] = useState<'cuota' | 'capital'>(capital || faltaCuota <= 0 ? 'capital' : 'cuota');
  return (
    <>
      <div className="segmento" role="radiogroup" aria-label="Tipo de pago">
        {(['cuota', 'capital'] as const).map((t) => (
          <label key={t} className={tipo === t ? 'on' : ''}>
            <input type="radio" name="tipo_abono" value={t} checked={tipo === t} onChange={() => setTipo(t)} />
            {t === 'cuota' ? 'Cuota del mes' : 'Abono a capital'}
          </label>
        ))}
      </div>
      <Campo label={tipo === 'cuota' ? '¿Cuánto pagaste?' : '¿Cuánto abonaste a capital?'}>
        <Monto name="monto" defaultValue={tipo === 'cuota' ? faltaCuota || undefined : capital || undefined} autoFocus key={tipo} />
      </Campo>
      {tipo === 'capital' && (
        <p className="nota">El abono a capital baja la deuda (hoy {pesos(saldo)}) y los intereses que pagas. No cuenta como la cuota del mes.</p>
      )}
    </>
  );
}

function FormTopes({ r }: { r: Resumen }) {
  return (
    <>
      <p className="nota">Deja en blanco las categorías sin tope. Al lado ves cuánto llevas este mes.</p>
      <div className="topes-form">
        {CATEGORIAS.map((c) => {
          const Icono = ICONO_CAT[c];
          const usado = r.porCategoria.find((x) => x.categoria === c)?.total ?? 0;
          return (
            <label key={c} className="tope-campo" style={{ '--c': COLOR_CAT[c] } as React.CSSProperties}>
              <span className="tope-campo-cab"><span className="cat-ico"><Icono size={16} aria-hidden /></span> {c}<small>lleva {pesos(usado)}</small></span>
              <Monto name={`tope_${c}`} defaultValue={r.topes[c]} opcional />
            </label>
          );
        })}
      </div>
    </>
  );
}

function FormAporte({ meta }: { meta: Meta }) {
  const [signo, setSigno] = useState<'mas' | 'menos'>('mas');
  const pct = meta.objetivo ? Math.min(100, Math.round((meta.ahorrado / meta.objetivo) * 100)) : 0;
  return (
    <>
      <p className="nota">Llevas <b className="num">{pesos(meta.ahorrado)}</b> de <b className="num">{pesos(meta.objetivo)}</b> ({pct} %).</p>
      <div className="segmento" role="radiogroup" aria-label="Aportar o retirar">
        {(['mas', 'menos'] as const).map((v) => (
          <label key={v} className={signo === v ? 'on' : ''}>
            <input type="radio" name="signo" value={v} checked={signo === v} onChange={() => setSigno(v)} />
            {v === 'mas' ? '+ Aportar' : '− Sacar'}
          </label>
        ))}
      </div>
      <Campo label={signo === 'mas' ? '¿Cuánto apartas?' : '¿Cuánto sacas?'}><Monto name="monto" autoFocus /></Campo>
    </>
  );
}

function FormTransferir({ cuentas, modo, desde }: { cuentas: Cuenta[]; modo: 'transferir' | 'retiro' | 'consignacion'; desde?: number }) {
  const efectivo = cuentas.find((c) => c.banco === 'efectivo');
  const bancos = cuentas.filter((c) => c.banco !== 'efectivo');
  const valorEfectivo = efectivo ? String(efectivo.id) : 'efectivo';
  const [de, setDe] = useState(modo === 'consignacion' ? valorEfectivo : String(desde ?? bancos[0]?.id ?? ''));
  const [a, setA] = useState(modo === 'retiro' ? valorEfectivo : String(bancos.find((c) => String(c.id) !== String(desde ?? bancos[0]?.id))?.id ?? valorEfectivo));
  const opciones = (
    <>
      {bancos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {pesos(c.saldo)}</option>)}
      <option value={valorEfectivo}>Efectivo{efectivo ? ` · ${pesos(efectivo.saldo)}` : ''}</option>
    </>
  );
  return (
    <>
      <Campo label="Monto"><Monto name="monto" autoFocus /></Campo>
      <div className="fila2">
        <Campo label="Desde"><select name="desde" value={de} onChange={(e) => setDe(e.target.value)}>{opciones}</select></Campo>
        <Campo label="Hacia"><select name="hacia" value={a} onChange={(e) => setA(e.target.value)}>{opciones}</select></Campo>
      </div>
      {de === a && <p className="error">Elige dos cuentas distintas.</p>}
      <Campo label="Nota (opcional)"><input name="nota" placeholder={modo === 'retiro' ? 'Retiro en cajero' : 'Pasé para pagar…'} autoComplete="off" /></Campo>
      <p className="nota">No cuenta como gasto: la plata solo cambia de bolsillo.</p>
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
      <p className="nota">
        Sube lo que debes en la tarjeta y, desde el próximo extracto, suma su parte a la cuota{cuotas > 1 ? ` durante ${cuotas} meses` : ''}.
        No resta de tu plata del mes: sale cuando pagas la cuota.
      </p>
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
