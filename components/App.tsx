'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, ClipboardList, Download, Flame, LayoutDashboard, WalletCards,
  ChartPie, ChartSpline, Heart, Lightbulb, ListChecks, LogOut, Pencil, Trash2, Minus, PartyPopper, Plus, Repeat, Search, SearchX, Send, Sparkles, TrendingDown, TrendingUp, TriangleAlert,
} from 'lucide-react';
import { borrar, marcarFijo } from '@/app/actions';
import { comercioDe } from '@/lib/comercios';
import type { Consejo, Nivel } from '@/lib/consejos';
import type {
  Cuenta, Deuda, Fijo, Gasto, Hormiga, Ingreso, Meta, MesHistorial, MovCredito, Pendiente, PuntoPatrimonio, Resumen as TResumen,
  Suscripcion, Transferencia,
} from '@/lib/datos';
import type { Hoy } from '@/lib/fechas';
import { rachaLimite, type Reto } from '@/lib/retosComun';
import { BarrasHistorial, Calendario, Chispa, CurvaMes, Dona } from './graficas';
import { Creditos } from './Creditos';
import { Plan } from './Plan';
import { Contador } from './animacion';
import { BotonPrivado, BotonTema } from './Tema';
import { Modal, type Editor } from './Modal';
import { Paleta } from './Paleta';
import { confeti } from './Celebrar';
import { Historias } from './Historias';
import { AnioEnPilas } from './AnioEnPilas';
import { salir } from '@/app/entrar/acciones';
import { IconoCat } from './IconoCat';
import type { CategoriaPropia } from '@/lib/categorias';
import { claveDia, colorCat, registrarCategorias, fechaCorta, hora, mesCortoDe, nombreMes, pesos } from './util';

type Props = {
  mes: string; meses: string[];
  resumen: TResumen; gastos: Gasto[]; ingresos: Ingreso[]; deudas: Deuda[]; fijos: Fijo[];
  porDia: number[]; historial: MesHistorial[]; consejos: Consejo[]; hoy: Hoy;
  movCredito: Record<number, MovCredito[]>; cuentas: Cuenta[];
  metas: Meta[]; transferencias: Transferencia[]; hormiga: Hormiga[]; suscripciones: Suscripcion[]; patrimonio: PuntoPatrimonio[];
  retos: Reto[];
  categorias: CategoriaPropia[];
};
type Tab = 'resumen' | 'movimientos' | 'billetera' | 'plan';

const TABS: { id: Tab; label: string; Icono: typeof LayoutDashboard }[] = [
  { id: 'resumen', label: 'Resumen', Icono: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', Icono: ArrowLeftRight },
  { id: 'billetera', label: 'Billetera', Icono: WalletCards },
  { id: 'plan', label: 'Plan', Icono: ClipboardList },
];

/** Los avisos largos (alertas) duran más en pantalla para alcanzar a leerlos. */
const duracionAviso = (t: string) => Math.min(9000, Math.max(2600, t.length * 60));

export default function App(p: Props) {
  registrarCategorias(p.categorias);
  const [tab, setTab] = useState<Tab>('resumen');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const [paleta, setPaleta] = useState(false);
  const [historias, setHistorias] = useState(false);
  const [anio, setAnio] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Ctrl+K (o ⌘K) abre la paleta rápida desde cualquier parte.
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((v) => !v);
      }
    };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  // La pestaña vive en la URL (#deudas) para que el botón atrás y recargar funcionen.
  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.slice(1);
      const t = (h === 'fijos' ? 'plan' : h === 'deudas' ? 'billetera' : h) as Tab;
      setTab(TABS.some((x) => x.id === t) ? t : 'resumen');
    };
    leer();
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, []);

  const ir = useCallback((t: Tab) => {
    if (t === tab) return;
    history.pushState(null, '', `${window.location.pathname}${window.location.search}${t === 'resumen' ? '' : `#${t}`}`);
    // Sin transición de página: la barrita de la pestaña viaja y el contenido aparece con un fundido corto.
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTab(t);
  }, [tab]);

  // Las animaciones de entrada (tarjetas, filas) solo en la primera carga; al cambiar de pestaña no se repiten.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setListo(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Cambiar de mes sin recargar la página: se queda lo que ves (un poco atenuado) hasta que llega el mes nuevo.
  const router = useRouter();
  const [cambiandoMes, iniciarMes] = useTransition();
  const irMes = useCallback((href: string) => iniciarMes(() => router.push(href, { scroll: false })), [router]);

  // Barrita que se desliza hasta la pestaña activa
  const indicador = useRef<HTMLSpanElement>(null);
  const [indicadorListo, setIndicadorListo] = useState(false);
  useLayoutEffect(() => {
    const nav = tabsRef.current;
    const ind = indicador.current;
    if (!nav || !ind) return;
    const poner = () => {
      const b = nav.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (!b) return;
      ind.style.width = `${b.offsetWidth}px`;
      ind.style.height = `${b.offsetHeight}px`;
      ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
    };
    poner();
    const ro = new ResizeObserver(poner);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [tab]);
  useEffect(() => {
    const t = requestAnimationFrame(() => setIndicadorListo(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const avisar = useCallback((texto: string) => setAviso({ texto, n: Date.now() }), []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), duracionAviso(aviso.texto));
    return () => clearTimeout(t);
  }, [aviso]);

  function teclaTabs(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const sig = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (sig === null) return;
    e.preventDefault();
    const t = TABS[(sig + TABS.length) % TABS.length];
    ir(t.id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${t.id}"]`)?.focus();
  }

  // Celebraciones: meta cumplida, todo lo del mes pagado o reto logrado (confeti + vibración).
  const antes = useRef<{ metas: Map<number, boolean>; pendientes: number; retos: Map<number, string> } | null>(null);
  useEffect(() => {
    const ahora = {
      metas: new Map(p.metas.map((m) => [m.id, m.objetivo > 0 && m.ahorrado >= m.objetivo])),
      pendientes: p.resumen.esActual ? p.resumen.pendientes.length : -1,
      retos: new Map(p.retos.map((r) => [r.id, r.estado as string])),
    };
    const a = antes.current;
    antes.current = ahora;
    if (!a) return;
    const meta = p.metas.find((m) => ahora.metas.get(m.id) && a.metas.get(m.id) === false);
    const reto = p.retos.find((r) => r.estado === 'logrado' && a.retos.get(r.id) && a.retos.get(r.id) !== 'logrado');
    const alDia = a.pendientes > 0 && ahora.pendientes === 0;
    const motivo = meta ? `¡Cumpliste tu meta ${meta.nombre}! 🎉` : reto ? `¡Lograste el reto ${reto.nombre}! 🏆` : alDia ? '¡Al día! Pagaste todo lo del mes 🎉' : null;
    if (motivo) {
      confeti();
      avisar(motivo);
    }
  }, [p.metas, p.resumen, p.retos, avisar]);

  const hoyClave = `${p.hoy.anio}-${String(p.hoy.mes).padStart(2, '0')}-${String(p.hoy.dia).padStart(2, '0')}`;

  const titulo = TABS.find((t) => t.id === tab)?.label ?? 'Resumen';

  return (
    <div className="app" data-listo={listo || undefined} data-cargando={cambiandoMes || undefined}>
      <div className="carga-mes" aria-hidden />
      <div className="aurora" aria-hidden />
      <div className="franja-colombia" aria-hidden />

      {/* Escritorio: barra lateral fija. Celular: la navegación baja y "Registrar" queda como botón redondo en el centro. */}
      <aside className="lateral">
        <div className="marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="marca-logo" src="/logo-192.png" alt="" width={40} height={40} />
          <span className="marca-nombre">Pilas</span>
        </div>
        <button className="buscador solo-escritorio" onClick={() => setPaleta(true)}>
          <Search size={17} aria-hidden /> <span>Buscar…</span> <kbd>Ctrl K</kbd>
        </button>
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
          <span className={`tabs-indicador ${indicadorListo ? '' : 'quieto'}`} ref={indicador} aria-hidden />
        </nav>
        <div className="lateral-pie">
          <button className="btn primario registrar" aria-label="Registrar" onClick={() => setEditor({ tipo: 'nuevo', modo: 'gasto' })}>
            <Plus size={22} aria-hidden /> <span>Registrar</span>
          </button>
          <button type="button" className="salir apoyo solo-escritorio" onClick={() => { ir('plan'); setTimeout(() => document.getElementById('apoyar')?.scrollIntoView({ behavior: 'smooth' }), 150); }}>
            <Heart size={16} aria-hidden /> Apoya Pilas
          </button>
          <form action={salir} className="solo-escritorio">
            <button className="salir"><LogOut size={16} aria-hidden /> Cerrar sesión</button>
          </form>
          <p className="lateral-tip solo-escritorio">
            <Send size={14} aria-hidden /> También por Telegram: <code>almuerzo 15 mil</code>
          </p>
        </div>
      </aside>

      <div className="contenido">
        <header className="barra">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="marca-logo solo-movil" src="/logo-192.png" alt="" width={36} height={36} />
          <div className="barra-titulo">
            <h1>{titulo}</h1>
            <SelectorMes mes={p.mes} meses={p.meses} tab={tab} irMes={irMes} />
          </div>
          <button className="btn icono-tema solo-movil" aria-label="Buscar o registrar" onClick={() => setPaleta(true)}>
            <Search size={20} aria-hidden />
          </button>
          <BotonPrivado avisar={avisar} />
          <BotonTema avisar={avisar} />
        </header>

        {!p.resumen.esActual && (
          <p className="aviso-mes">
            Estás viendo <b>{nombreMes(Number(p.mes.slice(5)))} {p.mes.slice(0, 4)}</b>.{' '}
            <a href={`/${tab === 'resumen' ? '' : `#${tab}`}`} onClick={(e) => { e.preventDefault(); irMes(`/${tab === 'resumen' ? '' : `#${tab}`}`); }}>Volver a este mes</a>
          </p>
        )}

        <main id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="panel" key={`${tab}-${p.mes}`}>
          {tab === 'resumen' && (p.hoy.mes === 12 || p.hoy.mes === 1) && p.resumen.esActual && (
            <button className="banner-anio" onClick={() => setAnio(p.hoy.mes === 1 ? p.hoy.anio - 1 : p.hoy.anio)}>
              <Sparkles size={18} aria-hidden /> <span><b>Tu {p.hoy.mes === 1 ? p.hoy.anio - 1 : p.hoy.anio} en Pilas</b> · mira cómo te fue en el año</span>
              <ChevronRight size={18} aria-hidden />
            </button>
          )}
          {tab === 'resumen' && <Resumen {...p} abrir={setEditor} ir={ir} avisar={avisar} verHistorias={() => setHistorias(true)} />}
          {tab === 'movimientos' && (
            <Movimientos gastos={p.gastos} ingresos={p.ingresos} transferencias={p.transferencias} cuentas={p.cuentas} r={p.resumen} mes={p.mes} hoyClave={hoyClave} abrir={setEditor} />
          )}
          {tab === 'billetera' && (
            <Creditos deudas={p.deudas} cuentas={p.cuentas} r={p.resumen} mov={p.movCredito} patrimonio={p.patrimonio} hoyClave={hoyClave} abrir={setEditor} />
          )}
          {tab === 'plan' && <Plan fijos={p.fijos} metas={p.metas} retos={p.retos} r={p.resumen} mes={p.mes} abrir={setEditor} avisar={avisar} />}
        </main>
      </div>

      {editor && <Modal editor={editor} cuentas={p.cuentas} metas={p.metas} r={p.resumen} cerrar={() => setEditor(null)} avisar={avisar} />}
      {historias && (
        <Historias mes={p.mes} r={p.resumen} porDia={p.porDia} historial={p.historial} gastos={p.gastos} metas={p.metas} patrimonio={p.patrimonio} cerrar={() => setHistorias(false)} />
      )}
      {anio && <AnioEnPilas anio={anio} cerrar={() => setAnio(null)} />}
      <Paleta abierta={paleta} verAnio={() => setAnio(p.hoy.mes === 1 ? p.hoy.anio - 1 : p.hoy.anio)} cerrar={() => setPaleta(false)} ir={ir} abrir={setEditor} mes={p.mes} />

      <div className="aviso-zona" aria-live="polite">
        {aviso && (
          <p className="aviso" key={aviso.n} style={{ animationDuration: `${duracionAviso(aviso.texto)}ms` }}>
            <Check size={18} aria-hidden /> {aviso.texto}
          </p>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Resumen

function Resumen({ resumen: r, gastos, deudas, porDia, historial, consejos, mes, metas, hormiga, suscripciones, patrimonio, abrir, ir, avisar, verHistorias }: Props & {
  abrir: (e: Editor) => void; ir: (t: Tab) => void; avisar: (m: string) => void; verHistorias: () => void;
}) {
  const presupuestoMes = Math.max(0, r.ingresos - r.cuotas - r.fijos - r.extraAbonos - r.ahorro);
  const limiteDiario = presupuestoMes / r.diasMes;
  const [anio, numMes] = mes.split('-').map(Number);
  const limiteRacha = limiteDiario > 0 && r.modo === 'mes' ? limiteDiario : r.presupuestoHoy;

  return (
    <div className="resumen">
      {r.esActual ? (
        <Bento r={r} porDia={porDia} historial={historial} patrimonio={patrimonio} limite={limiteRacha} abrir={abrir} ir={ir} />
      ) : (
        <CierreMes r={r} verHistorias={verHistorias} />
      )}
    <div className="rejilla">
      <div className="col-principal">

        <section className="bloque" aria-labelledby="t-mes">
          <div className="bloque-cab">
            <h2 id="t-mes">{r.esActual ? 'Cómo va el mes' : 'Cómo fue el mes'}</h2>
            <button className="chip-historias" onClick={verHistorias}><Sparkles size={14} aria-hidden /> Tu mes en historias</button>
            <p className="sub">
              Gastado <b className="num">{pesos(r.variables)}</b>
              {presupuestoMes > 0 && <> de <b className="num">{pesos(presupuestoMes)}</b> para el día a día</>}
            </p>
          </div>
          {r.variables > 0 || presupuestoMes > 0 ? (
            <CurvaMes porDia={porDia} diaHoy={r.diaHoy} presupuestoMes={presupuestoMes} />
          ) : (
            <Vacio icono="grafica">Cuando registres gastos verás aquí cómo avanzas contra lo que te alcanza.</Vacio>
          )}
        </section>

        <section className="bloque" aria-labelledby="t-cat">
          <div className="bloque-cab">
            <h2 id="t-cat">En qué se va tu plata</h2>
            <button className="enlace" onClick={() => abrir({ tipo: 'topes' })}>{Object.keys(r.topes).length ? 'Editar topes' : 'Poner topes'}</button>
          </div>
          <Categorias r={r} />
        </section>

        <section className="bloque" aria-labelledby="t-cal">
          <div className="bloque-cab">
            <h2 id="t-cal">Día a día</h2>
            {limiteDiario > 0 && <p className="sub">Para que alcance: unos <b className="num">{pesos(limiteDiario)}</b> por día</p>}
          </div>
          <Calendario porDia={porDia} anio={anio} mes={numMes} diaHoy={r.diaHoy} limite={limiteDiario} />
        </section>
      </div>

      <aside className="col-lateral">
        <section className="bloque" aria-labelledby="t-consejos">
          <div className="bloque-cab"><h2 id="t-consejos">Recomendaciones</h2></div>
          <Consejos consejos={consejos} />
        </section>

        {r.esActual && (
          <section className="bloque" aria-labelledby="t-pend">
            <div className="bloque-cab">
              <h2 id="t-pend">Por pagar este mes</h2>
              {r.totalPendiente > 0 && <p className="sub"><b className="num">{pesos(r.totalPendiente)}</b> en total</p>}
            </div>
            <Pendientes r={r} deudas={deudas} mes={mes} abrir={abrir} avisar={avisar} ir={ir} />
          </section>
        )}

        {metas.length > 0 && (
          <section className="bloque" aria-labelledby="t-metas">
            <div className="bloque-cab">
              <h2 id="t-metas">Metas de ahorro</h2>
              <button className="enlace" onClick={() => ir('plan')}>Ver todas <ChevronRight size={16} aria-hidden /></button>
            </div>
            <ul className="metas-mini">
              {metas.slice(0, 3).map((m) => {
                const pct = m.objetivo ? Math.min(1, m.ahorrado / m.objetivo) : 0;
                return (
                  <li key={m.id}>
                    <button className="meta-mini" onClick={() => abrir({ tipo: 'aporte', item: m })}>
                      <span className="meta-mini-cab"><b>{m.nombre}</b><span className="num">{Math.round(pct * 100)} %</span></span>
                      <span className="barra-prog"><span style={{ width: `${pct * 100}%` }} /></span>
                      <span className="fila-sub">{pesos(m.ahorrado)} de {pesos(m.objetivo)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(hormiga.length > 0 || suscripciones.length > 0) && (
          <section className="bloque" aria-labelledby="t-hormiga">
            <div className="bloque-cab"><h2 id="t-hormiga">Lo que se va sin notarlo</h2></div>
            {hormiga.length > 0 && (
              <>
                <p className="mini-titulo">Gastos hormiga</p>
                <ul className="libro">
                  {hormiga.map((h) => (
                    <li key={h.concepto} className="fila">
                      <span className="fila-txt"><span className="fila-nombre">{h.concepto}</span><span className="fila-sub">{h.veces} veces este mes</span></span>
                      <span className="puntos" aria-hidden />
                      <span className="fila-monto num">{pesos(h.total)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {suscripciones.length > 0 && (
              <>
                <p className="mini-titulo"><Repeat size={14} aria-hidden /> Pagos que se repiten</p>
                <ul className="libro">
                  {suscripciones.map((x) => (
                    <li key={x.concepto} className="fila">
                      <span className="fila-txt"><span className="fila-nombre">{x.concepto}</span><span className="fila-sub">{x.meses > 1 ? `${x.meses} meses seguidos` : 'Suscripción'}</span></span>
                      <span className="puntos" aria-hidden />
                      <span className="fila-monto num">~{pesos(x.monto)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

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
            <Vacio icono="grafica">Aquí verás cada mes lo que te entró contra lo que gastaste.</Vacio>
          )}
        </section>
      </aside>
    </div>
    </div>
  );
}

/**
 * Resumen tipo bento: la cifra del día grande y, al lado, cuatro fichas con lo que más se mira.
 * Cada ficha lleva su tendencia (mini curva, flecha o puntos) para leerla de un vistazo.
 */
function Bento({ r, porDia, historial, patrimonio, limite, abrir, ir }: {
  r: TResumen; porDia: number[]; historial: MesHistorial[]; patrimonio: PuntoPatrimonio[]; limite: number;
  abrir: (e: Editor) => void; ir: (t: Tab) => void;
}) {
  const racha = rachaLimite(porDia, limite, r.diaHoy);
  const pago = r.proximoPago;

  // Gastado: acumulado día a día y comparación con el ritmo del mes pasado al mismo día
  const acumulado: number[] = [];
  porDia.slice(0, r.diaHoy).reduce((s, v, i) => ((acumulado[i] = s + v), s + v), 0);
  const anterior = historial.length >= 2 ? historial[historial.length - 2] : null;
  const diasAnt = anterior ? new Date(Number(anterior.mes.slice(0, 4)), Number(anterior.mes.slice(5)), 0).getDate() : 30;
  const ritmoAnt = anterior?.gastos ? (anterior.gastos / diasAnt) * r.diaHoy : 0;
  const cambio = ritmoAnt > 0 ? (r.variables - ritmoAnt) / ritmoAnt : null;

  // Libre: si llevas cuentas, cómo ha ido lo que tienes en ellas
  const enCuentas = patrimonio.slice(-30).map((x) => x.activos);

  // Racha: los últimos 7 días, cumplido o no
  const semana = Array.from({ length: 7 }, (_, i) => r.diaHoy - 7 + i).map((d) =>
    d < 1 ? null : d === r.diaHoy ? 'hoy' : limite > 0 && (porDia[d - 1] ?? 0) <= limite ? 'si' : 'no',
  );

  // Próximo pago: cuánto del periodo ya pasó
  const totalPeriodo = Math.max(pago.dias, 15);
  const avance = Math.min(1, Math.max(0, 1 - pago.dias / totalPeriodo));

  return (
    <div className="bento">
      <Medidor r={r} abrir={abrir} />

      <button className="ficha" onClick={() => ir('billetera')} aria-label={`Libre: ${pesos(r.disponible)}. Ver billetera`}>
        <span className="ficha-cab"><span className="ficha-ico azul" aria-hidden><WalletCards size={16} /></span> Libre</span>
        <b className={`ficha-cifra num ${r.disponible < 0 ? 'neg' : ''}`}><Contador valor={r.disponible} /></b>
        <span className="ficha-sub">
          {r.modo === 'cuentas' ? <>En cuentas <b className="num">{pesos(r.enCuentas)}</b> · por pagar <b className="num">{pesos(r.totalPendiente)}</b></> : <>Entró <b className="num">{pesos(r.ingresos)}</b> este mes</>}
        </span>
        {enCuentas.length >= 2 && <Chispa valores={enCuentas} etiqueta="Lo que tienes en cuentas, últimos días" />}
      </button>

      <button className="ficha" onClick={() => ir('movimientos')} aria-label={`Gastado este mes: ${pesos(r.variables)}. Ver movimientos`}>
        <span className="ficha-cab"><span className="ficha-ico violeta" aria-hidden><ArrowLeftRight size={16} /></span> Gastado</span>
        <b className="ficha-cifra num"><Contador valor={r.variables} /></b>
        <span className="ficha-sub">
          {cambio === null ? (
            <>Ritmo de <b className="num">{pesos(r.ritmo7)}</b> al día</>
          ) : (
            <span className={`tendencia ${cambio > 0.05 ? 'sube' : cambio < -0.05 ? 'baja' : ''}`}>
              {cambio > 0.05 ? <TrendingUp size={14} aria-hidden /> : cambio < -0.05 ? <TrendingDown size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
              {Math.abs(cambio) <= 0.05 ? 'Igual que el mes pasado' : `${Math.round(Math.abs(cambio) * 100)} % ${cambio > 0 ? 'más' : 'menos'} que el mes pasado`}
            </span>
          )}
        </span>
        {acumulado.length >= 2 && <Chispa valores={acumulado} color="var(--s7)" etiqueta="Gasto acumulado del mes" />}
      </button>

      <button className="ficha" onClick={() => ir('plan')} aria-label={`Racha: ${racha} días sin pasarte. Ver retos`}>
        <span className="ficha-cab"><span className="ficha-ico ambar" aria-hidden><Flame size={16} /></span> Racha</span>
        <b className="ficha-cifra num">{racha} <small>{racha === 1 ? 'día' : 'días'}</small></b>
        <span className="ficha-sub">{racha >= 2 ? 'Seguidos sin pasarte del límite 🔥' : racha === 1 ? 'Ayer cumpliste. ¡Sigue hoy!' : 'Cumple el límite de hoy y arrancas'}</span>
        <span className="semana" aria-hidden>
          {semana.map((e, i) => <i key={i} className={e ?? 'nada'} />)}
        </span>
      </button>

      <div className="ficha">
        <span className="ficha-cab"><span className="ficha-ico verde" aria-hidden><CalendarDays size={16} /></span> Próximo pago</span>
        <b className="ficha-cifra">{pago.dia} de {mesCortoDe(pago.mes)}</b>
        <span className="ficha-sub">{pago.dias === 0 ? '¡Es hoy! 💸' : `En ${pago.dias} ${pago.dias === 1 ? 'día' : 'días'}`}</span>
        <span className="barra-prog brillo" aria-hidden><span style={{ width: `${avance * 100}%` }} /></span>
      </div>
    </div>
  );
}

/** Resumen de un mes que ya pasó: cuánto entró, cuánto salió y con cuánto cerraste. */
function CierreMes({ r, verHistorias }: { r: TResumen; verHistorias: () => void }) {
  const salio = r.cuotas + r.fijos + r.variables + r.extraAbonos;
  return (
    <section className={`medidor ${r.disponible < 0 ? 'rojo' : ''}`} aria-labelledby="t-cierre">
      <p className="medidor-etiqueta" id="t-cierre">{r.disponible >= 0 ? 'Cerraste el mes con' : 'Cerraste el mes por encima'}</p>
      <p className="medidor-cifra num"><Contador valor={Math.abs(r.disponible)} /></p>
      <dl className="datos">
        <div><dt>Entró</dt><dd className="num">{pesos(r.ingresos)}</dd></div>
        <div><dt>Salió</dt><dd className="num">{pesos(salio)}</dd></div>
        <div><dt>Ahorraste</dt><dd className="num">{pesos(r.ahorro)}</dd></div>
      </dl>
      <button className="btn-historias" onClick={verHistorias}><Sparkles size={16} aria-hidden /> Ver tu mes en Pilas</button>
    </section>
  );
}

function Medidor({ r, abrir }: { r: TResumen; abrir: (e: Editor) => void }) {
  const pago = r.proximoPago;
  const fechaPago = `${pago.dia} de ${mesCortoDe(pago.mes)}`;

  if (r.modo === 'mes' && r.ingresos === 0) {
    return (
      <section className="medidor vacio" aria-labelledby="t-hoy">
        <h2 id="t-hoy" className="medidor-titulo">Empieza por lo que tienes</h2>
        <p className="medidor-texto">
          Agrega tus cuentas y tu efectivo en <b>Billetera</b> con su saldo, o registra lo que te entra, y calculo cuánto puedes
          gastar cada día hasta el próximo pago ({fechaPago}). Por el bot: <code>me pagaron 1.100.000</code>.
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
        <p className="medidor-etiqueta" id="t-hoy">{r.modo === 'cuentas' ? 'Te falta para cubrir lo de este mes' : 'Este mes vas por encima'}</p>
        <p className="medidor-cifra num"><Contador valor={-r.disponible} /></p>
        <p className="medidor-texto">
          {r.modo === 'cuentas'
            ? `Tienes ${pesos(r.enCuentas)} y te falta pagar ${pesos(r.totalPendiente)} este mes${r.apartadoMetas ? ` (más ${pesos(r.apartadoMetas)} apartados en metas)` : ''}. Hasta el ${fechaPago} gasta solo en lo necesario.`
            : `Lo que debes pagar y lo que has gastado ya supera lo que te ha entrado. Hasta el ${fechaPago} gasta solo en lo necesario.`}
        </p>
      </section>
    );
  }

  const limite = r.presupuestoHoy;
  const queda = limite - r.gastadoHoy;
  const ratio = limite > 0 ? Math.min(r.gastadoHoy / limite, 1) : r.gastadoHoy > 0 ? 1 : 0;
  const estado = queda < 0 ? 'sobre' : ratio > 0.8 ? 'cerca' : 'bien';
  const animo = r.gastadoHoy === 0 ? 'Aún no gastas nada hoy 👌' : queda >= 0 && ratio < 0.5 ? '¡Vas muy bien hoy! 🎉' : null;

  return (
    <section className={`medidor ${estado}`} aria-labelledby="t-hoy">
      <div className="medidor-arriba">
        <p className="medidor-etiqueta" id="t-hoy">Hoy puedes gastar <span className="medidor-hasta">· hasta el {fechaPago} ({pago.dias} {pago.dias === 1 ? 'día' : 'días'})</span></p>
        {animo && <span className="animo">{animo}</span>}
      </div>
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
      <Proyeccion r={r} />
    </section>
  );
}

function Proyeccion({ r }: { r: TResumen }) {
  if (!r.proyeccion || r.diasMes - r.diaHoy < 2) return null;
  const { finDeMes, ingresoEsperado } = r.proyeccion;
  return (
    <p className="proyeccion">
      A tu ritmo real (~<b className="num">{pesos(r.proyeccion.ritmo)}</b>/día) cierras el mes con <b className="num">{pesos(finDeMes)}</b>
      {ingresoEsperado > 0 && <> · <b className="num">{pesos(finDeMes + ingresoEsperado)}</b> si te entra lo de siempre</>}
    </p>
  );
}

function Categorias({ r }: { r: TResumen }) {
  if (!r.porCategoria.length) return <Vacio icono="cats">Aún no hay gastos este mes. Cada gasto se clasifica solo: comida, transporte, salidas…</Vacio>;
  const max = Math.max(...r.porCategoria.map((c) => c.total), ...r.porCategoriaMesAnterior.map((c) => c.total), ...Object.values(r.topes));
  const partes = r.porCategoria.map((c) => ({ nombre: c.categoria, valor: c.total, color: colorCat(c.categoria) }));
  return (
    <div className="cats-con-dona">
    <Dona partes={partes} total={r.porCategoria.reduce((s, c) => s + c.total, 0)} />
    <ul className="cats">
      {r.porCategoria.map((c) => {
        const ant = r.porCategoriaMesAnterior.find((x) => x.categoria === c.categoria)?.total;
        const pct = Math.round((c.total / r.variables) * 100);
        return (
          <li key={c.categoria} style={{ '--c': colorCat(c.categoria) } as React.CSSProperties}>
            <span className="cat-ico"><IconoCat c={c.categoria} /></span>
            <span className="cat-nombre">{c.categoria}<small>{pct} %</small></span>
            <span className="cat-pista" aria-hidden>
              <span className="cat-barra" style={{ width: `${(c.total / max) * 100}%` }} />
              {ant ? <span className="cat-antes" style={{ left: `${(ant / max) * 100}%` }} title={`Mes pasado: ${pesos(ant)}`} /> : null}
              {r.topes[c.categoria] ? <span className="cat-tope" style={{ left: `${(r.topes[c.categoria] / max) * 100}%` }} title={`Tope: ${pesos(r.topes[c.categoria])}`} /> : null}
            </span>
            <span className="cat-monto num">
              {pesos(c.total)}
              <small>
                {r.topes[c.categoria]
                  ? `${c.total > r.topes[c.categoria] ? 'pasó el' : 'tope'} ${pesos(r.topes[c.categoria])}`
                  : ant ? `mes pasado ${pesos(ant)}` : 'nuevo este mes'}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

const ICONO_NIVEL: Record<Nivel, typeof Lightbulb> = { alerta: CircleAlert, aviso: TriangleAlert, idea: Lightbulb, bien: CircleCheck };
const NOMBRE_NIVEL: Record<Nivel, string> = { alerta: 'Urgente', aviso: 'Atención', idea: 'Idea', bien: 'Bien' };

function Consejos({ consejos }: { consejos: Consejo[] }) {
  const [todos, setTodos] = useState(false);
  if (!consejos.length) return <Vacio icono="ideas">Todo en orden por ahora ✨ A medida que registres movimientos te daré ideas.</Vacio>;
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

function Pendientes({ r, deudas, mes, abrir, avisar, ir }: {
  r: TResumen; deudas: Deuda[]; mes: string; abrir: (e: Editor) => void; avisar: (m: string) => void; ir: (t: Tab) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);
  if (!r.pendientes.length) {
    return <Vacio icono={r.cuotas + r.fijos > 0 ? 'listo' : 'lista'}>{r.cuotas + r.fijos > 0 ? '¡Al día! Ya pagaste todas las cuotas y fijos de este mes 🎉' : <>Agrega tus <button className="enlace" onClick={() => ir('plan')}>gastos fijos</button> y <button className="enlace" onClick={() => ir('billetera')}>créditos</button> para saber qué te falta pagar.</>}</Vacio>;
  }
  function pagar(p: Pendiente) {
    if (p.tipo === 'cuota') {
      const d = deudas.find((x) => x.id === p.id);
      if (d) abrir({ tipo: 'abono', item: d });
      return;
    }
    setHecho(`${p.tipo}-${p.id}`);
    iniciar(async () => {
      await marcarFijo(p.id, true, mes);
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
              <span className="fila-sub">
                {p.tipo === 'cuota' ? 'Cuota de crédito' : 'Gasto fijo'}
                {p.diaPago ? ` · vence el ${p.diaPago}` : ''}
                {p.diaPago && p.diaPago < r.diaHoy ? ' (vencido)' : ''}
              </span>
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

function Movimientos({ gastos, ingresos, transferencias, cuentas, r, mes, hoyClave, abrir }: {
  gastos: Gasto[]; ingresos: Ingreso[]; transferencias: Transferencia[]; cuentas: Cuenta[]; r: TResumen; mes: string; hoyClave: string;
  abrir: (e: Editor) => void;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'gastos' | 'ingresos' | 'cuentas'>('todos');
  const [cat, setCat] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const cats = useMemo(() => [...new Set(gastos.map((g) => g.categoria))], [gastos]);
  const nombreCuenta = (id: number | null) => (id ? cuentas.find((c) => c.id === id)?.nombre ?? null : null);

  const filas = useMemo(() => {
    type Fila =
      | { tipo: 'gasto'; g: Gasto; fecha: string }
      | { tipo: 'ingreso'; i: Ingreso; fecha: string }
      | { tipo: 'transferencia'; t: Transferencia; fecha: string };
    const q = busqueda.trim().toLowerCase();
    const coincide = (t: string) => !q || t.toLowerCase().includes(q);
    const lista: Fila[] = [
      ...(filtro === 'todos' || filtro === 'gastos'
        ? gastos.filter((g) => (!cat || g.categoria === cat) && coincide(g.concepto)).map((g) => ({ tipo: 'gasto' as const, g, fecha: g.fecha }))
        : []),
      ...((filtro === 'todos' || filtro === 'ingresos') && !cat
        ? ingresos.filter((i) => coincide(i.concepto)).map((i) => ({ tipo: 'ingreso' as const, i, fecha: i.fecha }))
        : []),
      ...((filtro === 'todos' || filtro === 'cuentas') && !cat
        ? transferencias.filter((t) => coincide(t.nota ?? 'transferencia')).map((t) => ({ tipo: 'transferencia' as const, t, fecha: t.fecha }))
        : []),
    ].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
    const grupos = new Map<string, Fila[]>();
    for (const f of lista) {
      const k = claveDia(f.fecha);
      grupos.set(k, [...(grupos.get(k) ?? []), f]);
    }
    return [...grupos.entries()];
  }, [gastos, ingresos, transferencias, filtro, cat, busqueda]);

  return (
    <div className="columna">
      <div className="resumen-linea">
        <div><span>Entró</span><b className="num pos">+<Contador valor={r.ingresos} /></b></div>
        <div><span>Gastado</span><b className="num">−<Contador valor={r.variables} /></b></div>
        <div><span>Movimientos</span><b className="num">{gastos.length + ingresos.length + transferencias.length}</b></div>
      </div>

      <div className="filtros">
        <div className="segmento chico" role="radiogroup" aria-label="Mostrar">
          {(['todos', 'gastos', 'ingresos', 'cuentas'] as const).map((f) => (
            <label key={f} className={filtro === f ? 'on' : ''}>
              <input type="radio" name="filtro" checked={filtro === f} onChange={() => { setFiltro(f); if (f !== 'gastos' && f !== 'todos') setCat(null); }} />
              {{ todos: 'Todos', gastos: 'Gastos', ingresos: 'Ingresos', cuentas: 'Entre cuentas' }[f]}
            </label>
          ))}
        </div>
        <input className="buscar" type="search" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar movimientos" />
        <a className="btn chico" href={`/api/exportar?desde=${mes}`} download><Download size={16} aria-hidden /> Excel</a>
        {(filtro === 'todos' || filtro === 'gastos') && cats.length > 1 && (
          <div className="chips" aria-label="Filtrar por categoría">
            {cats.map((c) => (
              <button key={c} className={cat === c ? 'chip on' : 'chip'} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}
                style={{ '--c': colorCat(c) } as React.CSSProperties}>
                <i className="punto-cat" aria-hidden /> {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {filas.length ? (
        filas.map(([dia, fs]) => {
          const neto = fs.reduce((s, f) => s + (f.tipo === 'gasto' ? -f.g.monto : f.tipo === 'ingreso' ? f.i.monto : 0), 0);
          return (
            <section key={dia} className="dia" aria-label={fechaCorta(fs[0].fecha, hoyClave)}>
              <h3 className="dia-cab">
                <span>{fechaCorta(fs[0].fecha, hoyClave)}</span>
                <span className={`num ${neto > 0 ? 'pos' : ''}`}>{neto > 0 ? '+' : ''}{pesos(neto)}</span>
              </h3>
              <ul className="libro">
                {fs.map((f) => {
                  if (f.tipo === 'gasto') {
                    const cta = nombreCuenta(f.g.cuentaId);
                    return (
                      <FilaGasto key={`g${f.g.id}`} g={f.g} abrir={abrir}
                        sinCuenta={!cta && cuentas.length > 0}
                        sub={`${f.g.categoria} · ${hora(f.g.fecha)}${cta ? ` · ${cta}` : ''}${f.g.origen === 'telegram' ? ' · Telegram' : ''}`} />
                    );
                  }
                  if (f.tipo === 'ingreso') {
                    const cta = nombreCuenta(f.i.cuentaId);
                    return (
                      <li key={`i${f.i.id}`}>
                        <button className="fila" onClick={() => abrir({ tipo: 'ingreso', item: f.i })}>
                          <span className="fila-ico ingreso" aria-hidden><Plus size={16} /></span>
                          <span className="fila-txt">
                            <span className="fila-nombre">{f.i.concepto}</span>
                            <span className="fila-sub">Ingreso · {hora(f.i.fecha)}{cta ? ` · a ${cta}` : ''}{!cta && cuentas.length > 0 && <span className="sin-cuenta">Sin cuenta</span>}</span>
                          </span>
                          <span className="puntos" aria-hidden />
                          <span className="fila-monto num pos">+{pesos(f.i.monto)}</span>
                        </button>
                      </li>
                    );
                  }
                  const de = nombreCuenta(f.t.desdeId) ?? '—';
                  const a = nombreCuenta(f.t.haciaId) ?? '—';
                  return (
                    <li key={`t${f.t.id}`}>
                      <button className="fila" onClick={() => abrir({ tipo: 'verTransferencia', item: f.t, de, a })}>
                        <span className="fila-ico" aria-hidden><ArrowLeftRight size={16} /></span>
                        <span className="fila-txt">
                          <span className="fila-nombre">{f.t.nota ?? 'Transferencia'}</span>
                          <span className="fila-sub">{de} → {a} · {hora(f.t.fecha)}</span>
                        </span>
                        <span className="puntos" aria-hidden />
                        <span className="fila-monto num">{pesos(f.t.monto)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      ) : (
        <Vacio icono={busqueda ? 'buscar' : 'bot'}>
          {busqueda ? 'No hay movimientos que coincidan con la búsqueda.' : filtro === 'ingresos' ? 'Sin ingresos este mes. Escríbele al bot me pagaron 1100000.' : 'Sin movimientos este mes. Escríbele al bot almuerzo 15 mil o toca Registrar.'}
        </Vacio>
      )}
    </div>
  );
}

/**
 * Un gasto. En el celular se desliza: a la derecha lo editas, a la izquierda aparece "Borrar".
 * Si el concepto nombra un comercio conocido (Rappi, D1, Netflix…), se ve su logo.
 */
function FilaGasto({ g, sub, abrir, sinCuenta }: { g: Gasto; sub: string; abrir: (e: Editor) => void; sinCuenta?: boolean }) {
  const [dx, setDx] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [borrando, iniciar] = useTransition();
  const [sinLogo, setSinLogo] = useState(false);
  const inicio = useRef<{ x: number; y: number; base: number; modo: 'nada' | 'h' | 'v' } | null>(null);
  const movio = useRef(false);
  const comercio = useMemo(() => comercioDe(g.concepto), [g.concepto]);

  function abajo(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    inicio.current = { x: e.clientX, y: e.clientY, base: abierta ? -92 : 0, modo: 'nada' };
    movio.current = false;
  }
  function mover(e: React.PointerEvent) {
    const i = inicio.current;
    if (!i) return;
    const mx = e.clientX - i.x;
    const my = e.clientY - i.y;
    if (i.modo === 'nada' && Math.hypot(mx, my) > 8) i.modo = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
    if (i.modo !== 'h') return;
    movio.current = true;
    setDx(Math.max(-130, Math.min(130, i.base + mx)));
  }
  function arriba() {
    const i = inicio.current;
    inicio.current = null;
    if (!i || i.modo !== 'h') return;
    if (dx > 90) {
      navigator.vibrate?.(10);
      setDx(0);
      setAbierta(false);
      abrir({ tipo: 'gasto', item: g });
    } else if (dx < -50) {
      setDx(-92);
      setAbierta(true);
    } else {
      setDx(0);
      setAbierta(false);
    }
  }

  return (
    <li className={`desliza ${borrando ? 'saliendo' : ''}`} data-lado={dx > 0 ? 'der' : dx < 0 ? 'izq' : undefined} style={{ '--dx': `${dx}px` } as React.CSSProperties}>
      <span className="desliza-editar" aria-hidden><Pencil size={18} /> Editar</span>
      <button className="desliza-borrar" tabIndex={abierta ? 0 : -1} aria-hidden={!abierta}
        onClick={() => iniciar(async () => { await borrar('gasto', g.id); })}>
        <Trash2 size={18} aria-hidden /> Borrar
      </button>
      <button
        className="fila"
        style={{ '--c': colorCat(g.categoria) } as React.CSSProperties}
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={arriba}
        onClick={(e) => {
          if (movio.current) { e.preventDefault(); movio.current = false; return; }
          if (abierta) { setDx(0); setAbierta(false); return; }
          abrir({ tipo: 'gasto', item: g });
        }}
      >
        <span className={`fila-ico ${comercio && !sinLogo ? 'con-logo' : ''}`} aria-hidden>
          {comercio && !sinLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={comercio.logo} alt="" width={22} height={22} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setSinLogo(true)} />
          ) : (
            <IconoCat c={g.categoria} />
          )}
        </span>
        <span className="fila-txt">
          <span className="fila-nombre">{g.concepto}</span>
          <span className="fila-sub">{sub}{sinCuenta && <span className="sin-cuenta">Sin cuenta</span>}</span>
        </span>
        <span className="puntos" aria-hidden />
        <span className="fila-monto num">−{pesos(g.monto)}</span>
      </button>
    </li>
  );
}

const ICONO_VACIO = { bot: Send, grafica: ChartSpline, listo: PartyPopper, buscar: SearchX, cats: ChartPie, ideas: Sparkles, lista: ListChecks } as const;

/** Estado vacío: un ícono en burbuja y una frase amable que dice qué hacer. */
export function Vacio({ children, icono = 'bot' }: { children: React.ReactNode; icono?: keyof typeof ICONO_VACIO }) {
  const Icono = ICONO_VACIO[icono];
  return (
    <div className={`vacio-caja v-${icono}`}>
      <span className="vacio-burbuja" aria-hidden><Icono size={22} /></span>
      <p>{children}</p>
    </div>
  );
}

/** ‹ noviembre 2026 › — navega entre meses conservando la pestaña. */
function SelectorMes({ mes, meses, tab, irMes }: { mes: string; meses: string[]; tab: Tab; irMes: (href: string) => void }) {
  const [a, m] = mes.split('-').map(Number);
  const mover = (d: number) => {
    const f = new Date(Date.UTC(a, m - 1 + d, 1));
    return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const anterior = mover(-1);
  const siguiente = mover(1);
  const actual = meses[meses.length - 1];
  const hay = (x: string) => meses[0] <= x && x <= actual;
  const href = (x: string) => `/?mes=${x}${tab === 'resumen' ? '' : `#${tab}`}`;
  return (
    <nav className="selector-mes" aria-label="Cambiar de mes">
      {hay(anterior) ? (
        <a href={href(anterior)} onClick={(e) => { e.preventDefault(); irMes(href(anterior)); }} aria-label={`Ver ${nombreMes(Number(anterior.slice(5)))}`}><ChevronLeft size={18} aria-hidden /></a>
      ) : (
        <span className="off" aria-hidden><ChevronLeft size={18} /></span>
      )}
      <span className="selector-mes-texto">{nombreMes(m)} {a}</span>
      {hay(siguiente) ? (
        <a href={href(siguiente)} onClick={(e) => { e.preventDefault(); irMes(href(siguiente)); }} aria-label={`Ver ${nombreMes(Number(siguiente.slice(5)))}`}><ChevronRight size={18} aria-hidden /></a>
      ) : (
        <span className="off" aria-hidden><ChevronRight size={18} /></span>
      )}
    </nav>
  );
}
