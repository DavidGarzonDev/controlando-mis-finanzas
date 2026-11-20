/**
 * Comercios conocidos en Colombia: si el concepto los menciona, el movimiento muestra su logo
 * (se carga en el navegador desde el sitio del comercio; no se guarda en el repositorio).
 */
type Comercio = { patron: RegExp; dominio: string; nombre: string };

const COMERCIOS: Comercio[] = [
  { patron: /\brappi\b/i, dominio: 'rappi.com.co', nombre: 'Rappi' },
  { patron: /\bifood\b/i, dominio: 'ifood.com.co', nombre: 'iFood' },
  { patron: /\bdidi\b/i, dominio: 'didiglobal.com', nombre: 'DiDi' },
  { patron: /\buber\b/i, dominio: 'uber.com', nombre: 'Uber' },
  { patron: /\b(in ?drive|indriver)\b/i, dominio: 'indrive.com', nombre: 'inDrive' },
  { patron: /\bcabify\b/i, dominio: 'cabify.com', nombre: 'Cabify' },
  { patron: /\bd1\b/i, dominio: 'd1.com.co', nombre: 'D1' },
  { patron: /\bara\b/i, dominio: 'aratiendas.com', nombre: 'Ara' },
  { patron: /\b[eé]xito\b/i, dominio: 'exito.com', nombre: 'Éxito' },
  { patron: /\bcarulla\b/i, dominio: 'carulla.com', nombre: 'Carulla' },
  { patron: /\bol[ií]mpica\b/i, dominio: 'olimpica.com', nombre: 'Olímpica' },
  { patron: /\bjumbo\b/i, dominio: 'tiendasjumbo.co', nombre: 'Jumbo' },
  { patron: /\bmetro\b/i, dominio: 'tiendasmetro.co', nombre: 'Metro' },
  { patron: /\bisimo\b/i, dominio: 'isimo.com.co', nombre: 'Ísimo' },
  { patron: /\bdollarcity\b/i, dominio: 'dollarcity.com', nombre: 'Dollarcity' },
  { patron: /\bfalabella\b/i, dominio: 'falabella.com.co', nombre: 'Falabella' },
  { patron: /\bmercado ?libre\b/i, dominio: 'mercadolibre.com.co', nombre: 'Mercado Libre' },
  { patron: /\bamazon\b/i, dominio: 'amazon.com', nombre: 'Amazon' },
  { patron: /\btemu\b/i, dominio: 'temu.com', nombre: 'Temu' },
  { patron: /\bshein\b/i, dominio: 'shein.com.co', nombre: 'Shein' },
  { patron: /\bnetflix\b/i, dominio: 'netflix.com', nombre: 'Netflix' },
  { patron: /\bspotify\b/i, dominio: 'spotify.com', nombre: 'Spotify' },
  { patron: /\b(disney|disney\+)\b/i, dominio: 'disneyplus.com', nombre: 'Disney+' },
  { patron: /\b(max|hbo)\b/i, dominio: 'max.com', nombre: 'Max' },
  { patron: /\b(prime video|primevideo)\b/i, dominio: 'primevideo.com', nombre: 'Prime Video' },
  { patron: /\byoutube\b/i, dominio: 'youtube.com', nombre: 'YouTube' },
  { patron: /\bchatgpt|openai\b/i, dominio: 'openai.com', nombre: 'ChatGPT' },
  { patron: /\bplatzi\b/i, dominio: 'platzi.com', nombre: 'Platzi' },
  { patron: /\bsmart ?fit\b/i, dominio: 'smartfit.com.co', nombre: 'Smart Fit' },
  { patron: /\bbodytech\b/i, dominio: 'bodytech.com.co', nombre: 'Bodytech' },
  { patron: /\bclaro\b/i, dominio: 'claro.com.co', nombre: 'Claro' },
  { patron: /\bmovistar\b/i, dominio: 'movistar.co', nombre: 'Movistar' },
  { patron: /\btigo\b/i, dominio: 'tigo.com.co', nombre: 'Tigo' },
  { patron: /\bwom\b/i, dominio: 'wom.co', nombre: 'WOM' },
  { patron: /\bepm\b/i, dominio: 'epm.com.co', nombre: 'EPM' },
  { patron: /\bvanti\b/i, dominio: 'grupovanti.com', nombre: 'Vanti' },
  { patron: /\benel|codensa\b/i, dominio: 'enel.com.co', nombre: 'Enel' },
  { patron: /\bjuan valdez\b/i, dominio: 'juanvaldez.com', nombre: 'Juan Valdez' },
  { patron: /\bstarbucks\b/i, dominio: 'starbucks.com.co', nombre: 'Starbucks' },
  { patron: /\b(mcdonald'?s|mc ?donalds)\b/i, dominio: 'mcdonalds.com.co', nombre: "McDonald's" },
  { patron: /\bkfc\b/i, dominio: 'kfc.co', nombre: 'KFC' },
  { patron: /\bburger king\b/i, dominio: 'burgerking.com.co', nombre: 'Burger King' },
  { patron: /\bfrisby\b/i, dominio: 'frisby.com.co', nombre: 'Frisby' },
  { patron: /\bel corral\b/i, dominio: 'elcorral.com', nombre: 'El Corral' },
  { patron: /\bcrepes\b/i, dominio: 'crepesywaffles.com', nombre: 'Crepes & Waffles' },
  { patron: /\bdomino'?s\b/i, dominio: 'dominos.com.co', nombre: "Domino's" },
  { patron: /\bcine ?colombia\b/i, dominio: 'cinecolombia.com', nombre: 'Cine Colombia' },
  { patron: /\bcinemark\b/i, dominio: 'cinemark.com.co', nombre: 'Cinemark' },
  { patron: /\bcruz verde\b/i, dominio: 'cruzverde.com.co', nombre: 'Cruz Verde' },
  { patron: /\bfarmatodo\b/i, dominio: 'farmatodo.com.co', nombre: 'Farmatodo' },
  { patron: /\b(terpel)\b/i, dominio: 'terpel.com', nombre: 'Terpel' },
  { patron: /\b(primax)\b/i, dominio: 'primax.com.co', nombre: 'Primax' },
  { patron: /\baddi\b/i, dominio: 'addi.com', nombre: 'Addi' },
];

export function comercioDe(texto: string): { nombre: string; logo: string } | null {
  const c = COMERCIOS.find((x) => x.patron.test(texto));
  return c ? { nombre: c.nombre, logo: `https://www.google.com/s2/favicons?domain=${c.dominio}&sz=64` } : null;
}
