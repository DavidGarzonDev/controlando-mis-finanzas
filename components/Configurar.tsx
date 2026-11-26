'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowRight, Check, CircleAlert, ExternalLink, KeyRound, Send } from 'lucide-react';
import { conectarTelegramInicial, estadoConfiguracion, type EstadoConfig } from '@/app/entrar/acciones';

type Inicial = Extract<EstadoConfig, { necesita: true }>;

/**
 * Configuración inicial (la primera vez que alguien abre su Pilas):
 * 1) revisa las variables de Vercel, 2) con tu clave conecta el bot a esta app,
 * 3) le mandas /start con un código y ese chat queda como el tuyo. Sin copiar el chat ID ni redesplegar.
 */
export function Configurar({ inicial }: { inicial: Inicial }) {
  const [estado, setEstado] = useState<Inicial>(inicial);
  const [clave, setClave] = useState('');
  const [conexion, setConexion] = useState<{ codigo: string; bot: { usuario: string; nombre: string } } | null>(null);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();

  // Mientras esperas el /start, revisa cada 3 s si ya quedó conectado
  useEffect(() => {
    if (!conexion || listo) return;
    const t = setInterval(async () => {
      const e = await estadoConfiguracion().catch(() => null);
      if (e && !e.necesita) {
        setListo(true);
        clearInterval(t);
        setTimeout(() => window.location.reload(), 1800);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [conexion, listo]);

  const revisar = () => iniciar(async () => {
    const e = await estadoConfiguracion();
    if (!e.necesita) return window.location.reload();
    setEstado(e);
  });

  return (
    <div className="entrar">
      <div className="entrar-luces" aria-hidden><i /><i /><i /></div>
      <div className="entrar-rejilla" aria-hidden />
      <main className="entrar-caja configurar">
        <div className="entrar-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="entrar-logo-movil" src="/logo-192.png" alt="" width={48} height={48} style={{ display: 'block' }} />
          <h1>Configuremos tu Pilas</h1>
          <p>Es solo una vez. Conectamos tu bot de Telegram para que solo tú puedas usarlo.</p>
        </div>

        <ol className="config-pasos">
          <li className={estado.listo ? 'hecho' : 'activo'}>
            <b>1. Variables en Vercel</b>
            <ul className="config-vars">
              {estado.variables.map((v) => (
                <li key={v.nombre} className={v.ok ? 'ok' : v.opcional ? 'opcional' : 'falta'}>
                  {v.ok ? <Check size={15} aria-hidden /> : <CircleAlert size={15} aria-hidden />}
                  <span><code>{v.nombre}</code>{v.opcional && !v.ok ? ' (opcional)' : ''}{!v.ok && <small>{v.ayuda}</small>}</span>
                </li>
              ))}
            </ul>
            {!estado.listo && (
              <>
                <p className="config-nota">Agrégalas en Vercel → Settings → Environment Variables, haz <b>Redeploy</b> y vuelve aquí.</p>
                <button className="entrar-enlace" onClick={revisar} disabled={pendiente}>{pendiente ? 'Revisando…' : 'Ya las puse, revisar otra vez'}</button>
              </>
            )}
          </li>

          <li className={!estado.listo ? 'bloqueado' : conexion ? 'hecho' : 'activo'}>
            <b>2. Conectar el bot{estado.bot ? <> <span className="config-bot">@{estado.bot.usuario}</span></> : null}</b>
            {estado.listo && !conexion && (
              <form className="entrar-form" onSubmit={(e) => {
                e.preventDefault();
                setError('');
                iniciar(async () => {
                  const r = await conectarTelegramInicial(clave);
                  if (r.error || !r.codigo || !r.bot) return setError(r.error ?? 'No se pudo conectar.');
                  setConexion({ codigo: r.codigo, bot: r.bot });
                });
              }}>
                <label className="entrar-campo">
                  <span>Tu clave (DASHBOARD_PASSWORD)</span>
                  <span className="entrar-input">
                    <KeyRound size={18} aria-hidden />
                    <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required autoFocus />
                  </span>
                </label>
                {error && <p className="entrar-error" role="alert">{error}</p>}
                <button className="entrar-btn" disabled={pendiente || !clave}>
                  {pendiente ? <span className="girando" aria-hidden /> : <Send size={18} aria-hidden />}
                  {pendiente ? 'Conectando…' : 'Conectar con Telegram'}
                  {!pendiente && <ArrowRight size={18} aria-hidden className="entrar-flecha" />}
                </button>
              </form>
            )}
          </li>

          <li className={!conexion ? 'bloqueado' : listo ? 'hecho' : 'activo'}>
            <b>3. Escríbele a tu bot</b>
            {conexion && !listo && (
              <div className="config-codigo">
                <p>Abre <b>@{conexion.bot.usuario}</b> en Telegram y mándale:</p>
                <code className="config-comando">/start {conexion.codigo}</code>
                <a className="entrar-btn" href={`https://t.me/${conexion.bot.usuario}?start=${conexion.codigo}`} target="_blank" rel="noopener noreferrer">
                  <Send size={18} aria-hidden /> Abrir Telegram y mandarlo <ExternalLink size={16} aria-hidden />
                </a>
                <p className="config-nota"><span className="girando" aria-hidden /> Esperando tu mensaje… (el código vence en 10 minutos)</p>
              </div>
            )}
            {listo && <p className="config-listo">🎉 ¡Conectado! Ya puedes entrar con tu clave…</p>}
          </li>
        </ol>
      </main>
    </div>
  );
}
