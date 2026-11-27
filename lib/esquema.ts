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
  // La cuenta de la que salen los gastos cuando no dices cuál
  `ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS principal BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS fijos (
    id SERIAL PRIMARY KEY, concepto TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pagos_fijos (
    fijo_id INTEGER NOT NULL REFERENCES fijos(id) ON DELETE CASCADE, mes TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (fijo_id, mes))`,
  `CREATE TABLE IF NOT EXISTS palabras (palabra TEXT PRIMARY KEY, categoria TEXT NOT NULL)`,
  // Pagar un fijo puede descontarlo de una cuenta (y se devuelve si lo desmarcas)
  `ALTER TABLE pagos_fijos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL`,
  `ALTER TABLE pagos_fijos ADD COLUMN IF NOT EXISTS monto INTEGER`,
  // Cuenta dividida ("la vaca"): los préstamos que salen de un gasto
  `ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS gasto_id INTEGER`,
  // De qué cuenta sale o entra cada movimiento
  `ALTER TABLE gastos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL`,
  `ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL`,
  `ALTER TABLE abonos ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL`,
  // 'cuota' (pago normal del mes) o 'capital' (abono extra a capital)
  `ALTER TABLE abonos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'cuota'`,
  `CREATE TABLE IF NOT EXISTS transferencias (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    desde_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL, hacia_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
    monto INTEGER NOT NULL CHECK (monto > 0), nota TEXT)`,
  // Fechas de pago y de corte
  `ALTER TABLE fijos ADD COLUMN IF NOT EXISTS dia_pago INTEGER`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS dia_pago INTEGER`,
  `ALTER TABLE deudas ADD COLUMN IF NOT EXISTS dia_corte INTEGER`,
  // Topes por categoría y metas de ahorro
  `CREATE TABLE IF NOT EXISTS presupuestos (categoria TEXT PRIMARY KEY, monto INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS metas (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, objetivo INTEGER NOT NULL DEFAULT 0,
    fecha_meta DATE, color TEXT, creada TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS aportes_meta (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    meta_id INTEGER NOT NULL REFERENCES metas(id) ON DELETE CASCADE, monto INTEGER NOT NULL)`,
  // Cuotas que pagaste por fuera de la app: se marcan como pagadas sin mover saldos
  `CREATE TABLE IF NOT EXISTS cuotas_marcadas (
    deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE, mes TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (deuda_id, mes))`,
  // Arreglo de una sola vez: antes cada compra con tarjeta le sumaba su valor a la cuota para siempre.
  // Ahora la cuota guardada es la fija, y las compras se suman solas solo durante sus cuotas.
  `CREATE TABLE IF NOT EXISTS migraciones (id TEXT PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM migraciones WHERE id = 'cuota_sin_compras') THEN
       UPDATE deudas d SET cuota = GREATEST(0, d.cuota - COALESCE(
         (SELECT SUM(ROUND(c.monto::numeric / GREATEST(c.cuotas, 1))) FROM compras_credito c WHERE c.deuda_id = d.id), 0));
       INSERT INTO migraciones (id) VALUES ('cuota_sin_compras');
     END IF;
   END $$`,
  // Retos: semana sin domicilios, días sin pasarte del límite, días sin gastar…
  `CREATE TABLE IF NOT EXISTS retos (
    id SERIAL PRIMARY KEY, tipo TEXT NOT NULL, nombre TEXT NOT NULL, inicio DATE NOT NULL,
    dias INTEGER NOT NULL DEFAULT 7, regla TEXT, monto INTEGER,
    estado TEXT NOT NULL DEFAULT 'activo', avisado BOOLEAN NOT NULL DEFAULT false,
    creado TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Foto diaria de lo que tienes y lo que debes
  `CREATE TABLE IF NOT EXISTS patrimonio_diario (fecha DATE PRIMARY KEY, activos INTEGER NOT NULL, deudas INTEGER NOT NULL)`,
  // Para no mandar el mismo recordatorio dos veces el mismo día
  `CREATE TABLE IF NOT EXISTS recordatorios_enviados (fecha DATE PRIMARY KEY, enviado TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Acceso al dashboard: clave + código por Telegram, sesiones y bloqueo por intentos
  `CREATE TABLE IF NOT EXISTS intentos_acceso (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(), ip TEXT NOT NULL,
    tipo TEXT NOT NULL, exito BOOLEAN NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS intentos_acceso_fecha_idx ON intentos_acceso (fecha DESC)`,
  `CREATE TABLE IF NOT EXISTS codigos_acceso (
    id TEXT PRIMARY KEY, hash TEXT NOT NULL, ip TEXT NOT NULL, recordar BOOLEAN NOT NULL DEFAULT false,
    intentos INTEGER NOT NULL DEFAULT 0, creado TIMESTAMPTZ NOT NULL DEFAULT now(), expira TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sesiones (
    id TEXT PRIMARY KEY, ip TEXT, agente TEXT, creada TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira TIMESTAMPTZ NOT NULL, ultima TIMESTAMPTZ NOT NULL DEFAULT now(), revocada BOOLEAN NOT NULL DEFAULT false)`,
  // Monto en duda ("700": ¿$700 o $700.000?) hasta que lo confirmes con un botón
  `ALTER TABLE gastos ADD COLUMN IF NOT EXISTS duda_monto INTEGER`,
  `ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS duda_monto INTEGER`,
  // Resumen semanal de los domingos (uno por semana)
  `CREATE TABLE IF NOT EXISTS resumenes_semanales (semana DATE PRIMARY KEY, enviado TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Cuando cambias el saldo de una cuenta a mano (para ver la historia completa del saldo)
  `CREATE TABLE IF NOT EXISTS ajustes_saldo (
    id SERIAL PRIMARY KEY, cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(), antes INTEGER NOT NULL, despues INTEGER NOT NULL)`,
  // Desde cuándo se anotan los cambios de saldo a mano (antes de eso el saldo histórico no se puede reconstruir)
  `INSERT INTO migraciones (id) VALUES ('registro_ajustes') ON CONFLICT DO NOTHING`,
  // Ajustes internos (llaves de notificaciones) y dispositivos con notificaciones activadas
  `CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS suscripciones_push (
    endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, nombre TEXT NOT NULL,
    creada TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Huella / Face ID (passkeys): solo la llave pública de cada dispositivo
  `CREATE TABLE IF NOT EXISTS llaves_acceso (
    id TEXT PRIMARY KEY, llave_publica TEXT NOT NULL, contador BIGINT NOT NULL DEFAULT 0, transportes TEXT,
    nombre TEXT NOT NULL, creada TIMESTAMPTZ NOT NULL DEFAULT now(), ultimo_uso TIMESTAMPTZ)`,
  // Notificaciones del banco que pegas en el bot (para no registrar dos veces la misma)
  `DROP TABLE IF EXISTS tokens_api`,
  `CREATE TABLE IF NOT EXISTS notificaciones_vistas (huella TEXT PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Préstamos a personas: la plata sale de tu cuenta pero no es gasto; queda como "te deben"
  `CREATE TABLE IF NOT EXISTS prestamos (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(), persona TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto > 0), pendiente INTEGER NOT NULL CHECK (pendiente >= 0),
    cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL, nota TEXT)`,
  `CREATE TABLE IF NOT EXISTS pagos_prestamo (
    id SERIAL PRIMARY KEY, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    prestamo_id INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
    monto INTEGER NOT NULL CHECK (monto > 0), cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL)`,
  // Categorías que crea el usuario, con su emoji y color
  `CREATE TABLE IF NOT EXISTS categorias_propias (
    nombre TEXT PRIMARY KEY, emoji TEXT, color TEXT, creada TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS bloqueos (
    id SERIAL PRIMARY KEY, ip TEXT, hasta TIMESTAMPTZ NOT NULL, motivo TEXT, creado TIMESTAMPTZ NOT NULL DEFAULT now())`,
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
