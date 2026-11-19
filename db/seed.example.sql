-- Opcional: datos de ejemplo para arrancar. Ejecútalo una sola vez después de schema.sql.
-- Copia este archivo como db/seed.sql (ese nombre está en .gitignore, no se sube a GitHub),
-- cambia los valores por los tuyos y pégalo en el SQL Editor de Neon.
-- También puedes saltarte esto y cargar todo desde el dashboard.

-- prioridad 1 = la que pagas primero (normalmente la de tasa más alta)
INSERT INTO deudas (nombre, saldo, cuota, tasa, prioridad) VALUES
  ('Tarjeta de crédito', 500000, 50000, '30% E.A.', 1),
  ('Préstamo', 1000000, 80000, '25% E.A.', 2);

INSERT INTO fijos (concepto, monto) VALUES
  ('Arriendo', 600000),
  ('Mercado', 300000),
  ('Plan de datos', 40000),
  ('Gimnasio', 60000);
