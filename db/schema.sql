-- Tablas de Mis Finanzas.
-- No hace falta ejecutarlo a mano: la app crea y actualiza las tablas sola al arrancar (lib/esquema.ts).
-- Si prefieres hacerlo tú, pégalo en el SQL Editor de Neon; se puede correr varias veces sin problema.

CREATE TABLE IF NOT EXISTS gastos (
  id             SERIAL PRIMARY KEY,
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
  concepto       TEXT NOT NULL,
  monto          INTEGER NOT NULL CHECK (monto >= 0),
  categoria      TEXT NOT NULL DEFAULT 'Otros',   -- Comida, Transporte, … o 'Ajuste'
  origen         TEXT NOT NULL DEFAULT 'web',     -- 'telegram' o 'web'
  texto_original TEXT
);
CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha DESC);

CREATE TABLE IF NOT EXISTS ingresos (
  id       SERIAL PRIMARY KEY,
  fecha    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concepto TEXT NOT NULL,
  monto    INTEGER NOT NULL CHECK (monto >= 0)
);

-- Créditos: tarjetas de crédito, préstamos y otras deudas
CREATE TABLE IF NOT EXISTS deudas (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL,
  saldo     INTEGER NOT NULL DEFAULT 0,
  cuota     INTEGER NOT NULL DEFAULT 0,
  tasa      TEXT,
  prioridad INTEGER NOT NULL DEFAULT 99
);
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS monto_original INTEGER;
UPDATE deudas SET monto_original = saldo WHERE monto_original IS NULL;
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'prestamo';  -- 'tarjeta', 'prestamo', 'otro'
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS cupo INTEGER;
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS banco TEXT;        -- id de lib/bancos.ts
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS franquicia TEXT;
ALTER TABLE deudas ADD COLUMN IF NOT EXISTS ultimos4 TEXT;

-- Pagos a créditos (restan saldo) y compras con tarjeta (suman saldo)
CREATE TABLE IF NOT EXISTS abonos (
  id       SERIAL PRIMARY KEY,
  fecha    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE,
  monto    INTEGER NOT NULL CHECK (monto > 0)
);
CREATE TABLE IF NOT EXISTS compras_credito (
  id       SERIAL PRIMARY KEY,
  fecha    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto    INTEGER NOT NULL CHECK (monto > 0),
  cuotas   INTEGER NOT NULL DEFAULT 1
);

-- Cuentas de ahorro, tarjetas débito y billeteras (Nequi, Daviplata…)
CREATE TABLE IF NOT EXISTS cuentas (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  banco       TEXT,
  saldo       INTEGER NOT NULL DEFAULT 0,
  ultimos4    TEXT,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fijos (
  id       SERIAL PRIMARY KEY,
  concepto TEXT NOT NULL,
  monto    INTEGER NOT NULL DEFAULT 0
);
-- Qué fijos ya pagaste cada mes ('2026-11')
CREATE TABLE IF NOT EXISTS pagos_fijos (
  fijo_id INTEGER NOT NULL REFERENCES fijos(id) ON DELETE CASCADE,
  mes     TEXT NOT NULL,
  fecha   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fijo_id, mes)
);

-- Palabras que el bot aprende cuando corriges una categoría con /cat
CREATE TABLE IF NOT EXISTS palabras (
  palabra   TEXT PRIMARY KEY,
  categoria TEXT NOT NULL
);
