-- Ejecuta esto una sola vez en el SQL Editor de Neon.

CREATE TABLE IF NOT EXISTS gastos (
  id             SERIAL PRIMARY KEY,
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
  concepto       TEXT NOT NULL,
  monto          INTEGER NOT NULL CHECK (monto >= 0),
  categoria      TEXT NOT NULL DEFAULT 'Otros',
  origen         TEXT NOT NULL DEFAULT 'web',      -- 'telegram' o 'web'
  texto_original TEXT
);
CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha DESC);

CREATE TABLE IF NOT EXISTS ingresos (
  id       SERIAL PRIMARY KEY,
  fecha    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concepto TEXT NOT NULL,
  monto    INTEGER NOT NULL CHECK (monto >= 0)
);

CREATE TABLE IF NOT EXISTS deudas (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL,
  saldo     INTEGER NOT NULL DEFAULT 0,
  cuota     INTEGER NOT NULL DEFAULT 0,
  tasa      TEXT,
  prioridad INTEGER NOT NULL DEFAULT 99
);

CREATE TABLE IF NOT EXISTS fijos (
  id       SERIAL PRIMARY KEY,
  concepto TEXT NOT NULL,
  monto    INTEGER NOT NULL DEFAULT 0
);

-- Palabras que el bot aprende cuando corriges una categoría con /cat
CREATE TABLE IF NOT EXISTS palabras (
  palabra   TEXT PRIMARY KEY,
  categoria TEXT NOT NULL
);
