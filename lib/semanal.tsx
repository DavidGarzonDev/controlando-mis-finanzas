import React from 'react';
import { ImageResponse } from 'next/og';
void React; // el JSX de la imagen se compila con React
import * as db from './datos';
import { conEmoji, type CategoriaPropia } from './categorias';
import { generarConsejos } from './consejos';
import { esc, enviarFoto, enviarMensaje, pesos } from './telegram';

/**
 * Resumen semanal (domingos, o cuando escribes /semana): una imagen con lo que gastaste por día
 * y por categoría, y debajo un texto corto con la comparación y 2-3 consejos.
 */

// Colores de categoría sobre fondo oscuro (los mismos de la app en modo oscuro)
const COLOR: Record<string, string> = {
  Comida: '#3987e5', Transporte: '#d95926', Salidas: '#199e70', Compras: '#c98500',
  Hogar: '#d55181', Servicios: '#0ca30c', Salud: '#9085e9', Otros: '#6f7584',
};
const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const corto = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : v >= 1000 ? `$${Math.round(v / 1000)} mil` : `$${v}`);
const fecha = (f: string) => `${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const diaSemana = (f: string) => DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()];

export function rangoSemana(s: db.Semana) {
  return `${fecha(s.desde)} – ${fecha(s.hasta)}`;
}

/** La imagen (PNG, 1080×1080). */
export async function imagenSemana(s: db.Semana, propias: CategoriaPropia[]): Promise<ArrayBuffer> {
  const maxDia = Math.max(...s.porDia.map((d) => d.total), 1);
  const cats = s.porCategoria.slice(0, 5);
  const maxCat = Math.max(...cats.map((c) => c.total), 1);
  const cambio = s.anterior > 0 ? (s.total - s.anterior) / s.anterior : null;
  const colorDe = (c: string) => COLOR[c] ?? propias.find((p) => p.nombre === c)?.color ?? '#6f7584';

  const img = new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 72, color: '#eef1fa',
          background: 'radial-gradient(circle at 0% 0%, #2a3fd0 0%, transparent 45%), radial-gradient(circle at 100% 100%, #5b33d6 0%, transparent 45%), linear-gradient(160deg, #0d1430, #070b18)',
          fontSize: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: 52, height: 52, borderRadius: 14, overflow: 'hidden', transform: 'rotate(-6deg)' }}>
              <div style={{ display: 'flex', flex: 2, background: '#fcd116' }} />
              <div style={{ display: 'flex', flex: 1, background: '#003893' }} />
              <div style={{ display: 'flex', flex: 1, background: '#ce1126' }} />
            </div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>Pilas</div>
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: 'rgba(226,232,250,0.7)' }}>Tu semana · {rangoSemana(s)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56 }}>
          <div style={{ display: 'flex', fontSize: 30, color: 'rgba(226,232,250,0.7)' }}>Gastaste</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
            <div style={{ display: 'flex', fontSize: 104, fontWeight: 700, letterSpacing: -4 }}>{pesos(s.total)}</div>
            {cambio !== null && (
              <div
                style={{
                  display: 'flex', marginBottom: 24, padding: '8px 18px', borderRadius: 999, fontSize: 26,
                  background: cambio > 0 ? 'rgba(255,90,110,0.18)' : 'rgba(80,220,150,0.18)', color: cambio > 0 ? '#ffb3bb' : '#8ff0c0',
                }}
              >
                {cambio > 0 ? '+' : '−'}{Math.round(Math.abs(cambio) * 100)} % vs semana pasada
              </div>
            )}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(226,232,250,0.6)' }}>
            {s.veces} movimientos{s.ingresos ? ` · entró ${pesos(s.ingresos)}` : ''}
          </div>
        </div>

        {/* Barras por día */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 260, marginTop: 44 }}>
          {s.porDia.map((d, i) => (
            <div key={d.fecha} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 10 }}>
              <div style={{ display: 'flex', fontSize: 20, color: 'rgba(226,232,250,0.65)' }}>{d.total ? corto(d.total) : ''}</div>
              <div
                style={{
                  display: 'flex', width: '100%', borderRadius: 14, height: Math.max(8, (d.total / maxDia) * 180),
                  background: i === s.porDia.length - 1 ? 'linear-gradient(180deg, #a37bff, #5b3be0)' : 'linear-gradient(180deg, #7f95ff, #3a4fd8)',
                  opacity: d.total ? 1 : 0.25,
                }}
              />
              <div style={{ display: 'flex', fontSize: 22, color: 'rgba(226,232,250,0.7)' }}>{diaSemana(d.fecha)}</div>
            </div>
          ))}
        </div>

        {/* Categorías */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 44 }}>
          {cats.map((c) => (
            <div key={c.categoria} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ display: 'flex', width: 210, fontSize: 26 }}>{c.categoria}</div>
              <div style={{ display: 'flex', flex: 1, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', width: `${(c.total / maxCat) * 100}%`, height: 18, borderRadius: 9, background: colorDe(c.categoria) }} />
              </div>
              <div style={{ display: 'flex', width: 170, justifyContent: 'flex-end', fontSize: 26, fontWeight: 700 }}>{pesos(c.total)}</div>
            </div>
          ))}
          {!cats.length && <div style={{ display: 'flex', fontSize: 28, color: 'rgba(226,232,250,0.7)' }}>Sin gastos esta semana</div>}
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
  return img.arrayBuffer();
}

/** El texto que va debajo de la imagen. */
export async function textoSemana(s: db.Semana, propias: CategoriaPropia[]): Promise<string> {
  const [r, ds, fs] = await Promise.all([db.resumen(), db.deudas(), db.fijos()]);
  const cambio = s.anterior > 0 ? (s.total - s.anterior) / s.anterior : null;
  const comparacion = cambio === null
    ? ''
    : Math.abs(cambio) < 0.05
      ? ' Casi igual que la semana pasada.'
      : cambio > 0
        ? ` Eso es <b>${Math.round(cambio * 100)} % más</b> que la semana pasada.`
        : ` <b>${Math.round(-cambio * 100)} % menos</b> que la semana pasada. ¡Bien ahí! 👏`;
  const top = s.porCategoria[0];
  const consejos = generarConsejos(r, ds, fs).slice(0, 3);
  return [
    `<b>Tu semana en Pilas</b> · ${rangoSemana(s)}`,
    `Gastaste <b>${pesos(s.total)}</b> en ${s.veces} movimientos.${comparacion}`,
    top ? `Lo que más pesó: ${esc(conEmoji(top.categoria, propias))} ${pesos(top.total)}` : '',
    consejos.length ? `\n<b>Para la semana que viene</b>\n${consejos.map((c) => `• ${esc(c.titulo)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

/** Arma y manda el resumen semanal. Si la imagen falla, manda solo el texto. */
export async function enviarResumenSemanal(chat: string | number): Promise<boolean> {
  const [s, propias] = await Promise.all([db.resumenSemana(), db.categoriasPropias()]);
  const texto = await textoSemana(s, propias);
  try {
    const png = await imagenSemana(s, propias);
    return await enviarFoto(chat, png, texto);
  } catch (e) {
    console.error('No pude hacer la imagen de la semana', e);
    return enviarMensaje(chat, texto);
  }
}
