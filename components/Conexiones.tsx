'use client';

import { useEffect, useState, useTransition } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Bell, BellOff, Bot, Fingerprint, Plug, Send, Trash2 } from 'lucide-react';
import {
  activarPush, desactivarPush, dispositivosPush, estadoDeLaIA, estadoTelegram, reconectarTelegram, guardarNuevaLlave, listaLlaves, llavePush, opcionesNuevaLlave, probarIA, quitarLlave,
} from '@/app/actions';

type Avisar = (m: string) => void;
const fecha = (d: string | null) => (d ? new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'nunca');
const esteDispositivo = () => {
  if (typeof navigator === 'undefined') return 'Este dispositivo';
  const a = navigator.userAgent;
  return /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Celular Android' : /Mac/.test(a) ? 'Mac' : /Windows/.test(a) ? 'Computador Windows' : 'Este dispositivo';
};

/** Conexiones y seguridad: registro automático, huella/Face ID y notificaciones de la app. */
export function Conexiones({ avisar }: { avisar: Avisar }) {
  return (
    <section aria-labelledby="t-conexiones" className="conexiones">
      <div className="bloque-cab">
        <div>
          <h2 id="t-conexiones"><Plug size={18} aria-hidden className="ico-titulo" /> Conexiones y seguridad</h2>
          <p className="sub">Entrar con tu huella, recibir avisos en el celular y elegir la inteligencia artificial.</p>
        </div>
      </div>
      <div className="conexiones-grid">
        <TarjetaTelegram />
        <TarjetaIA />
        <Huella avisar={avisar} />
        <Notificaciones avisar={avisar} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function Huella({ avisar }: { avisar: Avisar }) {
  const [lista, setLista] = useState<Awaited<ReturnType<typeof listaLlaves>> | null>(null);
  const [soporta, setSoporta] = useState(true);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const cargar = () => listaLlaves().then(setLista).catch(() => {});
  useEffect(() => {
    setSoporta(typeof window !== 'undefined' && 'PublicKeyCredential' in window);
    cargar();
  }, []);

  function activar() {
    setError('');
    iniciar(async () => {
      try {
        const op = await opcionesNuevaLlave();
        const r = await startRegistration({ optionsJSON: op });
        const g = await guardarNuevaLlave(r, esteDispositivo());
        if (!g.ok) throw new Error(g.error);
        avisar('Huella activada en este dispositivo');
        cargar();
      } catch (e) {
        const m = e instanceof Error ? e.message : '';
        setError(/abort|cancel|NotAllowed/i.test(m) ? 'Cancelaste. Puedes intentarlo otra vez.' : /exclude|registered|InvalidState/i.test(m) ? 'Este dispositivo ya está activado.' : m || 'No se pudo activar.');
      }
    });
  }

  return (
    <article className="conexion">
      <header className="conexion-cab">
        <span className="conexion-ico violeta" aria-hidden><Fingerprint size={20} /></span>
        <div>
          <h3>Entrar con huella o Face ID</h3>
          <p>Entras de un toque, sin clave ni código. Tu huella nunca sale del celular; la clave + código siguen sirviendo de respaldo.</p>
        </div>
      </header>
      {soporta ? (
        <button className="btn primario" disabled={pendiente} onClick={activar}>
          <Fingerprint size={18} aria-hidden /> {pendiente ? 'Esperando tu huella…' : 'Activar en este dispositivo'}
        </button>
      ) : (
        <p className="nota">Este navegador no permite huella o Face ID. Prueba desde el navegador del celular (Chrome o Safari).</p>
      )}
      {error && <p className="error">{error}</p>}
      {!!lista?.length && (
        <ul className="conexion-lista">
          {lista.map((k) => (
            <li key={k.id}>
              <span><b>{k.nombre}</b><small>Activada {fecha(k.creada)} · último uso {fecha(k.ultimoUso)}</small></span>
              <button className="icono-btn" aria-label={`Quitar ${k.nombre}`} onClick={() => iniciar(async () => { await quitarLlave(k.id); cargar(); avisar('Huella quitada'); })}>
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------

/** La llave pública VAPID viene en base64url; el navegador la quiere en bytes. */
function bytes(base64: string) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function Notificaciones({ avisar }: { avisar: Avisar }) {
  const [estado, setEstado] = useState<'cargando' | 'no-soporta' | 'instalar' | 'bloqueado' | 'apagado' | 'encendido'>('cargando');
  const [lista, setLista] = useState<{ endpoint: string; nombre: string }[]>([]);
  const [pendiente, iniciar] = useTransition();

  async function revisar() {
    const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const instalada = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!soporta) return setEstado(ios && !instalada ? 'instalar' : 'no-soporta');
    if (Notification.permission === 'denied') return setEstado('bloqueado');
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    setEstado(sub ? 'encendido' : 'apagado');
    dispositivosPush().then(setLista).catch(() => {});
  }
  useEffect(() => { revisar(); }, []);

  function activar() {
    iniciar(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if ((await Notification.requestPermission()) !== 'granted') return setEstado('bloqueado');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(await llavePush()) });
        const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await activarPush(j, esteDispositivo());
        avisar('Notificaciones activadas');
      } catch {
        avisar('No se pudieron activar las notificaciones');
      }
      revisar();
    });
  }
  function desactivar() {
    iniciar(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await desactivarPush(sub.endpoint);
        await sub.unsubscribe();
      }
      avisar('Notificaciones apagadas en este dispositivo');
      revisar();
    });
  }

  return (
    <article className="conexion">
      <header className="conexion-cab">
        <span className="conexion-ico ambar" aria-hidden><Bell size={20} /></span>
        <div>
          <h3>Notificaciones de la app</h3>
          <p>El recordatorio de cada mañana, el resumen del domingo y las alertas (gasto raro, cobro repetido, suscripción que subió), además de Telegram.</p>
        </div>
      </header>
      {estado === 'encendido' && (
        <button className="btn" disabled={pendiente} onClick={desactivar}><BellOff size={18} aria-hidden /> Apagar en este dispositivo</button>
      )}
      {estado === 'apagado' && (
        <button className="btn primario" disabled={pendiente} onClick={activar}><Bell size={18} aria-hidden /> Activar en este dispositivo</button>
      )}
      {estado === 'instalar' && <p className="nota">En iPhone, primero instala Pilas: en Safari toca <b>Compartir → Agregar a inicio</b>, ábrela desde ese ícono y vuelve aquí.</p>}
      {estado === 'bloqueado' && <p className="nota">Las notificaciones están bloqueadas para esta página. Actívalas en los ajustes del navegador (ícono del candado → Notificaciones).</p>}
      {estado === 'no-soporta' && <p className="nota">Este navegador no admite notificaciones. Tranquilo: todo te sigue llegando por Telegram.</p>}
      {!!lista.length && (
        <ul className="conexion-lista">
          {lista.map((d) => (
            <li key={d.endpoint}><span><b>{d.nombre}</b><small>Recibe notificaciones</small></span></li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------

const MOTIVOS: Record<string, string> = {
  sin_clave: 'La clave no sirve o falta. Revísala en Vercel.',
  limite: 'Llegaste al límite de uso de hoy de ese proveedor.',
  error: 'El proveedor no respondió bien. Revisa el modelo (IA_MODELO).',
  no_entendio: 'Respondió, pero no entendió el ejemplo.',
};

/** Qué inteligencia artificial usa Pilas (cada quien pone su propia clave en Vercel). */
function TarjetaIA() {
  const [e, setE] = useState<Awaited<ReturnType<typeof estadoDeLaIA>> | null>(null);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => { estadoDeLaIA().then(setE).catch(() => {}); }, []);
  return (
    <article className="conexion">
      <header className="conexion-cab">
        <span className="conexion-ico azul" aria-hidden><Bot size={20} /></span>
        <div>
          <h3>Inteligencia artificial</h3>
          <p>Entiende mensajes raros, notas de voz y fotos de recibos, y responde tus preguntas. Usas tu propia clave: Gemini (tiene plan gratis), Claude, OpenAI, Groq, OpenRouter o DeepSeek.</p>
        </div>
      </header>
      {!e ? (
        <p className="nota">Revisando…</p>
      ) : e.activa ? (
        <>
          <p className="ia-estado"><b>{e.nombre}</b> · <code>{e.modelo}</code>{!e.voz && <small> · sin notas de voz</small>}</p>
          <button className="btn chico" disabled={pendiente} onClick={() => iniciar(async () => setPrueba(await probarIA()))}>
            {pendiente ? 'Probando…' : 'Probar'}
          </button>
          {prueba && <p className={prueba.ok ? 'nota' : 'error'}>{prueba.ok ? `✓ ${prueba.texto}` : MOTIVOS[prueba.texto] ?? prueba.texto}</p>}
        </>
      ) : (
        <p className="nota">No hay IA configurada. El bot funciona igual con su intérprete propio. Para activarla, agrega en Vercel <code>GEMINI_API_KEY</code> (gratis en aistudio.google.com) o la de tu proveedor; mira el README.</p>
      )}
      <p className="sub">Para cambiarla: <code>IA_PROVEEDOR</code> (gemini, claude, openai, groq, openrouter, deepseek) e <code>IA_MODELO</code> en las variables de Vercel.</p>
    </article>
  );
}

// ---------------------------------------------------------------------------

/** El bot de Telegram: si está conectado a esta app, y un botón para reconectarlo. */
function TarjetaTelegram() {
  const [e, setE] = useState<Awaited<ReturnType<typeof estadoTelegram>> | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState('');
  const cargar = () => estadoTelegram().then(setE).catch(() => {});
  useEffect(() => { cargar(); }, []);
  return (
    <article className="conexion">
      <header className="conexion-cab">
        <span className="conexion-ico azul" aria-hidden><Send size={20} /></span>
        <div>
          <h3>Bot de Telegram</h3>
          <p>Por donde registras gastos, recibes el código para entrar y los recordatorios.</p>
        </div>
      </header>
      {!e ? (
        <p className="nota">Revisando…</p>
      ) : (
        <>
          <p className="ia-estado">
            {e.bot ? <><b>@{e.bot.usuario}</b> · </> : <b className="neg">El token no funciona · </b>}
            {e.webhookOk ? <span className="pos">conectado a esta app ✓</span> : <span className="neg">no está recibiendo mensajes aquí</span>}
          </p>
          {e.webhook?.error && <p className="error">Último error de Telegram: {e.webhook.error}</p>}
          {(!e.webhookOk || e.webhook?.error) && (
            <button className="btn chico" disabled={pendiente} onClick={() => iniciar(async () => {
              const ok = await reconectarTelegram();
              setMsg(ok ? 'Listo, reconectado.' : 'Telegram no aceptó la conexión. Revisa las variables del bot en Vercel.');
              cargar();
            })}>{pendiente ? 'Conectando…' : 'Reconectar'}</button>
          )}
          {msg && <p className="nota">{msg}</p>}
          {e.bot && <a className="btn chico" href={`https://t.me/${e.bot.usuario}`} target="_blank" rel="noopener noreferrer">Abrir el bot</a>}
        </>
      )}
    </article>
  );
}
