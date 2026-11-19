import { sql } from './db';

// Mismo contenido que db/schema.sql. Se ejecuta solo una vez por arranque del servidor,
// así las tablas nuevas aparecen sin tener que correr SQL a mano después de actualizar.
const SENTENCIAS = [
  `CREATE TABLE IF NOT EXISTS gastos (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(), concepto TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto >= 0), categoria TEXT NOT NULL DEFAULT 'Otros',
    origen TEXT NOT NULL DEFAULT 'web', texto_original TEXT)`,
  `CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha DESC)`,
  `CREATE TABLE IF NOT EXISTS ingresos (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(), concepto TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto >= 0))`,
  `CREATE TABLE IF NOT EXISTS deudas (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, saldo INTEGER NOT NULL DEFAULT 0,
    cuota INTEGER NOT NULL DEFAULT 0, tasa TEXT, prioridad INTEGER NOT NULL DEFAULT 99)`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS monto_original INTEGER`,
  `UPDATE deudas SET monto_original = saldo WHERE monto_original IS NULL`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'prestamo'`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS cupo INTEGER`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS banco TEXT`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS franquicia TEXT`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS ultimos4 TEXT`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS color TEXT`,
  `CREATE TABLE IF NOT EXISTS compras_credito (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE, concepto TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto > 0), cuotas INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS abonos (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE, monto INTEGER NOT NULL CHECK (monto > 0))`,
  `CREATE TABLE IF NOT EXISTS cuentas (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, banco TEXT, saldo INTEGER NOT NULL DEFAULT 0,
    ultimos4 TEXT, actualizado TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS franquicia TEXT`,
  `ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS color TEXT`,
  `CREATE TABLE IF NOT EXISTS fijos (
    id SERIAL PRIMARY KEY, concepto TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pagos_fijos (
    fijo_id INTEGER NOT NULL REFERENCES fijos(id) ON DELETE CASCADE, mes TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (fijo_id, mes))`,
  `CREATE TABLE IF NOT EXISTS palabras (palabra TEXT PRIMARY KEY, categoria TEXT NOT NULL)`,
];

let listo: Promise<void> | null = null;

/** Crea o actualiza las tablas que falten. Seguro de llamar muchas veces. */
export function asegurarEsquema(): Promise<void> {
  if (!listo) {
    listo = (async () => {
      for (const s of SENTENCIAS) await sql().query(s);
    })().catch((e) => {
      listo = null; // reintenta en la próxima petición
      throw e;
    });
  }
  return listo;
}
