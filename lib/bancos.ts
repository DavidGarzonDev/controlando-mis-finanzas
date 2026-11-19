/**
 * Bancos y emisores de tarjetas en Colombia. Los colores son aproximados, solo para reconocer
 * la tarjeta de un vistazo en la billetera; no se usan logos ni marcas gráficas.
 */
export type Banco = {
  id: string; nombre: string; alias: string[]; fondo: [string, string]; tinta: string; acento: string;
  /** Iniciales para el sello de la tarjeta (sin usar logos). */
  sello?: string;
};

export const BANCOS: Banco[] = [
  { id: 'bancolombia', nombre: 'Bancolombia', alias: ['bancolombia'], fondo: ['#2b2b2b', '#121212'], tinta: '#ffffff', acento: '#fdda24' },
  { id: 'davivienda', nombre: 'Davivienda', alias: ['davivienda'], fondo: ['#e1251b', '#9e0f0a'], tinta: '#ffffff', acento: '#ffd1cc' },
  { id: 'bbva', nombre: 'BBVA', alias: ['bbva'], fondo: ['#1464a5', '#072146'], tinta: '#ffffff', acento: '#5bbeff' },
  { id: 'bogota', nombre: 'Banco de Bogotá', alias: ['banco de bogota'], fondo: ['#1a4a9c', '#0b2559'], tinta: '#ffffff', acento: '#9cc2ff' },
  { id: 'avvillas', nombre: 'AV Villas', alias: ['av villas', 'avvillas', 'villas'], fondo: ['#0b5bb5', '#063574'], tinta: '#ffffff', acento: '#ff5a5f' },
  { id: 'occidente', nombre: 'Banco de Occidente', alias: ['banco de occidente', 'occidente'], fondo: ['#0a63b0', '#043d6f'], tinta: '#ffffff', acento: '#7fd0ff' },
  { id: 'popular', nombre: 'Banco Popular', alias: ['banco popular'], fondo: ['#0f8a4b', '#065a2f'], tinta: '#ffffff', acento: '#b7f5cf' },
  { id: 'cajasocial', nombre: 'Banco Caja Social', alias: ['caja social'], fondo: ['#0b5ea8', '#063a69'], tinta: '#ffffff', acento: '#ffc94d' },
  { id: 'agrario', nombre: 'Banco Agrario', alias: ['banco agrario', 'agrario'], fondo: ['#2e8b3a', '#185e22'], tinta: '#ffffff', acento: '#e6f56a' },
  { id: 'colpatria', nombre: 'Scotiabank Colpatria', alias: ['scotiabank colpatria', 'colpatria', 'scotiabank', 'scotia'], fondo: ['#e3242b', '#8f0d12'], tinta: '#ffffff', acento: '#ffffff' },
  { id: 'itau', nombre: 'Itaú', alias: ['itau'], fondo: ['#f07c00', '#b85300'], tinta: '#ffffff', acento: '#003399' },
  { id: 'falabella', nombre: 'Banco Falabella', alias: ['falabella', 'cmr'], fondo: ['#4a9a2c', '#2b6418'], tinta: '#ffffff', acento: '#d9f2c9' },
  { id: 'nu', nombre: 'Nu', alias: ['nubank', 'nu'], fondo: ['#8a19d6', '#530a8a'], tinta: '#ffffff', acento: '#e7c6ff' },
  { id: 'rappi', nombre: 'RappiCard', alias: ['rappicard', 'rappi'], fondo: ['#ff5233', '#c0300f'], tinta: '#ffffff', acento: '#fff1ec' },
  { id: 'lulo', nombre: 'Lulo Bank', alias: ['lulo bank', 'lulo'], fondo: ['#2a2a2a', '#0f0f0f'], tinta: '#ffffff', acento: '#c8ff3c' },
  { id: 'serfinanza', nombre: 'Serfinanza', alias: ['serfinanza', 'olimpica'], fondo: ['#00498f', '#002a55'], tinta: '#ffffff', acento: '#ffd23f' },
  { id: 'exito', nombre: 'Tarjeta Éxito', alias: ['tarjeta exito', 'tuya'], fondo: ['#f5c400', '#c99c00'], tinta: '#1a1a1a', acento: '#1a1a1a' },
  // Billeteras y bancos digitales
  { id: 'nequi', nombre: 'Nequi', alias: ['nequi'], fondo: ['#2c0b3f', '#14041f'], tinta: '#ffffff', acento: '#e3218b', sello: 'N' },
  { id: 'daviplata', nombre: 'Daviplata', alias: ['daviplata'], fondo: ['#e30613', '#8e0a10'], tinta: '#ffffff', acento: '#ffd5d7', sello: 'DP' },
  { id: 'dale', nombre: 'Dale!', alias: ['dale'], fondo: ['#00a3e0', '#006a94'], tinta: '#ffffff', acento: '#ffe14d', sello: 'D!' },
  { id: 'movii', nombre: 'Movii', alias: ['movii'], fondo: ['#7f2fd1', '#4b178a'], tinta: '#ffffff', acento: '#9df5d9', sello: 'M' },
  { id: 'uala', nombre: 'Ualá', alias: ['uala'], fondo: ['#3e6bfd', '#1f3fb8'], tinta: '#ffffff', acento: '#c9d6ff', sello: 'U' },
  { id: 'pibank', nombre: 'Pibank', alias: ['pibank'], fondo: ['#ff6a00', '#c24a00'], tinta: '#ffffff', acento: '#ffe1cc', sello: 'Pi' },
  { id: 'global66', nombre: 'Global66', alias: ['global66', 'global 66'], fondo: ['#1f2b5a', '#0e1533'], tinta: '#ffffff', acento: '#3ce0b7', sello: 'G66' },
  // Otros bancos
  { id: 'gnb', nombre: 'GNB Sudameris', alias: ['gnb', 'sudameris'], fondo: ['#00539f', '#00305e'], tinta: '#ffffff', acento: '#9fd0ff', sello: 'GNB' },
  { id: 'pichincha', nombre: 'Banco Pichincha', alias: ['pichincha'], fondo: ['#f2c500', '#b99600'], tinta: '#1a1a1a', acento: '#0a2e6b', sello: 'P' },
  { id: 'finandina', nombre: 'Finandina', alias: ['finandina'], fondo: ['#00a19a', '#006862'], tinta: '#ffffff', acento: '#d0f5f2', sello: 'F' },
  { id: 'mibanco', nombre: 'Mibanco', alias: ['mibanco'], fondo: ['#00924a', '#005d2f'], tinta: '#ffffff', acento: '#ffd200', sello: 'MB' },
  { id: 'bancamia', nombre: 'Bancamía', alias: ['bancamia'], fondo: ['#e5007e', '#9c0056'], tinta: '#ffffff', acento: '#ffd1ea', sello: 'BM' },
  { id: 'bancow', nombre: 'Banco W', alias: ['banco w'], fondo: ['#5c2d91', '#391a5c'], tinta: '#ffffff', acento: '#f5b300', sello: 'W' },
  { id: 'coopcentral', nombre: 'Coopcentral', alias: ['coopcentral'], fondo: ['#009640', '#005e28'], tinta: '#ffffff', acento: '#c7f2d6', sello: 'CC' },
  { id: 'codensa', nombre: 'Crédito Fácil Codensa', alias: ['codensa', 'credito facil'], fondo: ['#ec1c24', '#9c0f14'], tinta: '#ffffff', acento: '#ffffff', sello: 'CF' },
  // Créditos sin tarjeta
  { id: 'addi', nombre: 'Addi', alias: ['addi'], fondo: ['#2c5bff', '#1636b8'], tinta: '#ffffff', acento: '#c4d2ff', sello: 'A' },
  { id: 'sistecredito', nombre: 'Sistecrédito', alias: ['sistecredito'], fondo: ['#ff7a00', '#c45c00'], tinta: '#ffffff', acento: '#fff0e0', sello: 'S' },
  { id: 'otro', nombre: 'Otro banco', alias: [], fondo: ['#3d4659', '#1c2230'], tinta: '#ffffff', acento: '#c9d2e6' },
];

export const FRANQUICIAS = ['Visa', 'Mastercard', 'American Express', 'Diners'] as const;

/** Iniciales para el sello: "AV Villas" → "AV", "Banco de Bogotá" → "BB". */
export function sello(b: Banco): string {
  if (b.sello) return b.sello;
  const palabras = b.nombre.replace(/^(Banco|Tarjeta)\s+(de\s+)?/i, '').split(/\s+/);
  return palabras.length > 1 ? (palabras[0][0] + palabras[1][0]).toUpperCase() : palabras[0].slice(0, 2);
}

export function bancoPorId(id: string | null | undefined): Banco {
  return BANCOS.find((b) => b.id === id) ?? BANCOS[BANCOS.length - 1];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Encuentra el banco mencionado en un texto libre ("compré con la av villas"). */
export function bancoEnTexto(texto: string): Banco | null {
  const t = ` ${norm(texto).replace(/[^\p{L}\d]+/gu, ' ')} `;
  let mejor: { b: Banco; largo: number } | null = null;
  for (const b of BANCOS) {
    for (const a of b.alias) {
      if (t.includes(` ${a} `) && (!mejor || a.length > mejor.largo)) mejor = { b, largo: a.length };
    }
  }
  return mejor?.b ?? null;
}
