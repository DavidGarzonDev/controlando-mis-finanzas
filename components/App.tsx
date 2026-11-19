'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { borrar, guardarDeuda, guardarFijo, guardarGasto, guardarIngreso } from '@/app/actions';
import { CATEGORIAS } from '@/lib/categorias';
import type { Deuda, Fijo, Gasto, Ingreso, Resumen } from '@/lib/datos';

type Props = { resumen: Resumen; gastos: Gasto[]; ingresos: Ingreso[]; deudas: Deuda[]; fijos: Fijo[] };
type Tab = 'inicio' | 'gastos' | 'deudas' | 'ingresos';
type Editor =
  | { tipo: 'gasto'; item?: Gasto }
  | { tipo: 'ingreso'; item?: Ingreso }
  | { tipo: 'deuda'; item?: Deuda }
  | { tipo: 'fijo'; item?: Fijo };

const pesos = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const COLOR_CAT: Record<string, string> = {
  Comida: 'var(--c1)', Transporte: 'var(--c2)', Salidas: 'var(--c3)', Compras: 'var(--c4)',
  Hogar: 'var(--c5)', Servicios: 'var(--c6)', Salud: 'var(--c7)', Otros: 'var(--c8)',
};
const ICONO_CAT: Record<string, string> = {
  Comida: '🍽️', Transporte: '🛵', Salidas: '🎉', Compras: '🛍️', Hogar: '🏠', Servicios: '📶', Salud: '💊', Otros: '•',
};

function fechaCorta(f: string | Date) {
  const d = new Date(f);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return 'Hoy';
  if (mismoDia(d, ayer)) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function App({ resumen: r, gastos, ingresos, deudas, fijos }: Props) {
  const [tab, setTab] = useState<Tab>('inicio');
  const [editor, setEditor] = useState<Editor | null>(null);
  const mes = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const deudasActivas = deudas.filter((d) => d.saldo > 0);
  const totalSaldo = deudasActivas.reduce((s, d) => s + d.saldo, 0);
  const totalFijos = fijos.reduce((s, f) => s + f.monto, 0);

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">{mes}</p>
          <h1>Mis Finanzas</h1>
        </div>
        <button className="btn primary" onClick={() => setEditor({ tipo: 'gasto' })}>
          <span aria-hidden>＋</span> Gasto
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {([
          ['inicio', 'Inicio'],
          ['gastos', 'Gastos'],
          ['deudas', 'Deudas'],
          ['ingresos', 'Ingresos'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'inicio' && (
        <main className="stack">
          <section className="hero card">
            <p className="label">Te queda libre este mes</p>
            <p className={r.disponible < 0 ? 'big neg' : 'big'}>{pesos(r.disponible)}</p>
            {r.disponible > 0 ? (
              <p className="muted">
                Puedes gastar <b>{pesos(r.porDia)}</b> por día durante los próximos {r.diasRestantes} días.
              </p>
            ) : (
              <p className="muted">Tus compromisos de este mes ya superan tus ingresos registrados.</p>
            )}
            <Distribucion r={r} />
          </section>

          {deudasActivas[0] && (
            <section>
              <div className="sec-head">
                <h2>Siguiente deuda a atacar</h2>
                <button className="link" onClick={() => setTab('deudas')}>Ver todas</button>
              </div>
              <FilaDeuda d={deudasActivas[0]} rank={1} onClick={() => setEditor({ tipo: 'deuda', item: deudasActivas[0] })} />
            </section>
          )}

          <section>
            <div className="sec-head"><h2>En qué se va tu plata</h2></div>
            {r.porCategoria.length ? (
              <div className="card cats">
                {r.porCategoria.map((c) => (
                  <div className="cat" key={c.categoria}>
                    <span className="cat-name"><span aria-hidden>{ICONO_CAT[c.categoria] ?? '•'}</span> {c.categoria}</span>
                    <div className="track">
                      <div className="fill" style={{ width: `${(c.total / r.porCategoria[0].total) * 100}%`, background: COLOR_CAT[c.categoria] ?? 'var(--c8)' }} />
                    </div>
                    <span className="num">{pesos(c.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Vacio>Aún no hay gastos este mes. Escríbele al bot de Telegram o toca «＋ Gasto».</Vacio>
            )}
          </section>

          <section>
            <div className="sec-head">
              <h2>Últimos gastos</h2>
              <button className="link" onClick={() => setTab('gastos')}>Ver todos</button>
            </div>
            <ListaGastos gastos={gastos.slice(0, 5)} onEdit={(g) => setEditor({ tipo: 'gasto', item: g })} />
          </section>
        </main>
      )}

      {tab === 'gastos' && (
        <main className="stack">
          <section>
            <div className="sec-head">
              <div><h2>Gastos del mes</h2><p className="muted sm">Total: <b>{pesos(r.variables)}</b></p></div>
              <button className="btn sm" onClick={() => setEditor({ tipo: 'gasto' })}>＋ Agregar</button>
            </div>
            <ListaGastos gastos={gastos} agrupar onEdit={(g) => setEditor({ tipo: 'gasto', item: g })} />
          </section>
          <section>
            <div className="sec-head">
              <div><h2>Gastos fijos</h2><p className="muted sm">Al mes: <b>{pesos(totalFijos)}</b></p></div>
              <button className="btn sm" onClick={() => setEditor({ tipo: 'fijo' })}>＋ Agregar</button>
            </div>
            {fijos.length ? (
              <div className="list">
                {fijos.map((f) => (
                  <button key={f.id} className="item" onClick={() => setEditor({ tipo: 'fijo', item: f })}>
                    <div className="main"><div className="name">{f.concepto}</div></div>
                    <div className="amt">{pesos(f.monto)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <Vacio>Agrega lo que pagas sí o sí cada mes: comida de la casa, gimnasio, plan de datos…</Vacio>
            )}
          </section>
        </main>
      )}

      {tab === 'deudas' && (
        <main className="stack">
          <div className="stats">
            <div className="card stat"><p className="label">Debes en total</p><p className="mid">{pesos(totalSaldo)}</p></div>
            <div className="card stat"><p className="label">Cuotas al mes</p><p className="mid">{pesos(r.cuotas)}</p></div>
          </div>
          <section>
            <div className="sec-head">
              <h2>Orden de ataque</h2>
              <button className="btn sm" onClick={() => setEditor({ tipo: 'deuda' })}>＋ Nueva</button>
            </div>
            <p className="muted sm">Paga la cuota de todas, y cualquier plata extra va a la primera. Desde Telegram: <code>/abono nequi 50000</code></p>
            {deudas.length ? (
              <div className="list">
                {deudas.map((d, i) => (
                  <FilaDeuda key={d.id} d={d} rank={i + 1} onClick={() => setEditor({ tipo: 'deuda', item: d })} />
                ))}
              </div>
            ) : (
              <Vacio>No tienes deudas registradas 🎉</Vacio>
            )}
          </section>
        </main>
      )}

      {tab === 'ingresos' && (
        <main className="stack">
          <section>
            <div className="sec-head">
              <div><h2>Ingresos del mes</h2><p className="muted sm">Total: <b>{pesos(r.ingresos)}</b></p></div>
              <button className="btn sm" onClick={() => setEditor({ tipo: 'ingreso' })}>＋ Agregar</button>
            </div>
            {ingresos.length ? (
              <div className="list">
                {ingresos.map((i) => (
                  <button key={i.id} className="item" onClick={() => setEditor({ tipo: 'ingreso', item: i })}>
                    <div className="main"><div className="name">{i.concepto}</div><div className="sub">{fechaCorta(i.fecha)}</div></div>
                    <div className="amt pos">+{pesos(i.monto)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <Vacio>Registra cada pago que recibes. Desde Telegram: <code>me pagaron 1100000</code></Vacio>
            )}
          </section>
        </main>
      )}

      {editor && <ModalEditor editor={editor} cerrar={() => setEditor(null)} />}
    </div>
  );
}

function Distribucion({ r }: { r: Resumen }) {
  const partes = [
    { k: 'Deudas', v: r.cuotas, c: 'var(--c3)' },
    { k: 'Fijos', v: r.fijos, c: 'var(--c2)' },
    { k: 'Variables', v: r.variables, c: 'var(--c1)' },
    { k: 'Libre', v: Math.max(0, r.disponible), c: 'var(--ok)' },
  ];
  const total = partes.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <>
      <div className="bar" role="img" aria-label="Distribución de tus ingresos del mes">
        {partes.map((p) => <span key={p.k} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />)}
      </div>
      <div className="legend">
        {partes.map((p) => (
          <div key={p.k} className="lg">
            <span className="dot" style={{ background: p.c }} />
            <div><small>{p.k}</small><b>{pesos(p.v)}</b></div>
          </div>
        ))}
      </div>
      <p className="foot">Ingresos del mes: <b>{pesos(r.ingresos)}</b></p>
    </>
  );
}

function FilaDeuda({ d, rank, onClick }: { d: Deuda; rank: number; onClick: () => void }) {
  return (
    <button className={rank === 1 && d.saldo > 0 ? 'item first' : 'item'} onClick={onClick}>
      <span className="rank">{rank}</span>
      <div className="main">
        <div className="name">
          {d.nombre}
          {rank === 1 && d.saldo > 0 && <span className="chip alert">Pagar primero</span>}
          {d.saldo === 0 && <span className="chip ok">Pagada</span>}
        </div>
        <div className="sub">Cuota {pesos(d.cuota)}{d.tasa ? ` · ${d.tasa}` : ''}</div>
      </div>
      <div className="amt">{pesos(d.saldo)}<small>saldo</small></div>
    </button>
  );
}

function ListaGastos({ gastos, agrupar, onEdit }: { gastos: Gasto[]; agrupar?: boolean; onEdit: (g: Gasto) => void }) {
  const grupos = useMemo(() => {
    if (!agrupar) return [['', gastos]] as [string, Gasto[]][];
    const m = new Map<string, Gasto[]>();
    for (const g of gastos) {
      const k = fechaCorta(g.fecha);
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return [...m.entries()];
  }, [gastos, agrupar]);

  if (!gastos.length) return <Vacio>Sin gastos todavía este mes.</Vacio>;
  return (
    <div className="stack sm-gap">
      {grupos.map(([dia, gs]) => (
        <div key={dia || 'todos'}>
          {dia && <p className="day">{dia}<span>{pesos(gs.reduce((s, g) => s + g.monto, 0))}</span></p>}
          <div className="list">
            {gs.map((g) => (
              <button key={g.id} className="item" onClick={() => onEdit(g)}>
                <span className="ico" style={{ background: COLOR_CAT[g.categoria] ?? 'var(--c8)' }} aria-hidden>{ICONO_CAT[g.categoria] ?? '•'}</span>
                <div className="main">
                  <div className="name">{g.concepto}</div>
                  <div className="sub">{g.categoria}{!agrupar ? ` · ${fechaCorta(g.fecha)}` : ''}{g.origen === 'telegram' ? ' · Telegram' : ''}</div>
                </div>
                <div className="amt">−{pesos(g.monto)}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------- Modales ----------

function Guardar() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn primary grow" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button>;
}

function ModalEditor({ editor, cerrar }: { editor: Editor; cerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const item = editor.item as any;
  const esEdicion = !!item?.id;
  const titulos = {
    gasto: ['Registrar gasto', 'Editar gasto'],
    ingreso: ['Nuevo ingreso', 'Editar ingreso'],
    deuda: ['Nueva deuda', 'Editar deuda'],
    fijo: ['Nuevo gasto fijo', 'Editar gasto fijo'],
  }[editor.tipo];
  const accion = { gasto: guardarGasto, ingreso: guardarIngreso, deuda: guardarDeuda, fijo: guardarFijo }[editor.tipo];

  async function eliminar() {
    if (!confirmar) return setConfirmar(true);
    setBorrando(true);
    await borrar(editor.tipo, item.id);
    cerrar();
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={cerrar}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      <form action={async (fd) => { await accion(fd); ref.current?.close(); }}>
        <input type="hidden" name="id" defaultValue={item?.id ?? ''} />
        <div className="modal-head">
          <h3>{titulos[esEdicion ? 1 : 0]}</h3>
          <button type="button" className="x" aria-label="Cerrar" onClick={() => ref.current?.close()}>✕</button>
        </div>

        {editor.tipo === 'gasto' && (
          <>
            <Campo label="¿En qué gastaste?"><input name="concepto" required defaultValue={item?.concepto} placeholder="Almuerzo" autoFocus /></Campo>
            <Campo label="Monto"><MontoInput name="monto" defaultValue={item?.monto} /></Campo>
            <fieldset className="chips">
              <legend>Categoría</legend>
              {CATEGORIAS.map((c) => (
                <label key={c} className="chip-opt">
                  <input type="radio" name="categoria" value={c} defaultChecked={(item?.categoria ?? 'Comida') === c} />
                  <span>{ICONO_CAT[c]} {c}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {editor.tipo === 'ingreso' && (
          <>
            <Campo label="Concepto"><input name="concepto" required defaultValue={item?.concepto} placeholder="Sueldo quincena" autoFocus /></Campo>
            <Campo label="Monto"><MontoInput name="monto" defaultValue={item?.monto} /></Campo>
          </>
        )}

        {editor.tipo === 'fijo' && (
          <>
            <Campo label="Concepto"><input name="concepto" required defaultValue={item?.concepto} placeholder="Gimnasio" autoFocus /></Campo>
            <Campo label="Monto al mes"><MontoInput name="monto" defaultValue={item?.monto} /></Campo>
          </>
        )}

        {editor.tipo === 'deuda' && (
          <>
            <Campo label="Nombre"><input name="nombre" required defaultValue={item?.nombre} placeholder="Nequi" autoFocus /></Campo>
            <div className="row2">
              <Campo label="Saldo que debes"><MontoInput name="saldo" defaultValue={item?.saldo} /></Campo>
              <Campo label="Cuota al mes"><MontoInput name="cuota" defaultValue={item?.cuota} /></Campo>
            </div>
            <div className="row2">
              <Campo label="Tasa de interés"><input name="tasa" defaultValue={item?.tasa ?? ''} placeholder="35.9% E.A." /></Campo>
              <Campo label="Prioridad" help="1 = pagar primero">
                <input name="prioridad" type="number" min={1} inputMode="numeric" defaultValue={item?.prioridad ?? ''} placeholder="1" />
              </Campo>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
          <Guardar />
        </div>
        {esEdicion && (
          <button type="button" className={confirmar ? 'btn danger solid' : 'btn danger'} onClick={eliminar} disabled={borrando}>
            {borrando ? 'Eliminando…' : confirmar ? 'Toca otra vez para confirmar' : 'Eliminar'}
          </button>
        )}
      </form>
    </dialog>
  );
}

function Campo({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

/** Campo de dinero que muestra los puntos de miles mientras escribes. */
function MontoInput({ name, defaultValue }: { name: string; defaultValue?: number }) {
  const [v, setV] = useState(defaultValue ? Math.round(defaultValue).toLocaleString('es-CO') : '');
  return (
    <div className="money">
      <span>$</span>
      <input
        name={name}
        inputMode="numeric"
        required
        value={v}
        placeholder="0"
        onChange={(e) => {
          const solo = e.target.value.replace(/\D/g, '');
          setV(solo ? Number(solo).toLocaleString('es-CO') : '');
        }}
      />
    </div>
  );
}
