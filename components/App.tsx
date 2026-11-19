'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeftRight, CalendarCheck, Check, ChevronRight, CircleAlert, CircleCheck, LayoutDashboard, WalletCards,
  Lightbulb, Plus, Send, TriangleAlert,
} from 'lucide-react';
import { marcarFijo } from '@/app/actions';
import type { Consejo, Nivel } from '@/lib/consejos';
import type { Cuenta, Deuda, Fijo, Gasto, Ingreso, MesHistorial, MovCredito, Pendiente, Resumen as TResumen } from '@/lib/datos';
import type { Hoy } from '@/lib/fechas';
import { BarrasHistorial, Calendario, CurvaMes } from './graficas';
import { Creditos } from './Creditos';
import { Contador, conTransicion } from './animacion';
import { BotonTema } from './Tema';
import { Modal, type Editor } from './Modal';
import { COLOR_CAT, ICONO_CAT, claveDia, fechaCorta, hora, mesCortoDe, nombreMes, pesos } from './util';

type Props = {
  resumen: TResumen; gastos: Gasto[]; ingresos: Ingreso[]; deudas: Deuda[]; fijos: Fijo[];
  porDia: number[]; historial: MesHistorial[]; consejos: Consejo[]; hoy: Hoy;
  movCredito: Record<number, MovCredito[]>; cuentas: Cuenta[];
};
type Tab = 'resumen' | 'movimientos' | 'billetera' | 'fijos';

const TABS: { id: Tab; label: string; Icono: typeof LayoutDashboard }[] = [
  { id: 'resumen', label: 'Resumen', Icono: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', Icono: ArrowLeftRight },
  { id: 'billetera', label: 'Billetera', Icono: WalletCards },
  { id: 'fijos', label: 'Fijos', Icono: CalendarCheck },
];

export default function App(p: Props) {
  const [tab, setTab] = useState<Tab>('resumen');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // La pestaña vive en la URL (#deudas) para que el botón atrás y recargar funcionen.
  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.slice(1) as Tab;
      setTab(TABS.some((t) => t.id === h) ? h : 'resumen');
    };
    leer();
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, []);

  const ir = useCallback((t: Tab) => {
    if (t === tab) return;
    history.pushState(null, '', t === 'resumen' ? window.location.pathname : `#${t}`);
    conTransicion(() => flushSync(() => setTab(t)));
    window.scrollTo({ top: 0 });
  }, [tab]);

  const avisar = useCallback((texto: string) => setAviso({ texto, n: Date.now() }), []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  function teclaTabs(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const sig = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (sig === null) return;
    e.preventDefault();
    const t = TABS[(sig + TABS.length) % TABS.length];
    ir(t.id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${t.id}"]`)?.focus();
  }

  const hoyClave = `${p.hoy.anio}-${String(p.hoy.mes).padStart(2, '0')}-${String(p.hoy.dia).padStart(2, '0')}`;

  return (
    <div className="app">
      <div className="franja-colombia" aria-hidden />
      <header className="barra">
        <div className="marca">
          <span className="marca-sello" aria-hidden><i /><i /><i /></span>
          <div>
            <h1>Mis Finanzas</h1>
            <p>{nombreMes(p.hoy.mes)} {p.hoy.anio}<span className="solo-ancho"> · pesos colombianos</span></p>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Secciones" ref={tabsRef} onKeyDown={teclaTabs}>
          {TABS.map(({ id, label, Icono }) => (
            <button
              key={id}
              data-tab={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className="tab"
              onClick={() => ir(id)}
            >
              <Icono size={20} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <BotonTema avisar={avisar} />
        <button className="btn primario registrar" aria-label="Registrar" onClick={() => setEditor({ tipo: 'nuevo', modo: 'gasto' })}>
          <Plus size={20} aria-hidden /> <span>Registrar</span>
        </button>
      </header>

      <main id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="panel" key={tab}>
        {tab === 'resumen' && <Resumen {...p} abrir={setEditor} ir={ir} avisar={avisar} />}
        {tab === 'movimientos' && <Movimientos gastos={p.gastos} ingresos={p.ingresos} r={p.resumen} hoyClave={hoyClave} abrir={setEditor} />}
        {tab === 'billetera' && <Creditos deudas={p.deudas} cuentas={p.cuentas} r={p.resumen} mov={p.movCredito} hoyClave={hoyClave} abrir={setEditor} />}
        {tab === 'fijos' && <Fijos fijos={p.fijos} abrir={setEditor} avisar={avisar} />}
      </main>

      {editor && <Modal editor={editor} cerrar={() => setEditor(null)} avisar={avisar} />}

      <div className="aviso-zona" aria-live="polite">
        {aviso && (
          <p className="aviso" key={aviso.n}>
            <Check size={18} aria-hidden /> {aviso.texto}
          </p>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Resumen

function Resumen({ resumen: r, gastos, deudas, porDia, historial, consejos, hoy, abrir, ir, avisar }: Props & {
  abrir: (e: Editor) => void; ir: (t: Tab) => void; avisar: (m: string) => void;
}) {
  const presupuestoMes = Math.max(0, r.ingresos - r.cuotas - r.fijos - r.extraAbonos);
  const limiteDiario = presupuestoMes / hoy.diasMes;

  return (
    <div className="rejilla">
      <div className="col-principal">
        <Medidor r={r} abrir={abrir} />

        <section className="bloque" aria-labelledby="t-mes">
          <div className="bloque-cab">
            <h2 id="t-mes">Cómo va el mes</h2>
            <p className="sub">
              Gastado <b className="num">{pesos(r.variables)}</b>
              {presupuestoMes > 0 && <> de <b className="num">{pesos(presupuestoMes)}</b> para el día a día</>}
            </p>
          </div>
          {r.variables > 0 || presupuestoMes > 0 ? (
            <CurvaMes porDia={porDia} diaHoy={hoy.dia} presupuestoMes={presupuestoMes} />
          ) : (
            <Vacio>Cuando registres gastos verás aquí cómo avanzas contra lo que te alcanza.</Vacio>
          )}
        </section>

        <section className="bloque" aria-labelledby="t-cat">
          <div className="bloque-cab">
            <h2 id="t-cat">En qué se va tu plata</h2>
            {r.porCategoriaMesAnterior.length > 0 && <p className="sub">Comparado con todo {nombreMes(hoy.mes === 1 ? 12 : hoy.mes - 1)}</p>}
          </div>
          <Categorias r={r} />
        </section>

        <section className="bloque" aria-labelledby="t-cal">
          <div className="bloque-cab">
            <h2 id="t-cal">Día a día</h2>
            {limiteDiario > 0 && <p className="sub">Para que alcance: unos <b className="num">{pesos(limiteDiario)}</b> por día</p>}
          </div>
          <Calendario porDia={porDia} anio={hoy.anio} mes={hoy.mes} diaHoy={hoy.dia} limite={limiteDiario} />
        </section>
      </div>

      <aside className="col-lateral">
        <section className="bloque" aria-labelledby="t-consejos">
          <div className="bloque-cab"><h2 id="t-consejos">Recomendaciones</h2></div>
          <Consejos consejos={consejos} />
        </section>

        <section className="bloque" aria-labelledby="t-pend">
          <div className="bloque-cab">
            <h2 id="t-pend">Por pagar este mes</h2>
            {r.totalPendiente > 0 && <p className="sub"><b className="num">{pesos(r.totalPendiente)}</b> en total</p>}
          </div>
          <Pendientes r={r} deudas={deudas} abrir={abrir} avisar={avisar} ir={ir} />
        </section>

        <section className="bloque" aria-labelledby="t-ult">
          <div className="bloque-cab">
            <h2 id="t-ult">Últimos movimientos</h2>
            <button className="enlace" onClick={() => ir('movimientos')}>Ver todos <ChevronRight size={16} aria-hidden /></button>
          </div>
          {gastos.length ? (
            <ul className="libro">
              {gastos.slice(0, 5).map((g) => <FilaGasto key={g.id} g={g} sub={`${g.categoria} · ${hora(g.fecha)}`} abrir={abrir} />)}
            </ul>
          ) : (
            <Vacio>
              Escríbele al bot <code>almuerzo 15 mil</code> o toca <b>Registrar</b>.
            </Vacio>
          )}
        </section>

        <section className="bloque" aria-labelledby="t-hist">
          <div className="bloque-cab"><h2 id="t-hist">Últimos 6 meses</h2></div>
          {historial.some((h) => h.ingresos || h.gastos) ? (
            <BarrasHistorial historial={historial} />
          ) : (
            <Vacio>Aquí verás cada mes lo que te entró contra lo que gastaste.</Vacio>
          )}
        </section>
      </aside>
    </div>
  );
}

function Medidor({ r, abrir }: { r: TResumen; abrir: (e: Editor) => void }) {
  const pago = r.proximoPago;
  const fechaPago = `${pago.dia} de ${mesCortoDe(pago.mes)}`;

  if (r.ingresos === 0) {
    return (
      <section className="medidor vacio" aria-labelledby="t-hoy">
        <h2 id="t-hoy" className="medidor-titulo">Empieza por lo que te entra</h2>
        <p className="medidor-texto">
          Con tus ingresos calculo cuánto puedes gastar cada día hasta el próximo pago ({fechaPago}).
          Escríbele al bot <code>me pagaron 1.100.000</code> o <code>tengo 300 mil en efectivo</code>.
        </p>
        <button className="btn primario" onClick={() => abrir({ tipo: 'nuevo', modo: 'ingreso' })}>
          <Plus size={18} aria-hidden /> Registrar un ingreso
        </button>
      </section>
    );
  }

  if (r.disponible < 0) {
    return (
      <section className="medidor rojo" aria-labelledby="t-hoy">
        <p className="medidor-etiqueta" id="t-hoy">Este mes vas por encima</p>
        <p className="medidor-cifra num"><Contador valor={-r.disponible} /></p>
        <p className="medidor-texto">
          Lo que debes pagar y lo que has gastado ya supera lo que te ha entrado. Hasta el {fechaPago} gasta solo en lo necesario.
        </p>
        <Datos r={r} fechaPago={fechaPago} />
      </section>
    );
  }

  const limite = r.presupuestoHoy;
  const queda = limite - r.gastadoHoy;
  const ratio = limite > 0 ? Math.min(r.gastadoHoy / limite, 1) : r.gastadoHoy > 0 ? 1 : 0;
  const estado = queda < 0 ? 'sobre' : ratio > 0.8 ? 'cerca' : 'bien';

  return (
    <section className={`medidor ${estado}`} aria-labelledby="t-hoy">
      <p className="medidor-etiqueta" id="t-hoy">Hoy puedes gastar</p>
      <p className="medidor-cifra num"><Contador valor={limite} /></p>
      <div
        className="medidor-pista"
        role="meter"
        aria-label="Gastado hoy"
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(r.gastadoHoy, limite)}
        aria-valuetext={`${pesos(r.gastadoHoy)} de ${pesos(limite)}`}
      >
        <span className="medidor-relleno" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="medidor-pie">
        <span>Llevas <b className="num">{pesos(r.gastadoHoy)}</b></span>
        {queda >= 0 ? (
          <span>Te quedan <b className="num">{pesos(queda)}</b></span>
        ) : (
          <span className="neg"><TriangleAlert size={16} aria-hidden /> Te pasaste <b className="num">{pesos(-queda)}</b></span>
        )}
      </div>
      <Datos r={r} fechaPago={fechaPago} />
    </section>
  );
}

function Datos({ r, fechaPago }: { r: TResumen; fechaPago: string }) {
  return (
    <dl className="datos">
      <div><dt>Libre en el mes</dt><dd className="num"><Contador valor={r.disponible} /></dd></div>
      <div><dt>Próximo pago</dt><dd>{fechaPago} <small>· en {r.proximoPago.dias} {r.proximoPago.dias === 1 ? 'día' : 'días'}</small></dd></div>
      <div><dt>Ingresos del mes</dt><dd className="num">{pesos(r.ingresos)}</dd></div>
    </dl>
  );
}

function Categorias({ r }: { r: TResumen }) {
  if (!r.porCategoria.length) return <Vacio>Aún no hay gastos este mes. Cada gasto se clasifica solo: comida, transporte, salidas…</Vacio>;
  const max = Math.max(...r.porCategoria.map((c) => c.total), ...r.porCategoriaMesAnterior.map((c) => c.total));
  return (
    <ul className="cats">
      {r.porCategoria.map((c) => {
        const Icono = ICONO_CAT[c.categoria] ?? ICONO_CAT.Otros;
        const ant = r.porCategoriaMesAnterior.find((x) => x.categoria === c.categoria)?.total;
        const pct = Math.round((c.total / r.variables) * 100);
        return (
          <li key={c.categoria} style={{ '--c': COLOR_CAT[c.categoria] ?? 'var(--s-otros)' } as React.CSSProperties}>
            <span className="cat-ico"><Icono size={16} aria-hidden /></span>
            <span className="cat-nombre">{c.categoria}<small>{pct} %</small></span>
            <span className="cat-pista" aria-hidden>
              <span className="cat-barra" style={{ width: `${(c.total / max) * 100}%` }} />
              {ant ? <span className="cat-antes" style={{ left: `${(ant / max) * 100}%` }} title={`Mes pasado: ${pesos(ant)}`} /> : null}
            </span>
            <span className="cat-monto num">
              {pesos(c.total)}
              <small>{ant ? `mes pasado ${pesos(ant)}` : 'nuevo este mes'}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const ICONO_NIVEL: Record<Nivel, typeof Lightbulb> = { alerta: CircleAlert, aviso: TriangleAlert, idea: Lightbulb, bien: CircleCheck };
const NOMBRE_NIVEL: Record<Nivel, string> = { alerta: 'Urgente', aviso: 'Atención', idea: 'Idea', bien: 'Bien' };

function Consejos({ consejos }: { consejos: Consejo[] }) {
  const [todos, setTodos] = useState(false);
  if (!consejos.length) return <Vacio>Todo en orden por ahora. A medida que registres movimientos te daré ideas.</Vacio>;
  const visibles = todos ? consejos : consejos.slice(0, 3);
  return (
    <>
      <ul className="consejos">
        {visibles.map((c) => {
          const Icono = ICONO_NIVEL[c.nivel];
          return (
            <li key={c.id} className={`consejo n-${c.nivel}`}>
              <Icono size={20} aria-hidden className="consejo-ico" />
              <div>
                <p className="consejo-titulo"><span className="sr">{NOMBRE_NIVEL[c.nivel]}: </span>{c.titulo}</p>
                <p className="consejo-texto">{c.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {consejos.length > 3 && (
        <button className="enlace" onClick={() => setTodos(!todos)} aria-expanded={todos}>
          {todos ? 'Ver menos' : `Ver ${consejos.length - 3} más`}
        </button>
      )}
    </>
  );
}

function Pendientes({ r, deudas, abrir, avisar, ir }: {
  r: TResumen; deudas: Deuda[]; abrir: (e: Editor) => void; avisar: (m: string) => void; ir: (t: Tab) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);
  if (!r.pendientes.length) {
    return <Vacio>{r.cuotas + r.fijos > 0 ? 'Ya pagaste todas las cuotas y fijos de este mes.' : <>Agrega tus <button className="enlace" onClick={() => ir('fijos')}>gastos fijos</button> y <button className="enlace" onClick={() => ir('billetera')}>créditos</button> para saber qué te falta pagar.</>}</Vacio>;
  }
  function pagar(p: Pendiente) {
    if (p.tipo === 'cuota') {
      const d = deudas.find((x) => x.id === p.id);
      if (d) abrir({ tipo: 'abono', item: d });
      return;
    }
    setHecho(`${p.tipo}-${p.id}`);
    iniciar(async () => {
      await marcarFijo(p.id, true);
      avisar(`${p.nombre} pagado`);
    });
  }
  return (
    <ul className="libro">
      {r.pendientes.map((p) => {
        const clave = `${p.tipo}-${p.id}`;
        const marcando = pendiente && hecho === clave;
        return (
          <li key={clave} className="fila">
            <button className="check" onClick={() => pagar(p)} disabled={marcando} aria-label={p.tipo === 'cuota' ? `Registrar pago de la cuota de ${p.nombre}` : `Marcar ${p.nombre} como pagado`}>
              {marcando ? <Check size={16} aria-hidden /> : null}
            </button>
            <span className="fila-txt">
              <span className="fila-nombre">{p.nombre}</span>
              <span className="fila-sub">{p.tipo === 'cuota' ? 'Cuota de deuda' : 'Gasto fijo'}</span>
            </span>
            <span className="puntos" aria-hidden />
            <span className="fila-monto num">{pesos(p.monto)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ===========================================================================
// Movimientos

function Movimientos({ gastos, ingresos, r, hoyClave, abrir }: {
  gastos: Gasto[]; ingresos: Ingreso[]; r: TResumen; hoyClave: string; abrir: (e: Editor) => void;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'gastos' | 'ingresos'>('todos');
  const [cat, setCat] = useState<string | null>(null);
  const cats = useMemo(() => [...new Set(gastos.map((g) => g.categoria))], [gastos]);

  const filas = useMemo(() => {
    type Fila = { tipo: 'gasto'; g: Gasto; fecha: string } | { tipo: 'ingreso'; i: Ingreso; fecha: string };
    const lista: Fila[] = [
      ...(filtro !== 'ingresos' ? gastos.filter((g) => !cat || g.categoria === cat).map((g) => ({ tipo: 'gasto' as const, g, fecha: g.fecha })) : []),
      ...(filtro !== 'gastos' && !cat ? ingresos.map((i) => ({ tipo: 'ingreso' as const, i, fecha: i.fecha })) : []),
    ].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
    const grupos = new Map<string, Fila[]>();
    for (const f of lista) {
      const k = claveDia(f.fecha);
      grupos.set(k, [...(grupos.get(k) ?? []), f]);
    }
    return [...grupos.entries()];
  }, [gastos, ingresos, filtro, cat]);

  return (
    <div className="columna">
      <div className="resumen-linea">
        <div><span>Entró</span><b className="num pos">+<Contador valor={r.ingresos} /></b></div>
        <div><span>Gastado</span><b className="num">−<Contador valor={r.variables} /></b></div>
        <div><span>Movimientos</span><b className="num">{gastos.length + ingresos.length}</b></div>
      </div>

      <div className="filtros">
        <div className="segmento chico" role="radiogroup" aria-label="Mostrar">
          {(['todos', 'gastos', 'ingresos'] as const).map((f) => (
            <label key={f} className={filtro === f ? 'on' : ''}>
              <input type="radio" name="filtro" checked={filtro === f} onChange={() => { setFiltro(f); if (f === 'ingresos') setCat(null); }} />
              {f === 'todos' ? 'Todos' : f === 'gastos' ? 'Gastos' : 'Ingresos'}
            </label>
          ))}
        </div>
        {filtro !== 'ingresos' && cats.length > 1 && (
          <div className="chips" aria-label="Filtrar por categoría">
            {cats.map((c) => (
              <button key={c} className={cat === c ? 'chip on' : 'chip'} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}
                style={{ '--c': COLOR_CAT[c] ?? 'var(--s-otros)' } as React.CSSProperties}>
                <i className="punto-cat" aria-hidden /> {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {filas.length ? (
        filas.map(([dia, fs]) => {
          const neto = fs.reduce((s, f) => s + (f.tipo === 'gasto' ? -f.g.monto : f.i.monto), 0);
          return (
            <section key={dia} className="dia" aria-label={fechaCorta(fs[0].fecha, hoyClave)}>
              <h3 className="dia-cab">
                <span>{fechaCorta(fs[0].fecha, hoyClave)}</span>
                <span className={`num ${neto > 0 ? 'pos' : ''}`}>{neto > 0 ? '+' : ''}{pesos(neto)}</span>
              </h3>
              <ul className="libro">
                {fs.map((f) =>
                  f.tipo === 'gasto' ? (
                    <FilaGasto key={`g${f.g.id}`} g={f.g} sub={`${f.g.categoria} · ${hora(f.g.fecha)}${f.g.origen === 'telegram' ? ' · Telegram' : ''}`} abrir={abrir} />
                  ) : (
                    <li key={`i${f.i.id}`}>
                      <button className="fila" onClick={() => abrir({ tipo: 'ingreso', item: f.i })}>
                        <span className="fila-ico ingreso" aria-hidden><Plus size={16} /></span>
                        <span className="fila-txt">
                          <span className="fila-nombre">{f.i.concepto}</span>
                          <span className="fila-sub">Ingreso · {hora(f.i.fecha)}</span>
                        </span>
                        <span className="puntos" aria-hidden />
                        <span className="fila-monto num pos">+{pesos(f.i.monto)}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </section>
          );
        })
      ) : (
        <Vacio>
          {filtro === 'ingresos' ? 'Sin ingresos este mes. Escríbele al bot me pagaron 1100000.' : 'Sin movimientos este mes. Escríbele al bot almuerzo 15 mil o toca Registrar.'}
        </Vacio>
      )}
    </div>
  );
}

function FilaGasto({ g, sub, abrir }: { g: Gasto; sub: string; abrir: (e: Editor) => void }) {
  const Icono = ICONO_CAT[g.categoria] ?? ICONO_CAT.Otros;
  return (
    <li>
      <button className="fila" onClick={() => abrir({ tipo: 'gasto', item: g })} style={{ '--c': COLOR_CAT[g.categoria] ?? 'var(--s-otros)' } as React.CSSProperties}>
        <span className="fila-ico" aria-hidden><Icono size={16} /></span>
        <span className="fila-txt">
          <span className="fila-nombre">{g.concepto}</span>
          <span className="fila-sub">{sub}</span>
        </span>
        <span className="puntos" aria-hidden />
        <span className="fila-monto num">−{pesos(g.monto)}</span>
      </button>
    </li>
  );
}

// ===========================================================================
// Fijos

function Fijos({ fijos, abrir, avisar }: { fijos: Fijo[]; abrir: (e: Editor) => void; avisar: (m: string) => void }) {
  const [, iniciar] = useTransition();
  const [optimista, setOptimista] = useState<Record<number, boolean>>({});
  const pagado = (f: Fijo) => optimista[f.id] ?? f.pagadoMes;
  const total = fijos.reduce((s, f) => s + f.monto, 0);
  const yaPagado = fijos.filter(pagado).reduce((s, f) => s + f.monto, 0);

  function alternar(f: Fijo) {
    const nuevo = !pagado(f);
    setOptimista((o) => ({ ...o, [f.id]: nuevo }));
    iniciar(async () => {
      try {
        await marcarFijo(f.id, nuevo);
        avisar(nuevo ? `${f.concepto} pagado` : `${f.concepto} pendiente`);
      } catch {
        setOptimista((o) => ({ ...o, [f.id]: !nuevo }));
        avisar('No se pudo guardar');
      }
    });
  }

  return (
    <div className="columna">
      <div className="resumen-linea">
        <div><span>Al mes</span><b className="num">{pesos(total)}</b></div>
        <div><span>Pagado</span><b className="num pos">{pesos(yaPagado)}</b></div>
        <div><span>Falta</span><b className="num">{pesos(total - yaPagado)}</b></div>
      </div>
      {total > 0 && (
        <div className="barra-prog" role="progressbar" aria-label="Gastos fijos pagados este mes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((yaPagado / total) * 100)}>
          <span style={{ width: `${(yaPagado / total) * 100}%` }} />
        </div>
      )}
      <div className="bloque-cab">
        <h2>Lo que pagas cada mes</h2>
        <button className="btn chico" onClick={() => abrir({ tipo: 'fijo' })}><Plus size={16} aria-hidden /> Agregar</button>
      </div>
      <p className="sub">Marca cada uno cuando lo pagues. El mes siguiente vuelven a quedar pendientes. Desde Telegram: <code>/pague gimnasio</code></p>
      {fijos.length ? (
        <ul className="libro">
          {fijos.map((f) => (
            <li key={f.id} className={pagado(f) ? 'fila hecha' : 'fila'}>
              <button className="check" aria-pressed={pagado(f)} onClick={() => alternar(f)} aria-label={`${f.concepto}: ${pagado(f) ? 'pagado' : 'pendiente'}`}>
                {pagado(f) && <Check size={16} aria-hidden />}
              </button>
              <button className="fila-txt como-enlace" onClick={() => abrir({ tipo: 'fijo', item: f })}>
                <span className="fila-nombre">{f.concepto}</span>
                <span className="fila-sub">{pagado(f) ? 'Pagado este mes' : 'Pendiente'}</span>
              </button>
              <span className="puntos" aria-hidden />
              <span className="fila-monto num">{pesos(f.monto)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Vacio>Agrega lo que pagas sí o sí cada mes: arriendo, mercado, gimnasio, plan de datos…</Vacio>
      )}
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="vacio-caja">
      <Send size={18} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
