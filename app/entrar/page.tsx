import type { Metadata } from 'next';
import Entrar from '@/components/Entrar';
import { huellaActiva } from './acciones';

export const metadata: Metadata = { title: 'Entrar · Pilas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  // El botón de huella/Face ID solo aparece si ya la activaste dentro de Pilas.
  const conHuella = await huellaActiva().catch(() => false);
  return <Entrar conHuella={conHuella} />;
}
