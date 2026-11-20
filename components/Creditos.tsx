'use client';

import { useRef, useState, useTransition } from 'react';
import { marcarCuota } from '@/app/actions';
import { Contador } from './animacion';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, CalendarClock, Check, HandCoins, Landmark, Plus, ShoppingCart, TrendingUp } from 'lucide-react';
import { Plastico, Reverso, useGiroscopio } from './Plastico';
import { mesDentroDe, planDeudas, simularPago, tasaMensual } from '@/lib/consejos';
import { CurvaPatrimonio } from './graficas';
import type { Cuenta, Deuda, MovCredito, PuntoPatrimonio, Resumen } from '@/lib/datos';
import type { Editor } from './Modal';
import { fechaCorta, pesos } from './util';

export function Creditos({ deudas, cuentas, r, mov, patrimonio, hoyClave, abrir }: {
  deudas: Deuda[]; cuentas: Cuenta[]; r: Resumen; mov: Record<number, MovCredito[]>; patrimonio: PuntoPatrimonio[]; hoyClave: string;
  abrir: (e: Editor) => void;
}) {
  const enCuentas = cuentas.reduce((s, c) => s + c.saldo, 0);
  const tarjetas = deudas.filter((d) => d.tipo === 'tarjeta');
  const otras = deudas.filter((d) => d.tipo !== 'tarjeta');
  const activas = deudas.filter((d) => d.saldo > 0);
  const total = activas.reduce((s, d) => s + d.saldo, 0);
  const plan = planDeudas(deudas);
  const orden = new Map(activas.map((d, i) => [d.id, i + 1]));
  const [sel, setSel] = useState<number | null>(tarjetas[0]?.id ?? null);
  const elegida = tarjetas.find((t) => t.id === sel) ?? tarjetas[0];
  const [volteada, setVolteada] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pedirGiro = useGiroscopio(raiz);
  const cupoTotal = tarjetas.reduce((s, t) => s + (t.cupo ?? 0), 0);
  const usadoTotal = tarjetas.reduce((s, t) => s + (t.cupo ? t.saldo : 0), 0);

  return (
    <div className="columna ancha" ref={raiz}>
      <div className="resumen-linea">
        <div><span>Tienes en cuentas</span><b className="num pos"><Contador valor={enCuentas} /></b></div>
        <div><span>Debes en total</span><b className="num"><Contador valor={total} /></b></div>
        <div>
          <span>Libre de deudas</span>
          <b>{!activas.length ? 'Ya estás libre' : plan ? mesDentroDe(plan.meses) : 'Sube las cuotas'}</b>
        </div>
      </div>
      <p className="sub">Cuotas de todos tus créditos: <b className="num">{pesos(r.cuotas)}</b> al mes.</p>

      <section className="bloque" aria-labelledby="t-patrimonio">
        <div className="bloque-cab">
          <div>
            <h2 id="t-patrimonio"><TrendingUp size={18} aria-hidden className="ico-titulo" /> Tu patrimonio</h2>
            <p className="sub">Lo que tienes (cuentas + metas) menos lo que debes</p>
          </div>
          <b className={`patrimonio-cifra num ${enCuentas - total < 0 ? 'neg' : ''}`}><Contador valor={enCuentas - total} /></b>
        </div>
        {patrimonio.length >= 2 ? (
          <CurvaPatrimonio puntos={patrimonio} />
        ) : (
          <div className="vacio-caja"><TrendingUp size={18} aria-hidden /><p>Cada día guardo una foto de tu patrimonio. En unos días verás aquí cómo va subiendo (o bajando).</p></div>
        )}
      </section>

      {/* ---------- Cuentas débito y billeteras ---------- */}
      <div className="bloque-cab">
        <h2>Cuentas, débito y efectivo</h2>
        <button className="btn chico" onClick={() => abrir({ tipo: 'cuenta' })}><Plus size={16} aria-hidden /> Agregar cuenta</button>
      </div>
      <div className="acciones-cuentas">
        <button className="btn chico" onClick={() => abrir({ tipo: 'transferir', modo: 'transferir' })}><ArrowLeftRight size={16} aria-hidden /> Mover plata</button>
        <button className="btn chico" onClick={() => abrir({ tipo: 'transferir', modo: 'retiro' })}><ArrowUpFromLine size={16} aria-hidden /> Retirar</button>
        <button className="btn chico" onClick={() => abrir({ tipo: 'transferir', modo: 'consignacion' })}><ArrowDownToLine size={16} aria-hidden /> Consignar</button>
        {!cuentas.some((c) => c.banco === 'efectivo') && (
          <button className="btn chico" onClick={() => abrir({ tipo: 'cuenta', item: { id: 0, nombre: 'Efectivo', banco: 'efectivo', saldo: 0, ultimos4: null, franquicia: 'Otra', color: null, actualizado: '', principal: false } })}>
            <Banknote size={16} aria-hidden /> Agregar efectivo
          </button>
        )}
      </div>
      {cuentas.length ? (
        <ul className="carrusel" aria-label="Tus cuentas">
          {cuentas.map((c) => (
            <li key={c.id}>
              <button className="tarjeta-slot debito" onClick={() => abrir({ tipo: 'cuenta', item: c })} aria-label={`${c.nombre}: ${pesos(c.saldo)}. Editar`}>
                <TarjetaDebito c={c} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button className="tarjeta-vacia chica" onClick={() => abrir({ tipo: 'cuenta' })}>
          <Plus size={20} aria-hidden />
          <span>Agrega tus cuentas: Bancolombia, Nequi, Nu, Daviplata…</span>
        </button>
      )}

      {/* ---------- Billetera de tarjetas ---------- */}
      <div className="bloque-cab">
        <h2>Tarjetas de crédito</h2>
        <button className="btn chico" onClick={() => abrir({ tipo: 'deuda', nuevoTipo: 'tarjeta' })}><Plus size={16} aria-hidden /> Agregar tarjeta</button>
      </div>
      {tarjetas.length ? (
        <div className="billetera-zona">
          <div className="billetera-col">
          <div className="billetera" role="listbox" aria-label="Tus tarjetas" aria-activedescendant={elegida ? `tarjeta-${elegida.id}` : undefined}>
            {/* Las demás quedan apiladas arriba (se ve su franja) y la elegida va completa al final. */}
            {[...tarjetas.filter((t) => t.id !== elegida?.id), ...(elegida ? [elegida] : [])].map((t) => (
              <button
                key={t.id}
                id={`tarjeta-${t.id}`}
                role="option"
                aria-selected={t.id === elegida?.id}
                className={t.id === elegida?.id ? 'tarjeta-slot elegida' : 'tarjeta-slot'}
                onClick={() => {
                  void pedirGiro();
                  // Tocar la tarjeta elegida la voltea; tocar otra la elige.
                  if (t.id === elegida?.id) setVolteada((v) => !v);
                  else { setSel(t.id); setVolteada(false); }
                }}
                aria-label={t.id === elegida?.id ? `${t.nombre}. Toca para ${volteada ? 'ver el frente' : 'voltearla'}` : `Elegir ${t.nombre}`}
              >
                <TarjetaCredito t={t} volteada={t.id === elegida?.id && volteada} />
              </button>
            ))}
          </div>
          <p className="pista-volteo">Toca la tarjeta de adelante para ver su reverso</p>
          </div>

          {elegida && (
            <section className="tarjeta-detalle" aria-label={`Detalle de ${elegida.nombre}`}>
              <Cupo t={elegida} />
              <dl className="tarjeta-datos">
                <div>
                  <dt>Cuota del mes</dt>
                  <dd className="num">{pesos(elegida.cuota)}</dd>
                  {elegida.cuotaCompras > 0 && <small className="desglose num">{pesos(elegida.cuotaBase)} fija + {pesos(elegida.cuotaCompras)} de compras</small>}
                </div>
                <div><dt>Tasa</dt><dd>{elegida.tasa || '—'}</dd></div>
                <div><dt>Orden de pago</dt><dd>{orden.get(elegida.id) ? `#${orden.get(elegida.id)}` : 'Pagada'}</dd></div>
              </dl>
              <Fechas d={elegida} />
              <EstadoCuota d={elegida} />
              <Intereses d={elegida} />
              <SimuladorAbonos d={elegida} abrir={abrir} />
              <div className="tarjeta-acciones">
                <button className="btn" onClick={() => abrir({ tipo: 'compra', item: elegida })}><ShoppingCart size={18} aria-hidden /> Compra</button>
                <button className="btn primario" onClick={() => abrir({ tipo: 'abono', item: elegida })}><HandCoins size={18} aria-hidden /> Pagar</button>
                <button className="btn" onClick={() => abrir({ tipo: 'deuda', item: elegida })}>Editar</button>
              </div>
              <Historial mov={mov[elegida.id]} hoyClave={hoyClave} />
              <p className="sub">Desde Telegram: <code>compré con la {elegida.nombre} 120 mil</code> · <code>pagué la cuota de la {elegida.nombre}</code></p>
            </section>
          )}
          {tarjetas.length > 1 && cupoTotal > 0 && (
            <p className="sub">Entre todas tus tarjetas usas <b className="num">{pesos(usadoTotal)}</b> de <b className="num">{pesos(cupoTotal)}</b> de cupo ({Math.round((usadoTotal / cupoTotal) * 100)} %).</p>
          )}
        </div>
      ) : (
        <button className="tarjeta-vacia" onClick={() => abrir({ tipo: 'deuda', nuevoTipo: 'tarjeta' })}>
          <Plus size={22} aria-hidden />
          <span>Agrega tu primera tarjeta</span>
          <small>Bancolombia, Davivienda, AV Villas, Nu, Falabella…</small>
        </button>
      )}

      {/* ---------- Préstamos y otras deudas ---------- */}
      <div className="bloque-cab">
        <h2>Préstamos y otras deudas</h2>
        <button className="btn chico" onClick={() => abrir({ tipo: 'deuda', nuevoTipo: 'prestamo' })}><Plus size={16} aria-hidden /> Agregar</button>
      </div>
      {otras.length ? (
        <ol className="deudas">
          {otras.map((d) => {
            const pagado = d.montoOriginal > 0 ? (d.montoOriginal - d.saldo) / d.montoOriginal : 0;
            const n = orden.get(d.id);
            const mes = plan?.porDeuda[d.id];
            return (
              <li key={d.id} className={n === 1 ? 'deuda primera' : 'deuda'}>
                <button className="deuda-cuerpo" onClick={() => abrir({ tipo: 'deuda', item: d })} aria-label={`Editar ${d.nombre}`}>
                  <span className="deuda-rango num" aria-hidden>{n ?? <Check size={16} />}</span>
                  <span className="deuda-info">
                    <span className="deuda-nombre">
                      {d.nombre}
                      {n === 1 && <span className="etiqueta">Pagar primero</span>}
                    </span>
                    <span className="fila-sub">
                      {d.saldo > 0 ? <>Cuota {pesos(d.cuota)}{d.diaPago ? ` el día ${d.diaPago}` : ''}{d.tasa ? ` · ${d.tasa}` : ''}{mes ? ` · termina en ${mesDentroDe(mes)}` : ''}</> : `Pagada · liberaste ${pesos(d.cuota)} al mes`}
                    </span>
                  </span>
                  <span className="deuda-saldo num">{pesos(d.saldo)}<small>saldo</small></span>
                </button>
                {d.saldo > 0 && (
                  <>
                    <div className="barra-prog" role="progressbar" aria-label={`Avance de ${d.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pagado * 100)}>
                      <span style={{ width: `${pagado * 100}%` }} />
                    </div>
                    <div className="deuda-pie">
                      <span className="sub">{Math.round(pagado * 100)} % pagado</span>
                      <EstadoCuota d={d} boton abrir={abrir} />
                    </div>
                    <SimuladorAbonos d={d} abrir={abrir} />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="vacio-caja">
          <Landmark size={18} aria-hidden />
          <p>Préstamos de banco, Nequi, Addi, plata que le debes a alguien… Agrégalos para ver cuándo quedas libre.</p>
        </div>
      )}
      <p className="sub">
        Paga la cuota de todas y manda la plata extra a la de prioridad 1. Cuando termines una, su cuota pasa a la siguiente (bola de nieve).
      </p>
    </div>
  );
}

function TarjetaCredito({ t, volteada = false }: { t: Deuda; volteada?: boolean }) {
  const disponible = t.cupo ? t.cupo - t.saldo : null;
  const filas = [
    ...(t.cupo ? [{ etiqueta: 'Cupo total', valor: pesos(t.cupo) }, { etiqueta: 'Usado', valor: pesos(t.saldo) }] : [{ etiqueta: 'Debes', valor: pesos(t.saldo) }]),
    { etiqueta: 'Cuota del mes', valor: pesos(t.cuota) },
    { etiqueta: 'Corte', valor: t.diaCorte ? `Día ${t.diaCorte}` : '—' },
    { etiqueta: 'Pago', valor: t.diaPago ? `Día ${t.diaPago}` : '—' },
    { etiqueta: 'Tasa', valor: t.tasa || '—' },
  ];
  return (
    <span className={`volteo ${volteada ? 'on' : ''}`}>
      <span className="volteo-interior">
        <span className="cara frente"><FrenteCredito t={t} disponible={disponible} /></span>
        <span className="cara atras" aria-hidden={!volteada}><Reverso d={t} filas={filas} /></span>
      </span>
    </span>
  );
}

function FrenteCredito({ t, disponible }: { t: Deuda; disponible: number | null }) {
  return (
    <Plastico
      d={t}
      clase="credito"
      arriba={
        disponible !== null ? (
          <span className="tarjeta-disp">
            <small>Disponible</small>
            <b className="num">{pesos(disponible)}</b>
          </span>
        ) : undefined
      }
    />
  );
}

function TarjetaDebito({ c }: { c: Cuenta }) {
  return (
    <Plastico
      d={c}
      clase="debito"
      mini
      centro={
        <span className="tarjeta-saldo">
          <small>Saldo</small>
          <b className="num"><Contador valor={c.saldo} /></b>
        </span>
      }
    />
  );
}

function Fechas({ d }: { d: Deuda }) {
  if (!d.diaPago && !d.diaCorte) {
    return <p className="sub"><CalendarClock size={14} aria-hidden /> Ponle día de pago y de corte (en Editar) y te recuerdo por Telegram.</p>;
  }
  return (
    <p className="fechas-tarjeta">
      <CalendarClock size={16} aria-hidden />
      {d.diaCorte && <span>Corte: día <b>{d.diaCorte}</b></span>}
      {d.diaPago && <span>Pago: día <b>{d.diaPago}</b></span>}
    </p>
  );
}

/** Cuánto pagarías de intereses el próximo mes si solo pagas la cuota, frente a pagar el total. */
const ABONOS_UNICOS = [100_000, 200_000, 500_000, 1_000_000];

/**
 * Cuánto pagarías en intereses si sigues con la misma cuota, y cuánto te ahorras con abonos a capital.
 * Sirve para animarte a abonar: el ahorro se ve en pesos y en meses.
 */
function SimuladorAbonos({ d, abrir }: { d: Deuda; abrir: (e: Editor) => void }) {
  const r = tasaMensual(d.tasa);
  const cuota = d.cuotaBase || d.cuota;
  const [extra, setExtra] = useState(0);
  const [unico, setUnico] = useState(0);
  if (d.saldo <= 0) return null;
  if (!r) {
    return <p className="sub sim-sin-tasa">Agrega la tasa de interés (en Editar) para ver cuánto pagarías en intereses y cuánto te ahorras abonando a capital.</p>;
  }
  const base = simularPago(d.saldo, cuota, r);
  if (!base) {
    return (
      <div className="simulador alerta">
        <p><b>Con una cuota de {pesos(cuota)} esta deuda nunca se termina:</b> no alcanza ni para los intereses (~{pesos(d.saldo * r)} al mes). Súbele la cuota o abona a capital.</p>
      </div>
    );
  }
  const nueva = extra || unico ? simularPago(d.saldo, cuota, r, extra, unico) : null;
  const ahorro = nueva ? base.intereses - nueva.intereses : 0;
  const mesesMenos = nueva ? base.meses - nueva.meses : 0;
  const maxExtra = Math.max(200_000, Math.ceil((cuota * 3) / 50_000) * 50_000);

  return (
    <div className="simulador">
      <p className="sim-base">
        Si sigues pagando <b className="num">{pesos(cuota)}</b> al mes, terminas en <b>{mesDentroDe(base.meses)}</b> ({base.meses} {base.meses === 1 ? 'mes' : 'meses'})
        y pagas <b className="num neg">{pesos(base.intereses)}</b> en intereses.
      </p>
      <details className="sim-detalle">
        <summary>¿Cuánto me ahorro abonando a capital?</summary>
        <label className="sim-control">
          <span>Abono extra cada mes: <b className="num">{pesos(extra)}</b></span>
          <input type="range" min={0} max={maxExtra} step={10_000} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
        </label>
        <div className="sim-control">
          <span>Abono único hoy</span>
          <div className="chips">
            {[0, ...ABONOS_UNICOS.filter((v) => v < d.saldo)].map((v) => (
              <button type="button" key={v} className={unico === v ? 'chip on' : 'chip'} aria-pressed={unico === v} onClick={() => setUnico(v)}>
                {v ? pesos(v) : 'Ninguno'}
              </button>
            ))}
          </div>
        </div>
        {nueva ? (
          <div className="sim-resultado" aria-live="polite">
            <p className="sim-ahorro">Te ahorras <b className="num"><Contador valor={ahorro} duracion={500} /></b> en intereses</p>
            <p>
              Terminas en <b>{mesDentroDe(nueva.meses)}</b>
              {mesesMenos > 0 && <> · <b>{mesesMenos} {mesesMenos === 1 ? 'mes' : 'meses'} antes</b></>}
              {' '}· pagas {pesos(nueva.intereses)} de intereses en vez de {pesos(base.intereses)}.
            </p>
            <button type="button" className="btn chico primario" onClick={() => abrir({ tipo: 'abono', item: d, capital: unico || extra })}>
              Hacer un abono a capital
            </button>
          </div>
        ) : (
          <p className="sub">Mueve la barra o elige un abono para ver cuánto te ahorras.</p>
        )}
      </details>
    </div>
  );
}

function Intereses({ d }: { d: Deuda }) {
  const r = tasaMensual(d.tasa);
  if (!r || d.saldo <= 0) return null;
  const quedaDespuesDeCuota = Math.max(0, d.saldo - Math.max(d.cuota, d.abonadoMes));
  const interes = Math.round(quedaDespuesDeCuota * r);
  if (interes < 1000) return null;
  return (
    <p className="intereses">
      Si pagas solo la cuota, el próximo mes pagarías unos <b className="num">{pesos(interes)}</b> de intereses.
      {d.tipo === 'tarjeta' ? ' Pagando el total no pagas intereses en compras a 1 cuota.' : ' Un abono a capital los baja.'}
    </p>
  );
}

function Cupo({ t }: { t: Deuda }) {
  if (!t.cupo) {
    return (
      <div className="cupo">
        <div className="cupo-cifras"><div><small>Debes</small><b className="num">{pesos(t.saldo)}</b></div></div>
        <p className="sub">Agrega el cupo de la tarjeta (en Editar) para ver cuánto te queda disponible.</p>
      </div>
    );
  }
  const usado = Math.min(t.saldo / t.cupo, 1);
  const pasado = t.saldo > t.cupo;
  const nivel = pasado || usado >= 0.9 ? 'alto' : usado >= 0.7 ? 'medio' : 'bajo';
  return (
    <div className={`cupo ${nivel}`}>
      <div className="cupo-cifras">
        <div><small>Cupo disponible</small><b className="num">{pesos(Math.max(0, t.cupo - t.saldo))}</b></div>
        <div className="der"><small>Cupo usado</small><b className="num">{pesos(t.saldo)}</b></div>
      </div>
      <div className="cupo-barra" role="meter" aria-label="Cupo usado" aria-valuemin={0} aria-valuemax={t.cupo} aria-valuenow={Math.min(t.saldo, t.cupo)} aria-valuetext={`${Math.round(usado * 100)} % del cupo usado`}>
        <span style={{ width: `${usado * 100}%` }} />
      </div>
      <p className="sub">
        {pasado ? `Te pasaste del cupo por ${pesos(t.saldo - t.cupo)}.` : `Usas el ${Math.round(usado * 100)} % de ${pesos(t.cupo)}.`}
        {nivel !== 'bajo' && !pasado && ' Trata de no pasar del 30 % para cuidar tu historial en las centrales de riesgo.'}
      </p>
    </div>
  );
}

/**
 * Estado de la cuota del mes. "Ya la pagué" la marca como pagada sin mover saldos
 * (para cuando pagaste en el banco y ya pusiste el saldo actualizado).
 */
function EstadoCuota({ d, boton, abrir }: { d: Deuda; boton?: boolean; abrir?: (e: Editor) => void }) {
  const [marcando, iniciar] = useTransition();
  if (d.saldo <= 0) return null;
  const marcar = (pagada: boolean) => iniciar(() => marcarCuota(d.id, pagada));
  if (d.faltaMes === 0) {
    return (
      <span className="estado-cuota">
        <span className="ok"><Check size={16} aria-hidden /> Cuota del mes pagada</span>
        {d.marcadaMes && (
          <button className="enlace" onClick={() => marcar(false)} disabled={marcando}>{marcando ? 'Guardando…' : 'Desmarcar'}</button>
        )}
      </span>
    );
  }
  return (
    <span className="estado-cuota">
      {boton && abrir ? (
        <button className="btn chico" onClick={() => abrir({ tipo: 'abono', item: d })}>Pagar · faltan {pesos(d.faltaMes)}</button>
      ) : (
        <span className="pendiente-cuota">Falta pagar <b className="num">{pesos(d.faltaMes)}</b> de la cuota de este mes</span>
      )}
      <button className="btn chico" onClick={() => marcar(true)} disabled={marcando} title="Marca la cuota como pagada sin cambiar el saldo">
        <Check size={16} aria-hidden /> {marcando ? 'Guardando…' : 'Ya la pagué'}
      </button>
    </span>
  );
}

function Historial({ mov, hoyClave }: { mov?: MovCredito[]; hoyClave: string }) {
  if (!mov?.length) return null;
  return (
    <ul className="libro tarjeta-mov" aria-label="Últimos movimientos de la tarjeta">
      {mov.map((m) => (
        <li key={m.id} className="fila">
          <span className={`fila-ico ${m.tipo === 'abono' ? 'ok' : ''}`} aria-hidden>
            {m.tipo === 'abono' ? <HandCoins size={16} /> : <ShoppingCart size={16} />}
          </span>
          <span className="fila-txt">
            <span className="fila-nombre">{m.concepto}</span>
            <span className="fila-sub">{fechaCorta(m.fecha, hoyClave)}{m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ''}</span>
          </span>
          <span className="puntos" aria-hidden />
          <span className={`fila-monto num ${m.tipo === 'abono' ? 'pos' : ''}`}>{m.tipo === 'abono' ? '−' : '+'}{pesos(m.monto)}</span>
        </li>
      ))}
    </ul>
  );
}
