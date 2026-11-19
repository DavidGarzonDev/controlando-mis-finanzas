import type { MetadataRoute } from 'next';

/** Permite instalar el dashboard como app en el celular (Agregar a pantalla principal). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mis Finanzas',
    short_name: 'Finanzas',
    description: 'Gastos, deudas, tarjetas y metas en pesos colombianos',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2343c4',
    lang: 'es-CO',
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
