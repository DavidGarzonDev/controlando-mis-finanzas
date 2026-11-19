import type { MetadataRoute } from 'next';

/** Permite instalar el dashboard como app en el celular (Agregar a pantalla principal). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mis Finanzas',
    short_name: 'Finanzas',
    description: 'Gastos, deudas, tarjetas y metas en pesos colombianos',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0e15',
    theme_color: '#2343c4',
    lang: 'es-CO',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
