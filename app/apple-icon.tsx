import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Ícono para iPhone (pantalla de inicio). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#2343c4', borderRadius: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 110, fontWeight: 800 }}>$</div>
        <div style={{ display: 'flex', height: 26 }}>
          <div style={{ flex: 2, background: '#fcd116' }} />
          <div style={{ flex: 1, background: '#003893' }} />
          <div style={{ flex: 1, background: '#ce1126' }} />
        </div>
      </div>
    ),
    size,
  );
}
