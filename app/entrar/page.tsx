import type { Metadata } from 'next';
import Entrar from '@/components/Entrar';

export const metadata: Metadata = { title: 'Entrar · Pilas', robots: { index: false, follow: false } };

export default function Pagina() {
  return <Entrar />;
}
