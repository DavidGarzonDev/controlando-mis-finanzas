/**
 * Datos del proyecto Pilas (los ve todo el que lo instale).
 * Llena aquí tus enlaces de donación: lo que quede vacío no se muestra.
 */
export const PROYECTO = {
  nombre: 'Pilas',
  repo: 'https://github.com/DavidGarzonDev/controlando-mis-finanzas',
  donaciones: {
    /** Llave Bre-B (ej. "@tunombre", tu correo o tu celular). Sirve desde cualquier banco en Colombia. */
    llaveBreB: '',
    /** Número de Nequi (si prefieres no usar la llave). */
    nequi: '',
    /** https://ko-fi.com/tuusuario — pagos con tarjeta desde cualquier país. */
    kofi: '',
    /** https://paypal.me/tuusuario */
    paypal: '',
    /** https://github.com/sponsors/tuusuario */
    githubSponsors: '',
    /** Binance Pay ID (un número; está en Binance → Perfil → Pay ID). Gratis y al instante entre usuarios de Binance. */
    binancePayId: '',
    /** Dirección para recibir USDT desde cualquier exchange o billetera. Pon también la red (ej. "TRC20" o "BEP20"). */
    usdtDireccion: '',
    usdtRed: '',
  },
};

export type MetodoDonacion = { id: string; nombre: string; valor: string; enlace: string | null; copiar: boolean };

/** Los métodos de donación que tienen dato, listos para mostrar. */
export function metodosDonacion(): MetodoDonacion[] {
  const d = PROYECTO.donaciones;
  const m: MetodoDonacion[] = [];
  if (d.llaveBreB) m.push({ id: 'breb', nombre: 'Llave Bre-B', valor: d.llaveBreB, enlace: null, copiar: true });
  if (d.nequi) m.push({ id: 'nequi', nombre: 'Nequi', valor: d.nequi, enlace: null, copiar: true });
  if (d.kofi) m.push({ id: 'kofi', nombre: 'Ko-fi', valor: d.kofi.replace(/^https?:\/\//, ''), enlace: d.kofi, copiar: false });
  if (d.paypal) m.push({ id: 'paypal', nombre: 'PayPal', valor: d.paypal.replace(/^https?:\/\//, ''), enlace: d.paypal, copiar: false });
  if (d.binancePayId) m.push({ id: 'binance', nombre: 'Binance Pay ID', valor: d.binancePayId, enlace: null, copiar: true });
  if (d.usdtDireccion) m.push({ id: 'usdt', nombre: `USDT${d.usdtRed ? ` (red ${d.usdtRed}, no otra)` : ''}`, valor: d.usdtDireccion, enlace: null, copiar: true });
  if (d.githubSponsors) m.push({ id: 'github', nombre: 'GitHub Sponsors', valor: d.githubSponsors.replace(/^https?:\/\//, ''), enlace: d.githubSponsors, copiar: false });
  return m;
}
