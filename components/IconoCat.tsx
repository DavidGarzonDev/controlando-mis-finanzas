import { ICONO_CAT, emojiCat, esPropia } from './util';

/** Ícono de la categoría: el de Lucide para las de siempre; el emoji para las que creaste tú. */
export function IconoCat({ c, size = 16 }: { c: string; size?: number }) {
  if (esPropia(c) || !ICONO_CAT[c]) {
    const e = emojiCat(c);
    if (e) return <span className="ico-emoji" style={{ fontSize: size * 0.95, lineHeight: 1 }} aria-hidden>{e}</span>;
  }
  const Icono = ICONO_CAT[c] ?? ICONO_CAT.Otros;
  return <Icono size={size} aria-hidden />;
}
