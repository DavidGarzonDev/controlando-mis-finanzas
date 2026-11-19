'use client';

import { useState } from 'react';
import { Contador } from './animacion';
import { Check, HandCoins, Landmark, Plus, ShoppingCart } from 'lucide-react';
import { Plastico } from './Plastico';
import { mesDentroDe, planDeudas } from '@/lib/consejos';
import type { Cuenta, Deuda, MovCredito, Resumen } from '@/lib/datos';
import type { Editor } from './Modal';
import { fechaCorta, pesos } from './util';

export function Creditos({ deudas, cuentas, r, mov, hoyClave, abrir }: {
  deudas: Deuda[]; cuentas: Cuenta[]; r: Resumen; mov: Record<number, MovCredito[]>; hoyClave: string; abrir: (e: Editor) => void;
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
  const cupoTotal = tarjetas.reduce((s, t) => s + (t.cupo ?? 0), 0);
  const usadoTotal = tarjetas.reduce((s, t) => s + (t.cupo ? t.saldo : 0), 0);

  return (
    <div className="columna ancha">
      <div className="resumen-linea">
        <div><span>Tienes en cuentas</span><b className="num pos"><Contador valor={enCuentas} /></b></div>
        <div><span>Debes en total</span><b className="num"><Contador valor={total} /></b></div>
        <div>
          <span>Libre de deudas</span>
          <b>{!activas.length ? 'Ya estás libre' : plan ? mesDentroDe(plan.meses) : 'Sube las cuotas'}</b>
        </div>
      </div>
      <p className="sub">Cuotas de todos tus créditos: <b className="num">{pesos(r.cuotas)}</b> al mes.</p>

      {/* ---------- Cuentas débito y billeteras ---------- */}
      <div className="bloque-cab">
        <h2>Cuentas y tarjetas débito</h2>
        <button className="btn chico" onClick={() => abrir({ tipo: 'cuenta' })}><Plus size={16} aria-hidden /> Agregar cuenta</button>
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
          <div className="billetera" role="listbox" aria-label="Tus tarjetas" aria-activedescendant={elegida ? `tarjeta-${elegida.id}` : undefined}>
            {/* Las demás quedan apiladas arriba (se ve su franja) y la elegida va completa al final. */}
            {[...tarjetas.filter((t) => t.id !== elegida?.id), ...(elegida ? [elegida] : [])].map((t) => (
              <button
                key={t.id}
                id={`tarjeta-${t.id}`}
                role="option"
                aria-selected={t.id === elegida?.id}
                className={t.id === elegida?.id ? 'tarjeta-slot elegida' : 'tarjeta-slot'}
                onClick={() => setSel(t.id)}
              >
                <TarjetaCredito t={t} />
              </button>
            ))}
          </div>

          {elegida && (
            <section className="tarjeta-detalle" aria-label={`Detalle de ${elegida.nombre}`}>
              <Cupo t={elegida} />
              <dl className="tarjeta-datos">
                <div><dt>Cuota del mes</dt><dd className="num">{pesos(elegida.cuota)}</dd></div>
                <div><dt>Tasa</dt><dd>{elegida.tasa || '—'}</dd></div>
                <div><dt>Orden de pago</dt><dd>{orden.get(elegida.id) ? `#${orden.get(elegida.id)}` : 'Pagada'}</dd></div>
              </dl>
              <EstadoCuota d={elegida} />
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
                      {d.saldo > 0 ? <>Cuota {pesos(d.cuota)}{d.tasa ? ` · ${d.tasa}` : ''}{mes ? ` · termina en ${mesDentroDe(mes)}` : ''}</> : `Pagada · liberaste ${pesos(d.cuota)} al mes`}
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

function TarjetaCredito({ t }: { t: Deuda }) {
  const disponible = t.cupo ? t.cupo - t.saldo : null;
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

function EstadoCuota({ d, boton, abrir }: { d: Deuda; boton?: boolean; abrir?: (e: Editor) => void }) {
  if (d.saldo <= 0) return null;
  const falta = Math.max(0, Math.min(d.saldo, d.cuota - d.abonadoMes));
  if (falta === 0) return <span className="ok"><Check size={16} aria-hidden /> Cuota del mes pagada</span>;
  if (boton && abrir) return <button className="btn chico" onClick={() => abrir({ tipo: 'abono', item: d })}>Pagar · faltan {pesos(falta)} este mes</button>;
  return <p className="pendiente-cuota">Falta pagar <b className="num">{pesos(falta)}</b> de la cuota de este mes</p>;
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
            <span className="fila-nombre">{m.tipo === 'abono' ? 'Pago' : m.concepto}</span>
            <span className="fila-sub">{fechaCorta(m.fecha, hoyClave)}{m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ''}</span>
          </span>
          <span className="puntos" aria-hidden />
          <span className={`fila-monto num ${m.tipo === 'abono' ? 'pos' : ''}`}>{m.tipo === 'abono' ? '−' : '+'}{pesos(m.monto)}</span>
        </li>
      ))}
    </ul>
  );
}
