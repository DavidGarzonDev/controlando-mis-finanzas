/**
 * Bancos y emisores de tarjetas en Colombia. Los colores son aproximados, para reconocer la tarjeta de un vistazo.
 * Los logos no se guardan aquí: se cargan en el navegador desde el sitio de cada banco (ver logoBanco).
 */
export type Banco = {
  id: string; nombre: string; alias: string[]; fondo: [string, string]; tinta: string; acento: string;
  /** Iniciales de respaldo si el logo no carga. */
  sello?: string;
  /** Dominio del banco: el logo se carga en el navegador desde su sitio (no se guarda en el repositorio). */
  dominio?: string;
};

/** URL del logo (ícono del sitio del banco), o null si no tiene. */
export function logoBanco(b: Banco): string | null {
  return b.dominio ? `https://www.google.com/s2/favicons?domain=${b.dominio}&sz=128` : null;
}

export const BANCOS: Banco[] = [
  { id: 'bancolombia', dominio: 'bancolombia.com', nombre: 'Bancolombia', alias: ['bancolombia'], fondo: ['#fdda24', '#f7c900'], tinta: '#141414', acento: '#141414' },
  { id: 'davivienda', dominio: 'davivienda.com', nombre: 'Davivienda', alias: ['davivienda'], fondo: ['#e1251b', '#9e0f0a'], tinta: '#ffffff', acento: '#ffd1cc' },
  { id: 'bbva', dominio: 'bbva.com.co', nombre: 'BBVA', alias: ['bbva'], fondo: ['#1464a5', '#072146'], tinta: '#ffffff', acento: '#5bbeff' },
  { id: 'bogota', dominio: 'bancodebogota.com', nombre: 'Banco de Bogotá', alias: ['banco de bogota'], fondo: ['#1a4a9c', '#0b2559'], tinta: '#ffffff', acento: '#9cc2ff' },
  { id: 'avvillas', dominio: 'avvillas.com.co', nombre: 'AV Villas', alias: ['av villas', 'avvillas', 'villas'], fondo: ['#ee2a2f', '#c8101a'], tinta: '#ffffff', acento: '#ffffff' },
  { id: 'occidente', dominio: 'bancodeoccidente.com.co', nombre: 'Banco de Occidente', alias: ['banco de occidente', 'occidente'], fondo: ['#0a63b0', '#043d6f'], tinta: '#ffffff', acento: '#7fd0ff' },
  { id: 'popular', dominio: 'bancopopular.com.co', nombre: 'Banco Popular', alias: ['banco popular'], fondo: ['#0f8a4b', '#065a2f'], tinta: '#ffffff', acento: '#b7f5cf' },
  { id: 'cajasocial', dominio: 'bancocajasocial.com', nombre: 'Banco Caja Social', alias: ['caja social'], fondo: ['#0b5ea8', '#063a69'], tinta: '#ffffff', acento: '#ffc94d' },
  { id: 'agrario', dominio: 'bancoagrario.gov.co', nombre: 'Banco Agrario', alias: ['banco agrario', 'agrario'], fondo: ['#2e8b3a', '#185e22'], tinta: '#ffffff', acento: '#e6f56a' },
  { id: 'colpatria', dominio: 'scotiabankcolpatria.com', nombre: 'Scotiabank Colpatria', alias: ['scotiabank colpatria', 'colpatria', 'scotiabank', 'scotia'], fondo: ['#e3242b', '#8f0d12'], tinta: '#ffffff', acento: '#ffffff' },
  { id: 'itau', dominio: 'itau.co', nombre: 'Itaú', alias: ['itau'], fondo: ['#f07c00', '#b85300'], tinta: '#ffffff', acento: '#003399' },
  { id: 'falabella', dominio: 'bancofalabella.com.co', nombre: 'Banco Falabella', alias: ['falabella', 'cmr'], fondo: ['#4a9a2c', '#2b6418'], tinta: '#ffffff', acento: '#d9f2c9' },
  { id: 'nu', dominio: 'nu.com.co', nombre: 'Nu', alias: ['nubank', 'nu'], fondo: ['#9a2ee6', '#5d0aa8'], tinta: '#ffffff', acento: '#e7c6ff' },
  { id: 'rappi', dominio: 'rappicard.co', nombre: 'RappiCard', alias: ['rappicard', 'rappi'], fondo: ['#ff5233', '#c0300f'], tinta: '#ffffff', acento: '#fff1ec' },
  { id: 'lulo', dominio: 'lulobank.com', nombre: 'Lulo Bank', alias: ['lulo bank', 'lulo'], fondo: ['#2a2a2a', '#0f0f0f'], tinta: '#ffffff', acento: '#c8ff3c' },
  { id: 'serfinanza', dominio: 'bancoserfinanza.com', nombre: 'Serfinanza', alias: ['serfinanza', 'olimpica'], fondo: ['#00498f', '#002a55'], tinta: '#ffffff', acento: '#ffd23f' },
  { id: 'exito', dominio: 'tuya.com.co', nombre: 'Tarjeta Éxito', alias: ['tarjeta exito', 'tuya'], fondo: ['#f5c400', '#c99c00'], tinta: '#1a1a1a', acento: '#1a1a1a' },
  // Efectivo (la plata física también es una "cuenta")
  { id: 'efectivo', nombre: 'Efectivo', alias: ['efectivo', 'cash', 'billetera fisica'], fondo: ['#2f8f5b', '#17573a'], tinta: '#ffffff', acento: '#c9f2d9', sello: '$' },
  // Billeteras y bancos digitales
  { id: 'nequi', dominio: 'nequi.com.co', nombre: 'Nequi', alias: ['nequi'], fondo: ['#2c0b3f', '#14041f'], tinta: '#ffffff', acento: '#e3218b', sello: 'N' },
  { id: 'daviplata', dominio: 'daviplata.com', nombre: 'Daviplata', alias: ['daviplata'], fondo: ['#e30613', '#8e0a10'], tinta: '#ffffff', acento: '#ffd5d7', sello: 'DP' },
  { id: 'dale', dominio: 'dale.com.co', nombre: 'Dale!', alias: ['dale'], fondo: ['#00a3e0', '#006a94'], tinta: '#ffffff', acento: '#ffe14d', sello: 'D!' },
  { id: 'movii', dominio: 'movii.com.co', nombre: 'Movii', alias: ['movii'], fondo: ['#7f2fd1', '#4b178a'], tinta: '#ffffff', acento: '#9df5d9', sello: 'M' },
  { id: 'uala', dominio: 'uala.com.co', nombre: 'Ualá', alias: ['uala'], fondo: ['#3e6bfd', '#1f3fb8'], tinta: '#ffffff', acento: '#c9d6ff', sello: 'U' },
  { id: 'pibank', dominio: 'pibank.co', nombre: 'Pibank', alias: ['pibank'], fondo: ['#ff6a00', '#c24a00'], tinta: '#ffffff', acento: '#ffe1cc', sello: 'Pi' },
  { id: 'global66', dominio: 'global66.com', nombre: 'Global66', alias: ['global66', 'global 66'], fondo: ['#1f2b5a', '#0e1533'], tinta: '#ffffff', acento: '#3ce0b7', sello: 'G66' },
  // Otros bancos
  { id: 'gnb', dominio: 'gnbsudameris.com.co', nombre: 'GNB Sudameris', alias: ['gnb', 'sudameris'], fondo: ['#00539f', '#00305e'], tinta: '#ffffff', acento: '#9fd0ff', sello: 'GNB' },
  { id: 'pichincha', dominio: 'bancopichincha.com.co', nombre: 'Banco Pichincha', alias: ['pichincha'], fondo: ['#f2c500', '#b99600'], tinta: '#1a1a1a', acento: '#0a2e6b', sello: 'P' },
  { id: 'finandina', dominio: 'bancofinandina.com', nombre: 'Finandina', alias: ['finandina'], fondo: ['#00a19a', '#006862'], tinta: '#ffffff', acento: '#d0f5f2', sello: 'F' },
  { id: 'mibanco', dominio: 'mibanco.com.co', nombre: 'Mibanco', alias: ['mibanco'], fondo: ['#00924a', '#005d2f'], tinta: '#ffffff', acento: '#ffd200', sello: 'MB' },
  { id: 'bancamia', dominio: 'bancamia.com.co', nombre: 'Bancamía', alias: ['bancamia'], fondo: ['#e5007e', '#9c0056'], tinta: '#ffffff', acento: '#ffd1ea', sello: 'BM' },
  { id: 'bancow', dominio: 'bancow.com.co', nombre: 'Banco W', alias: ['banco w'], fondo: ['#5c2d91', '#391a5c'], tinta: '#ffffff', acento: '#f5b300', sello: 'W' },
  { id: 'coopcentral', dominio: 'coopcentral.com.co', nombre: 'Coopcentral', alias: ['coopcentral'], fondo: ['#009640', '#005e28'], tinta: '#ffffff', acento: '#c7f2d6', sello: 'CC' },
  { id: 'codensa', dominio: 'enel.com.co', nombre: 'Crédito Fácil Codensa', alias: ['codensa', 'credito facil'], fondo: ['#ec1c24', '#9c0f14'], tinta: '#ffffff', acento: '#ffffff', sello: 'CF' },
  // Créditos sin tarjeta
  { id: 'addi', dominio: 'addi.com', nombre: 'Addi', alias: ['addi'], fondo: ['#2c5bff', '#1636b8'], tinta: '#ffffff', acento: '#c4d2ff', sello: 'A' },
  { id: 'sistecredito', dominio: 'sistecredito.com', nombre: 'Sistecrédito', alias: ['sistecredito'], fondo: ['#ff7a00', '#c45c00'], tinta: '#ffffff', acento: '#fff0e0', sello: 'S' },
  { id: 'otro', nombre: 'Otro banco', alias: [], fondo: ['#3d4659', '#1c2230'], tinta: '#ffffff', acento: '#c9d2e6' },
];

export const FRANQUICIAS = ['Visa', 'Mastercard', 'American Express', 'Diners', 'Otra'] as const;

/** Acabados para elegir al crear la tarjeta. "banco" usa los colores del banco. */
export type Acabado = { id: string; nombre: string; fondo: [string, string]; tinta: string; acento: string; metal?: boolean };
export const ACABADOS: Acabado[] = [
  { id: 'negro', nombre: 'Negro mate', fondo: ['#2a2c31', '#0c0d10'], tinta: '#f4f4f5', acento: '#9aa0ab' },
  { id: 'grafito', nombre: 'Grafito metálico', fondo: ['#5b6170', '#262a33'], tinta: '#ffffff', acento: '#d5dae3', metal: true },
  { id: 'plata', nombre: 'Plata', fondo: ['#e9ecf1', '#a7afbc'], tinta: '#1b1f27', acento: '#4a5263', metal: true },
  { id: 'oro', nombre: 'Oro', fondo: ['#f1d58a', '#b8893a'], tinta: '#2b1d05', acento: '#5a3d0a', metal: true },
  { id: 'azul', nombre: 'Azul noche', fondo: ['#1f4bd1', '#0b1f66'], tinta: '#ffffff', acento: '#9fb6ff' },
  { id: 'morado', nombre: 'Morado', fondo: ['#8a2be2', '#4b0f8a'], tinta: '#ffffff', acento: '#e3c8ff' },
  { id: 'verde', nombre: 'Verde esmeralda', fondo: ['#0f9d6c', '#065238'], tinta: '#ffffff', acento: '#b8f5dc' },
  { id: 'turquesa', nombre: 'Turquesa', fondo: ['#17b5c9', '#0a6a7a'], tinta: '#ffffff', acento: '#d2f7fc' },
  { id: 'rojo', nombre: 'Rojo', fondo: ['#e0312f', '#8f1412'], tinta: '#ffffff', acento: '#ffd3d2' },
  { id: 'rosa', nombre: 'Rosa', fondo: ['#f06ba8', '#b0306e'], tinta: '#ffffff', acento: '#ffe0ef' },
  { id: 'naranja', nombre: 'Naranja', fondo: ['#ff8a1f', '#c2550a'], tinta: '#ffffff', acento: '#fff0df' },
];

/**
 * Diseño propio de algunas tarjetas (dibujado en CSS, inspirado en el plástico real):
 * Bancolombia amarilla con franjas, Nu lila (débito) o morada metálica (crédito), AV Villas roja en zigzag.
 * Solo aplica con los colores del banco (si eliges otro color, se usa ese).
 */
export function disenoTarjeta(bancoId: string | null | undefined, clase: 'credito' | 'debito'): string | null {
  if (bancoId === 'bancolombia') return 'd-bancolombia';
  if (bancoId === 'nu') return clase === 'debito' ? 'd-nu-debito' : 'd-nu-credito';
  if (bancoId === 'avvillas') return 'd-avvillas';
  if (bancoId === 'nequi') return 'd-nequi';
  if (bancoId === 'efectivo') return 'd-efectivo';
  return null;
}

/** Blanco o casi negro según qué se lea mejor sobre el color. */
function tintaPara(hex: string) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#16181d' : '#ffffff';
}

/**
 * Colores con que se pinta una tarjeta: el acabado elegido, un color libre ("#1a2b3c")
 * o, si no eligió nada, los colores del banco.
 */
export function estiloTarjeta(color: string | null | undefined, bancoId: string | null | undefined) {
  const a = ACABADOS.find((x) => x.id === color);
  if (a) return { t1: a.fondo[0], t2: a.fondo[1], tt: a.tinta, ta: a.acento, metal: !!a.metal };
  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    const tt = tintaPara(color);
    return { t1: color, t2: `color-mix(in oklab, ${color} 62%, black)`, tt, ta: tt === '#ffffff' ? 'rgb(255 255 255 / 0.85)' : 'rgb(0 0 0 / 0.7)', metal: false };
  }
  const b = bancoPorId(bancoId);
  return { t1: b.fondo[0], t2: b.fondo[1], tt: b.tinta, ta: b.acento, metal: false };
}

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
