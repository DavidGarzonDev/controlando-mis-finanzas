'use client';

import { useState, useTransition } from 'react';
import { Check, Flame, Gauge, PiggyBank, Plus, Target, Trophy } from 'lucide-react';
import { iniciarReto, marcarFijo, quitarRetoAccion } from '@/app/actions';
import { CATALOGO, type Reto } from '@/lib/retosComun';
import type { Fijo, Meta, Resumen } from '@/lib/datos';
import type { Editor } from './Modal';
import { Contador } from './animacion';
import { colorCat, fechaLarga, pesos, todasCategorias } from './util';
import { IconoCat } from './IconoCat';
import { Conexiones } from './Conexiones';
import { Apoyar } from './Apoyar';

export function Plan({ fijos, metas, retos, r, mes, abrir, avisar }: {
  fijos: Fijo[]; metas: Meta[]; retos: Reto[]; r: Resumen; mes: string; abrir: (e: Editor) => void; avisar: (m: string) => void;
}) {
  return (
    <div className="columna ancha plan">
      {r.esActual && <Retos retos={retos} avisar={avisar} />}
      <Metas metas={metas} abrir={abrir} />
      <Topes r={r} abrir={abrir} />
      <Fijos fijos={fijos} mes={mes} abrir={abrir} avisar={avisar} />
      {r.esActual && <Conexiones avisar={avisar} />}
      <Apoyar />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Retos({ retos, avisar }: { retos: Reto[]; avisar: (m: string) => void }) {
  const [pendiente, iniciar] = useTransition();
  const activos = retos.filter((x) => x.estado === 'activo');
  const recientes = retos.filter((x) => x.estado !== 'activo').slice(0, 3);
  const disponibles = CATALOGO.filter((c) => !activos.some((a) => a.nombre === c.nombre));
  const empezar = (clave: string, nombre: string) =>
    iniciar(async () => {
      await iniciarReto(clave);
      avisar(`Reto iniciado: ${nombre}`);
    });

  return (
    <section aria-labelledby="t-plan-retos">
      <div className="bloque-cab">
        <div>
          <h2 id="t-plan-retos"><Flame size={18} aria-hidden className="ico-titulo" /> Retos</h2>
          <p className="sub">Para que ahorrar sea un juego. El bot te avisa si se rompe o si lo logras.</p>
        </div>
      </div>
      {activos.length > 0 && (
        <ul className="retos">
          {activos.map((x) => (
            <li key={x.id} className="reto">
              <div className="reto-cab">
                <b>{x.nombre}</b>
                <button className="enlace" onClick={() => iniciar(async () => { await quitarRetoAccion(x.id); avisar('Reto quitado'); })}>Quitar</button>
              </div>
              <div className="reto-dias" aria-label={`${x.cumplidos} de ${x.meta}`}>
                {Array.from({ length: x.meta }, (_, i) => (
                  <span key={i} className={i < x.cumplidos ? 'on' : x.tipo !== 'cero' && i === x.cumplidos ? 'hoy' : ''} />
                ))}
              </div>
              <p className="fila-sub">{x.detalle}</p>
            </li>
          ))}
        </ul>
      )}
      {disponibles.length > 0 && (
        <div className="retos-catalogo">
          {disponibles.map((c) => (
            <button key={c.clave} className="reto-op" disabled={pendiente} onClick={() => empezar(c.clave, c.nombre)}>
              <b>{c.nombre}</b>
              <small>{c.descripcion}</small>
              <span className="reto-op-accion"><Plus size={14} aria-hidden /> Empezar</span>
            </button>
          ))}
        </div>
      )}
      {recientes.length > 0 && (
        <ul className="libro retos-hechos">
          {recientes.map((x) => (
            <li key={x.id} className="fila">
              <span className={`fila-ico ${x.estado === 'logrado' ? 'ok' : ''}`} aria-hidden>{x.estado === 'logrado' ? <Trophy size={16} /> : <Flame size={16} />}</span>
              <span className="fila-txt"><span className="fila-nombre">{x.nombre}</span><span className="fila-sub">{x.estado === 'logrado' ? '¡Lo lograste!' : x.detalle}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Metas({ metas, abrir }: { metas: Meta[]; abrir: (e: Editor) => void }) {
  const total = metas.reduce((s, m) => s + m.ahorrado, 0);
  return (
    <section aria-labelledby="t-plan-metas">
      <div className="bloque-cab">
        <div>
          <h2 id="t-plan-metas"><Target size={18} aria-hidden className="ico-titulo" /> Metas de ahorro</h2>
          {metas.length > 0 && <p className="sub">Llevas <b className="num">{pesos(total)}</b> ahorrados en total</p>}
        </div>
        <button className="btn chico" onClick={() => abrir({ tipo: 'meta' })}><Plus size={16} aria-hidden /> Nueva meta</button>
      </div>
      {metas.length ? (
        <ul className="metas">
          {metas.map((m) => {
            const pct = m.objetivo ? Math.min(1, m.ahorrado / m.objetivo) : 0;
            const falta = Math.max(0, m.objetivo - m.ahorrado);
            const meses = m.fechaMeta
              ? Math.max(1, Math.round((new Date(`${m.fechaMeta}T12:00:00`).getTime() - Date.now()) / (30.4 * 86_400_000)))
              : null;
            const porMes = meses ? Math.ceil(falta / meses / 1000) * 1000 : null;
            const lista = pct >= 1;
            return (
              <li key={m.id} className={lista ? 'meta lista' : 'meta'} style={{ '--p': pct } as React.CSSProperties}>
                <button className="meta-anillo" onClick={() => abrir({ tipo: 'meta', item: m })} aria-label={`Editar ${m.nombre}`}>
                  <svg viewBox="0 0 44 44" aria-hidden>
                    <circle cx="22" cy="22" r="19" className="anillo-fondo" />
                    <circle cx="22" cy="22" r="19" className="anillo-valor" pathLength={100} strokeDasharray={`${pct * 100} 100`} />
                  </svg>
                  <span className="num">{Math.round(pct * 100)}%</span>
                </button>
                <div className="meta-info">
                  <p className="meta-nombre">{m.nombre}</p>
                  <p className="meta-cifras num"><b><Contador valor={m.ahorrado} /></b> de {pesos(m.objetivo)}</p>
                  <p className="fila-sub">
                    {lista ? '¡Meta cumplida!' : porMes ? `Aparta ${pesos(porMes)} al mes para llegar el ${fechaLarga(m.fechaMeta!)}` : `Te faltan ${pesos(falta)}`}
                    {m.aportadoMes > 0 && ` · este mes: +${pesos(m.aportadoMes)}`}
                  </p>
                </div>
                <button className="btn chico primario" onClick={() => abrir({ tipo: 'aporte', item: m })}><PiggyBank size={16} aria-hidden /> Aportar</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <button className="tarjeta-vacia chica" onClick={() => abrir({ tipo: 'meta' })}>
          <Target size={20} aria-hidden />
          <span>Crea tu primera meta: fondo de emergencia, un viaje, la moto…</span>
        </button>
      )}
      <p className="sub">Desde Telegram: <code>aparté 100 mil para el viaje</code>. Lo que apartas se resta de tu plata libre del mes.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Topes({ r, abrir }: { r: Resumen; abrir: (e: Editor) => void }) {
  const conTope = todasCategorias().filter((c) => r.topes[c]);
  return (
    <section aria-labelledby="t-plan-topes">
      <div className="bloque-cab">
        <div>
          <h2 id="t-plan-topes"><Gauge size={18} aria-hidden className="ico-titulo" /> Topes por categoría</h2>
          <p className="sub">Cuánto quieres gastar como máximo cada mes. El bot te avisa al llegar al 80 %.</p>
        </div>
        <button className="btn chico" onClick={() => abrir({ tipo: 'topes' })}>{conTope.length ? 'Editar topes' : 'Poner topes'}</button>
      </div>
      {conTope.length ? (
        <ul className="topes">
          {conTope.map((c) => {
            const tope = r.topes[c];
            const usado = r.porCategoria.find((x) => x.categoria === c)?.total ?? 0;
            const pct = usado / tope;
            const estado = pct > 1 ? 'alto' : pct >= 0.8 ? 'medio' : 'bajo';
            return (
              <li key={c} className={`tope ${estado}`} style={{ '--c': colorCat(c) } as React.CSSProperties}>
                <span className="cat-ico"><IconoCat c={c} /></span>
                <div className="tope-info">
                  <p className="tope-cab"><b>{c}</b><span className="num">{pesos(usado)} <small>de {pesos(tope)}</small></span></p>
                  <div className="cupo-barra" role="meter" aria-label={`${c}: ${Math.round(pct * 100)} % del tope`} aria-valuemin={0} aria-valuemax={tope} aria-valuenow={Math.min(usado, tope)}>
                    <span style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                  </div>
                  <p className="fila-sub">{pct > 1 ? `Te pasaste ${pesos(usado - tope)}` : `Te quedan ${pesos(tope - usado)}`}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="vacio-caja"><Gauge size={18} aria-hidden /><p>Sin topes todavía. Empieza por la categoría donde más se te va la plata (mira el Resumen).</p></div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Fijos({ fijos, mes, abrir, avisar }: { fijos: Fijo[]; mes: string; abrir: (e: Editor) => void; avisar: (m: string) => void }) {
  const [, iniciar] = useTransition();
  const [optimista, setOptimista] = useState<Record<number, boolean>>({});
  const pagado = (f: Fijo) => optimista[f.id] ?? f.pagadoMes;
  const total = fijos.reduce((s, f) => s + f.monto, 0);
  const yaPagado = fijos.filter(pagado).reduce((s, f) => s + f.monto, 0);

  function alternar(f: Fijo) {
    const nuevo = !pagado(f);
    // Al pagarlo se pregunta de qué cuenta salió; desmarcarlo devuelve la plata de una vez
    if (nuevo) return abrir({ tipo: 'pagoFijo', item: { id: f.id, nombre: f.concepto, monto: f.monto }, mes });
    setOptimista((o) => ({ ...o, [f.id]: nuevo }));
    iniciar(async () => {
      try {
        await marcarFijo(f.id, nuevo, mes);
        avisar(nuevo ? `${f.concepto} pagado` : `${f.concepto} pendiente`);
      } catch {
        setOptimista((o) => ({ ...o, [f.id]: !nuevo }));
        avisar('No se pudo guardar');
      }
    });
  }

  return (
    <section aria-labelledby="t-plan-fijos">
      <div className="bloque-cab">
        <div>
          <h2 id="t-plan-fijos"><Check size={18} aria-hidden className="ico-titulo" /> Gastos fijos del mes</h2>
          <p className="sub">
            Pagado <b className="num">{pesos(yaPagado)}</b> de <b className="num">{pesos(total)}</b>. Ponles día de pago y el bot te recuerda.
          </p>
        </div>
        <button className="btn chico" onClick={() => abrir({ tipo: 'fijo' })}><Plus size={16} aria-hidden /> Agregar</button>
      </div>
      {total > 0 && (
        <div className="barra-prog" role="progressbar" aria-label="Gastos fijos pagados este mes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((yaPagado / total) * 100)}>
          <span style={{ width: `${(yaPagado / total) * 100}%` }} />
        </div>
      )}
      {fijos.length ? (
        <ul className="libro bloque-lista">
          {fijos.map((f) => (
            <li key={f.id} className={pagado(f) ? 'fila hecha' : 'fila'}>
              <button className="check" aria-pressed={pagado(f)} onClick={() => alternar(f)} aria-label={`${f.concepto}: ${pagado(f) ? 'pagado' : 'pendiente'}`}>
                {pagado(f) && <Check size={16} aria-hidden />}
              </button>
              <button className="fila-txt como-enlace" onClick={() => abrir({ tipo: 'fijo', item: f })}>
                <span className="fila-nombre">{f.concepto}</span>
                <span className="fila-sub">{pagado(f) ? 'Pagado este mes' : f.diaPago ? `Vence el ${f.diaPago}` : 'Pendiente · sin día de pago'}</span>
              </button>
              <span className="puntos" aria-hidden />
              <span className="fila-monto num">{pesos(f.monto)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="vacio-caja"><Check size={18} aria-hidden /><p>Agrega lo que pagas sí o sí cada mes: arriendo, mercado, gimnasio, plan de datos…</p></div>
      )}
    </section>
  );
}
