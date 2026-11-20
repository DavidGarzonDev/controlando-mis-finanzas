'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import { conClave, conCodigo, otraVez, type Estado } from '@/app/entrar/acciones';

const INICIAL: Estado = { paso: 'clave' };

/** Pantalla de entrada: clave → código de 6 dígitos que llega a tu Telegram. */
export default function Entrar() {
  const [estadoClave, enviarClave, cargandoClave] = useActionState(conClave, INICIAL);
  const [estadoCodigo, enviarCodigo, cargandoCodigo] = useActionState(conCodigo, { paso: 'codigo' } as Estado);
  // Paso visible y mensaje de error; el código vuelve al paso de la clave si venció, se agotó o hubo bloqueo.
  const [paso, setPaso] = useState<'clave' | 'codigo'>('clave');
  const [error, setError] = useState<string | undefined>();
  const [bloqueadoHasta, setBloqueadoHasta] = useState<string | undefined>();
  const [errorCodigo, setErrorCodigo] = useState<string | undefined>();
  useEffect(() => {
    setErrorCodigo(undefined);
    setPaso(estadoClave.paso);
    setError(estadoClave.error);
    setBloqueadoHasta(estadoClave.bloqueadoHasta);
  }, [estadoClave]);
  useEffect(() => {
    if (estadoCodigo.paso !== 'clave') return setErrorCodigo(estadoCodigo.error);
    setPaso('clave');
    setError(estadoCodigo.error);
    setBloqueadoHasta(estadoCodigo.bloqueadoHasta);
  }, [estadoCodigo]);

  return (
    <div className="entrar">
      <div className="entrar-luces" aria-hidden><i /><i /><i /></div>
      <div className="entrar-rejilla" aria-hidden />

      <section className="entrar-marca" aria-hidden>
        <div className="entrar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-192.png" alt="" width={56} height={56} />
          <span>Pilas</span>
        </div>
        <h2>Tu plata,<br /><em>bajo control.</em></h2>
        <p>Gastos, cuentas, tarjetas y metas en un solo lugar. Escríbele al bot y todo cuadra solo.</p>
        <div className="entrar-tarjeta">
          <div className="entrar-tarjeta-brillo" />
          <span className="entrar-tarjeta-chip" />
          <span className="entrar-tarjeta-etq">Hoy puedes gastar</span>
          <b>$48.500</b>
          <span className="entrar-tarjeta-pie"><span>•••• 2026</span><span className="entrar-mc"><i /><i /></span></span>
        </div>
      </section>

      <main className="entrar-caja">
        <div className="entrar-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="entrar-logo-movil" src="/logo-192.png" alt="" width={48} height={48} />
          <span className="entrar-paso" aria-hidden>
            <i className={paso === 'clave' ? 'on' : 'hecho'} /><i className={paso === 'codigo' ? 'on' : ''} />
          </span>
          <h1>{paso === 'clave' ? 'Bienvenido a Pilas' : 'Revisa tu Telegram'}</h1>
          <p>
            {paso === 'clave'
              ? 'Escribe tu clave. Después te llega un código a Telegram para confirmar que eres tú.'
              : 'Te mandé un código de 6 números. Escríbelo aquí para entrar.'}
          </p>
        </div>

        {paso === 'clave' ? (
          <FormClave accion={enviarClave} cargando={cargandoClave} error={error} bloqueadoHasta={bloqueadoHasta} />
        ) : (
          <FormCodigo
            accion={enviarCodigo}
            cargando={cargandoCodigo}
            error={errorCodigo}
            intento={estadoCodigo}
            envio={estadoClave.envio ?? 0}
            volver={async () => { await otraVez(); setError(undefined); setPaso('clave'); }}
          />
        )}

        <p className="entrar-seguro">
          <ShieldCheck size={15} aria-hidden /> Protegido con clave + código. Tras 5 intentos fallidos se bloquea y te aviso por Telegram.
        </p>
      </main>
    </div>
  );
}

function FormClave({ accion, cargando, error, bloqueadoHasta }: {
  accion: (fd: FormData) => void; cargando: boolean; error?: string; bloqueadoHasta?: string;
}) {
  const [ver, setVer] = useState(false);
  const bloqueado = Boolean(bloqueadoHasta && new Date(bloqueadoHasta) > new Date());
  return (
    <form action={accion} className="entrar-form">
      <label className="entrar-campo">
        <span>Clave</span>
        <span className="entrar-input">
          <LockKeyhole size={18} aria-hidden />
          <input
            name="clave"
            type={ver ? 'text' : 'password'}
            autoComplete="current-password"
            required
            autoFocus
            disabled={bloqueado}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'error-clave' : undefined}
          />
          <button type="button" className="entrar-ojo" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar clave' : 'Mostrar clave'}>
            {ver ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </span>
      </label>
      <label className="entrar-recordar">
        <input type="checkbox" name="recordar" />
        <span>Recordar este dispositivo 30 días <small>Si no, la sesión dura 12 horas</small></span>
      </label>
      {error && <p className="entrar-error" id="error-clave" role="alert">{error}</p>}
      <button className="entrar-btn" disabled={cargando || bloqueado}>
        {cargando ? <span className="girando" aria-hidden /> : <KeyRound size={18} aria-hidden />}
        {cargando ? 'Revisando…' : 'Continuar'}
        {!cargando && <ArrowRight size={18} aria-hidden className="entrar-flecha" />}
      </button>
    </form>
  );
}

function FormCodigo({ accion, cargando, error, intento, envio, volver }: {
  accion: (fd: FormData) => void; cargando: boolean; error?: string; intento: Estado; envio: number; volver: () => void;
}) {
  const [valor, setValor] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [resta, setResta] = useState(300);

  useEffect(() => {
    const fin = envio + 5 * 60_000;
    const t = setInterval(() => setResta(Math.max(0, Math.round((fin - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [envio]);

  // Si falla, limpia y vuelve a enfocar para escribir de nuevo
  useEffect(() => {
    if (error) { setValor(''); entrada.current?.focus(); }
  }, [error, intento]);

  return (
    <form action={accion} ref={form} className="entrar-form">
      <label className="entrar-campo">
        <span>Código de Telegram</span>
        <span className={`otp ${error ? 'mal' : ''}`} onClick={() => entrada.current?.focus()}>
          <input
            ref={entrada}
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            value={valor}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'error-codigo' : 'ayuda-codigo'}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setValor(v);
              if (v.length === 6) requestAnimationFrame(() => form.current?.requestSubmit());
            }}
          />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`otp-celda ${i < valor.length ? 'llena' : ''} ${i === valor.length ? 'cursor' : ''}`} aria-hidden>
              {valor[i] ?? ''}
            </span>
          ))}
        </span>
      </label>
      <p className="entrar-ayuda" id="ayuda-codigo">
        <MessageCircle size={15} aria-hidden />
        {resta > 0 ? <>Vence en <b className="num">{Math.floor(resta / 60)}:{String(resta % 60).padStart(2, '0')}</b></> : 'El código venció.'}
      </p>
      {error && <p className="entrar-error" id="error-codigo" role="alert">{error}</p>}
      <button className="entrar-btn" disabled={cargando || valor.length !== 6}>
        {cargando ? <span className="girando" aria-hidden /> : <ShieldCheck size={18} aria-hidden />}
        {cargando ? 'Verificando…' : 'Entrar'}
      </button>
      <button type="button" className="entrar-enlace" onClick={volver}>¿No te llegó? Pedir otro código</button>
    </form>
  );
}
