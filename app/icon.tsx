import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** Ícono de la app: libreta azul con la franja de la bandera y el signo $. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#2343c4', borderRadius: 112 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 300, fontWeight: 800 }}>$</div>
        <div style={{ display: 'flex', height: 72 }}>
          <div style={{ flex: 2, background: '#fcd116' }} />
          <div style={{ flex: 1, background: '#003893' }} />
          <div style={{ flex: 1, background: '#ce1126' }} />
        </div>
      </div>
    ),
    size,
  );
}
