'use client';

import { useEffect, useState, useTransition } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Bell, BellOff, Check, Copy, Fingerprint, Plug, Smartphone, Trash2, Zap } from 'lucide-react';
import {
  activarPush, borrarLlaveAuto, crearLlaveAuto, desactivarPush, dispositivosPush, guardarNuevaLlave, listaLlaves, llavePush,
  llavesAuto, opcionesNuevaLlave, quitarLlave, registrarTexto,
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
          <p className="sub">Que Pilas registre solo tus compras, entrar con tu huella y recibir avisos en el celular.</p>
        </div>
      </div>
      <div className="conexiones-grid">
        <RegistroAutomatico avisar={avisar} />
        <Huella avisar={avisar} />
        <Notificaciones avisar={avisar} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copiar">
      <small>{etiqueta}</small>
      <code>{texto}</code>
      <button type="button" className="btn chico" onClick={async () => { await navigator.clipboard?.writeText(texto).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1500); }}>
        {ok ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {ok ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function RegistroAutomatico({ avisar }: { avisar: Avisar }) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof llavesAuto>> | null>(null);
  const [nueva, setNueva] = useState<{ llave: string; url: string } | null>(null);
  const [guia, setGuia] = useState<'android' | 'iphone' | 'bot'>(() => (typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : 'android'));
  const [prueba, setPrueba] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cargar = () => llavesAuto().then(setDatos).catch(() => {});
  useEffect(() => { cargar(); }, []);
  const url = nueva?.url ?? datos?.url ?? '';
  const llave = nueva?.llave ?? 'TU_LLAVE';

  return (
    <article className="conexion">
      <header className="conexion-cab">
        <span className="conexion-ico azul" aria-hidden><Zap size={20} /></span>
        <div>
          <h3>Registro automático</h3>
          <p>Cuando te llegue la notificación de Nequi, Bancolombia, Nu… Pilas anota el gasto solo y te avisa por Telegram para corregirlo si hace falta.</p>
        </div>
      </header>

      {nueva ? (
        <div className="conexion-nueva">
          <p className="nota"><b>Guarda esta llave ahora:</b> por seguridad no la vuelvo a mostrar.</p>
          <Copiar etiqueta="Dirección (URL)" texto={nueva.url} />
          <Copiar etiqueta="Llave" texto={nueva.llave} />
        </div>
      ) : (
        <button className="btn primario" disabled={pendiente} onClick={() => iniciar(async () => { setNueva(await crearLlaveAuto(esteDispositivo())); cargar(); })}>
          <Smartphone size={18} aria-hidden /> {datos?.llaves.length ? 'Conectar otro celular' : 'Conectar mi celular'}
        </button>
      )}

      <div className="segmento chico" role="tablist" aria-label="Cómo conectarlo">
        {(['android', 'iphone', 'bot'] as const).map((g) => (
          <button key={g} role="tab" aria-selected={guia === g} className={guia === g ? 'on' : ''} onClick={() => setGuia(g)}>
            {{ android: 'Android', iphone: 'iPhone', bot: 'Sin apps' }[g]}
          </button>
        ))}
      </div>
      {guia === 'android' && (
        <ol className="guia">
          <li>Instala <b>MacroDroid</b> (gratis) y toca <b>Agregar macro</b>.</li>
          <li>Disparador: <b>Notificación → Notificación recibida</b>. Elige las apps: Nequi, Bancolombia, Nu, Daviplata… y “cualquier contenido”.</li>
          <li>Acción: <b>Conectividad → Solicitud HTTP</b>. Método <b>POST</b>, URL: <code>{url}</code></li>
          <li>Encabezado: <code>Authorization</code> = <code>Bearer {llave}</code></li>
          <li>Cuerpo (JSON): <code>{'{"texto": "[notification_title] [notification]", "app": "[app_name]"}'}</code></li>
          <li>Guarda la macro. Listo: cada compra llega sola a Pilas.</li>
        </ol>
      )}
      {guia === 'iphone' && (
        <ol className="guia">
          <li>En iPhone no se pueden leer las notificaciones de otras apps, pero sí los <b>SMS del banco</b> y los pagos con <b>Apple Pay</b>.</li>
          <li>Abre <b>Atajos → Automatización → Nueva</b>: elige <b>Mensaje</b>, “el mensaje contiene” <b>Bancolombia</b> (o tu banco) y marca <b>Ejecutar de inmediato</b>.</li>
          <li>Acción: <b>Obtener contenido de URL</b>. URL: <code>{url}</code>, Método <b>POST</b>.</li>
          <li>Encabezado <code>Authorization</code> = <code>Bearer {llave}</code>. Cuerpo JSON: campo <code>texto</code> = <b>Contenido del mensaje</b>.</li>
          <li>Para Apple Pay: automatización <b>Transacción</b> con la misma acción; en <code>texto</code> pon “Pagaste <b>Cantidad</b> en <b>Comercio</b>”.</li>
        </ol>
      )}
      {guia === 'bot' && (
        <ol className="guia">
          <li>Mantén presionada la notificación o el SMS del banco y toca <b>Compartir</b> o <b>Copiar</b>.</li>
          <li>Pégala en el chat del bot de Telegram. Pilas la entiende igual (comercio, monto y cuenta) y la registra.</li>
        </ol>
      )}

      <details className="probar">
        <summary>Probar con una notificación</summary>
        <textarea value={prueba} onChange={(e) => setPrueba(e.target.value)} rows={2} placeholder="Ej: Pagaste $15.000 en D1 SAS" />
        <button className="btn chico" disabled={pendiente || prueba.trim().length < 10} onClick={() => iniciar(async () => {
          const r = await registrarTexto(prueba);
          setResultado(r.html);
          avisar('Probado');
        })}>Registrar esta notificación</button>
        {/* La respuesta viene del bot, ya escapada en el servidor (solo usa <b>, <i> y <s>) */}
        {resultado && <p className="nota" dangerouslySetInnerHTML={{ __html: resultado.replace(/\n/g, '<br/>') }} />}
      </details>

      {!!datos?.llaves.length && (
        <ul className="conexion-lista">
          {datos.llaves.map((k) => (
            <li key={k.id}>
              <span><b>{k.nombre}</b><small>Último uso: {fecha(k.ultimoUso)}</small></span>
              <button className="icono-btn" aria-label={`Desconectar ${k.nombre}`} onClick={() => iniciar(async () => { await borrarLlaveAuto(k.id); cargar(); avisar('Desconectado'); })}>
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
