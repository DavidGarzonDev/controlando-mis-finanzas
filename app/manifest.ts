import type { MetadataRoute } from 'next';

/** Permite instalar el dashboard como app en el celular (Agregar a pantalla principal). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pilas — tus finanzas',
    short_name: 'Pilas',
    description: 'Gastos, deudas, tarjetas y metas en pesos colombianos',
    start_url: '/',
    display: 'standalone',
    background_color: '#060a14',
    theme_color: '#2547d0',
    lang: 'es-CO',
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
