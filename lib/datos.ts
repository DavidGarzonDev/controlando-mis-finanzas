import { sql } from './db';
import { esCategoria, type Categoria } from './categorias';
import { ZONA } from './config';
import { hoyEnColombia, mesClave, proximoPago, type ProximoPago } from './fechas';

export type Gasto = { id: number; fecha: string; concepto: string; monto: number; categoria: string; origen: string };
export type Ingreso = { id: number; fecha: string; concepto: string; monto: number };
export type TipoCredito = 'tarjeta' | 'prestamo' | 'otro';
export type Deuda = {
  id: number; nombre: string; tipo: TipoCredito; saldo: number; cuota: number; tasa: string | null; prioridad: number;
  /** Solo tarjetas: el cupo total, el banco, la franquicia y los últimos 4 dígitos. */
  cupo: number | null;
  banco: string | null;
  franquicia: string | null;
  ultimos4: string | null;
  montoOriginal: number; abonadoMes: number;
};
export type Cuenta = { id: number; nombre: string; banco: string | null; saldo: number; ultimos4: string | null; actualizado: string };
export type Fijo = { id: number; concepto: string; monto: number; pagadoMes: boolean };
export type Pendiente = { tipo: 'cuota' | 'fijo'; id: number; nombre: string; monto: number };
export type MesHistorial = { mes: string; ingresos: number; gastos: number };

export type Resumen = {
  ingresos: number;
  cuotas: number;
  fijos: number;
  variables: number;
  /** Abonos a deudas por encima de la cuota del mes: también salen de tu bolsillo. */
  extraAbonos: number;
  disponible: number;
  porCategoria: { categoria: string; total: number }[];
  porCategoriaMesAnterior: { categoria: string; total: number }[];
  gastadoHoy: number;
  /** Lo que puedes gastar hoy para que la plata alcance hasta el próximo pago. */
  presupuestoHoy: number;
  proximoPago: ProximoPago;
  /** Promedio diario de gasto de los últimos 7 días. */
  ritmo7: number;
  pendientes: Pendiente[];
  totalPendiente: number;
  diaHoy: number;
  diasMes: number;
};

const n = (v: unknown) => Number(v) || 0;
const ESTE_MES = (col: string) =>
  `date_trunc('month', ${col} AT TIME ZONE '${ZONA}') = date_trunc('month', now() AT TIME ZONE '${ZONA}')`;

// ---------- Gastos ----------

export async function insertarGasto(g: {
  concepto: string; monto: number; categoria: string; origen: 'telegram' | 'web'; texto?: string;
}) {
  const rows = await sql()`
    INSERT INTO gastos (concepto, monto, categoria, origen, texto_original)
    VALUES (${g.concepto}, ${g.monto}, ${g.categoria}, ${g.origen}, ${g.texto ?? null})
    RETURNING id`;
  return n(rows[0].id);
}

export async function actualizarGasto(id: number, g: { concepto: string; monto: number; categoria: string }) {
  await sql()`UPDATE gastos SET concepto = ${g.concepto}, monto = ${g.monto}, categoria = ${g.categoria} WHERE id = ${id}`;
}

export async function borrarGasto(id: number) {
  await sql()`DELETE FROM gastos WHERE id = ${id}`;
}

export async function ultimoGasto(): Promise<Gasto | null> {
  const rows = await sql()`SELECT id, fecha, concepto, monto, categoria, origen FROM gastos ORDER BY id DESC LIMIT 1`;
  return rows[0] ? ({ ...(rows[0] as Gasto), monto: n(rows[0].monto) }) : null;
}

export async function gastosDelMes(): Promise<Gasto[]> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto, categoria, origen FROM gastos WHERE ${ESTE_MES('fecha')} ORDER BY fecha DESC, id DESC`,
  );
  return rows.map((r) => ({ ...(r as Gasto), monto: n(r.monto) }));
}

export async function gastosDeHoy(): Promise<Gasto[]> {
  const rows = await sql()`
    SELECT id, fecha, concepto, monto, categoria, origen FROM gastos
    WHERE (fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
    ORDER BY fecha`;
  return rows.map((r) => ({ ...(r as Gasto), monto: n(r.monto) }));
}

/** Total gastado por cada día del mes actual (índice 0 = día 1). */
export async function gastosPorDia(): Promise<number[]> {
  const rows = await sql().query(
    `SELECT EXTRACT(DAY FROM fecha AT TIME ZONE '${ZONA}')::int AS dia, SUM(monto) AS total
     FROM gastos WHERE ${ESTE_MES('fecha')} GROUP BY 1`,
  );
  const { diasMes } = hoyEnColombia();
  const out = Array.from({ length: diasMes }, () => 0);
  for (const r of rows) out[n(r.dia) - 1] = n(r.total);
  return out;
}

// ---------- Ingresos ----------

export async function insertarIngreso(i: { concepto: string; monto: number }) {
  await sql()`INSERT INTO ingresos (concepto, monto) VALUES (${i.concepto}, ${i.monto})`;
}
export async function actualizarIngreso(id: number, i: { concepto: string; monto: number }) {
  await sql()`UPDATE ingresos SET concepto = ${i.concepto}, monto = ${i.monto} WHERE id = ${id}`;
}
export async function borrarIngreso(id: number) {
  await sql()`DELETE FROM ingresos WHERE id = ${id}`;
}
export async function ingresosDelMes(): Promise<Ingreso[]> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto FROM ingresos WHERE ${ESTE_MES('fecha')} ORDER BY fecha DESC, id DESC`,
  );
  return rows.map((r) => ({ ...(r as Ingreso), monto: n(r.monto) }));
}

// ---------- Deudas ----------

export async function deudas(): Promise<Deuda[]> {
  const rows = await sql().query(
    `SELECT d.id, d.nombre, d.tipo, d.cupo, d.banco, d.franquicia, d.ultimos4, d.saldo, d.cuota, d.tasa, d.prioridad,
            COALESCE(d.monto_original, d.saldo) AS monto_original,
            COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.deuda_id = d.id AND ${ESTE_MES('a.fecha')}), 0) AS abonado_mes
     FROM deudas d ORDER BY d.prioridad, d.id`,
  );
  return rows.map((r) => ({
    id: n(r.id), nombre: String(r.nombre), saldo: n(r.saldo), cuota: n(r.cuota),
    tipo: (['tarjeta', 'prestamo', 'otro'].includes(String(r.tipo)) ? r.tipo : 'prestamo') as TipoCredito,
    cupo: r.cupo == null ? null : n(r.cupo),
    banco: (r.banco as string | null) || null,
    franquicia: (r.franquicia as string | null) || null,
    ultimos4: (r.ultimos4 as string | null) || null,
    tasa: (r.tasa as string | null) || null, prioridad: n(r.prioridad),
    montoOriginal: Math.max(n(r.monto_original), n(r.saldo)), abonadoMes: n(r.abonado_mes),
  }));
}

export async function guardarDeuda(
  id: number | null,
  d: {
    nombre: string; tipo: TipoCredito; saldo: number; cuota: number; tasa: string | null; prioridad: number;
    cupo: number | null; banco: string | null; franquicia: string | null; ultimos4: string | null;
  },
) {
  if (id) {
    await sql()`
      UPDATE deudas SET nombre = ${d.nombre}, tipo = ${d.tipo}, cupo = ${d.cupo}, banco = ${d.banco},
        franquicia = ${d.franquicia}, ultimos4 = ${d.ultimos4}, saldo = ${d.saldo}, cuota = ${d.cuota},
        tasa = ${d.tasa}, prioridad = ${d.prioridad}, monto_original = GREATEST(COALESCE(monto_original, 0), ${d.saldo})
      WHERE id = ${id}`;
  } else {
    await sql()`
      INSERT INTO deudas (nombre, tipo, cupo, banco, franquicia, ultimos4, saldo, cuota, tasa, prioridad, monto_original)
      VALUES (${d.nombre}, ${d.tipo}, ${d.cupo}, ${d.banco}, ${d.franquicia}, ${d.ultimos4}, ${d.saldo}, ${d.cuota}, ${d.tasa}, ${d.prioridad}, ${d.saldo})`;
  }
}

/**
 * Compra con tarjeta (o cualquier cargo nuevo a un crédito): sube el saldo.
 * Si se difiere a N cuotas, la cuota mensual sube en monto / N.
 * No cuenta como gasto del mes: la plata sale de tu bolsillo cuando pagas la cuota.
 */
export async function registrarCompraCredito(id: number, c: { concepto: string; monto: number; cuotas: number }) {
  const cuotas = Math.max(1, Math.min(72, Math.round(c.cuotas || 1)));
  const rows = await sql()`
    UPDATE deudas SET saldo = saldo + ${c.monto}, monto_original = COALESCE(monto_original, 0) + ${c.monto},
      cuota = cuota + ${Math.round(c.monto / cuotas)}
    WHERE id = ${id} RETURNING nombre, saldo, cuota, cupo`;
  if (!rows[0]) return null;
  await sql()`INSERT INTO compras_credito (deuda_id, concepto, monto, cuotas) VALUES (${id}, ${c.concepto}, ${c.monto}, ${cuotas})`;
  return { nombre: String(rows[0].nombre), saldo: n(rows[0].saldo), cuota: n(rows[0].cuota), cupo: rows[0].cupo == null ? null : n(rows[0].cupo) };
}

export type MovCredito = { id: string; fecha: string; tipo: 'compra' | 'abono'; concepto: string; monto: number; cuotas: number };

/** Últimas compras y abonos de un crédito. */
export async function movimientosCredito(): Promise<Record<number, MovCredito[]>> {
  const rows = await sql()`
    SELECT * FROM (
      SELECT 'c' || id AS id, deuda_id, fecha, 'compra' AS tipo, concepto, monto, cuotas FROM compras_credito
      UNION ALL
      SELECT 'a' || id, deuda_id, fecha, 'abono', 'Abono', monto, 1 FROM abonos
    ) m ORDER BY fecha DESC LIMIT 200`;
  const out: Record<number, MovCredito[]> = {};
  for (const r of rows) {
    const k = n(r.deuda_id);
    (out[k] ??= []).length < 6 &&
      out[k].push({ id: String(r.id), fecha: String(r.fecha), tipo: r.tipo as 'compra' | 'abono', concepto: String(r.concepto), monto: n(r.monto), cuotas: n(r.cuotas) });
  }
  return out;
}

export async function borrarDeuda(id: number) {
  await sql()`DELETE FROM deudas WHERE id = ${id}`;
}

async function abonar(id: number, monto: number) {
  const rows = await sql()`
    UPDATE deudas SET saldo = GREATEST(saldo - ${monto}, 0) WHERE id = ${id}
    RETURNING id, nombre, saldo, cuota`;
  if (!rows[0]) return null;
  await sql()`INSERT INTO abonos (deuda_id, monto) VALUES (${id}, ${monto})`;
  return { id: n(rows[0].id), nombre: String(rows[0].nombre), saldo: n(rows[0].saldo), cuota: n(rows[0].cuota) };
}

export async function abonarDeudaPorId(id: number, monto: number) {
  return abonar(id, monto);
}

// ---------- Cuentas (débito y billeteras) ----------

export async function cuentas(): Promise<Cuenta[]> {
  const rows = await sql()`SELECT id, nombre, banco, saldo, ultimos4, actualizado FROM cuentas ORDER BY saldo DESC, id`;
  return rows.map((r) => ({
    id: n(r.id), nombre: String(r.nombre), banco: (r.banco as string | null) || null, saldo: n(r.saldo),
    ultimos4: (r.ultimos4 as string | null) || null, actualizado: String(r.actualizado),
  }));
}
export async function guardarCuenta(id: number | null, c: { nombre: string; banco: string | null; saldo: number; ultimos4: string | null }) {
  if (id) {
    await sql()`UPDATE cuentas SET nombre = ${c.nombre}, banco = ${c.banco}, saldo = ${c.saldo}, ultimos4 = ${c.ultimos4}, actualizado = now() WHERE id = ${id}`;
  } else {
    await sql()`INSERT INTO cuentas (nombre, banco, saldo, ultimos4) VALUES (${c.nombre}, ${c.banco}, ${c.saldo}, ${c.ultimos4})`;
  }
}
export async function actualizarSaldoCuenta(id: number, saldo: number) {
  await sql()`UPDATE cuentas SET saldo = ${saldo}, actualizado = now() WHERE id = ${id}`;
}
export async function borrarCuenta(id: number) {
  await sql()`DELETE FROM cuentas WHERE id = ${id}`;
}

// ---------- Fijos ----------

export async function fijos(): Promise<Fijo[]> {
  const mes = mesClave();
  const rows = await sql()`
    SELECT f.id, f.concepto, f.monto,
           EXISTS (SELECT 1 FROM pagos_fijos p WHERE p.fijo_id = f.id AND p.mes = ${mes}) AS pagado
    FROM fijos f ORDER BY f.monto DESC, f.id`;
  return rows.map((r) => ({ id: n(r.id), concepto: String(r.concepto), monto: n(r.monto), pagadoMes: r.pagado === true }));
}
export async function guardarFijo(id: number | null, f: { concepto: string; monto: number }) {
  if (id) await sql()`UPDATE fijos SET concepto = ${f.concepto}, monto = ${f.monto} WHERE id = ${id}`;
  else await sql()`INSERT INTO fijos (concepto, monto) VALUES (${f.concepto}, ${f.monto})`;
}
export async function borrarFijo(id: number) {
  await sql()`DELETE FROM fijos WHERE id = ${id}`;
}
export async function marcarFijo(id: number, pagado: boolean) {
  const mes = mesClave();
  if (pagado) await sql()`INSERT INTO pagos_fijos (fijo_id, mes) VALUES (${id}, ${mes}) ON CONFLICT DO NOTHING`;
  else await sql()`DELETE FROM pagos_fijos WHERE fijo_id = ${id} AND mes = ${mes}`;
}
// ---------- Palabras aprendidas ----------

export async function palabrasAprendidas(): Promise<Record<string, Categoria>> {
  const rows = await sql()`SELECT palabra, categoria FROM palabras`;
  const out: Record<string, Categoria> = {};
  for (const r of rows) if (esCategoria(String(r.categoria))) out[String(r.palabra)] = r.categoria as Categoria;
  return out;
}
export async function aprenderPalabras(palabras: string[], categoria: Categoria) {
  for (const p of palabras) {
    await sql()`
      INSERT INTO palabras (palabra, categoria) VALUES (${p}, ${categoria})
      ON CONFLICT (palabra) DO UPDATE SET categoria = EXCLUDED.categoria`;
  }
}

// ---------- Historial ----------

/** Ingresos y gastos registrados de los últimos `meses` meses (incluye el actual), del más viejo al más nuevo. */
export async function historial(meses = 6): Promise<MesHistorial[]> {
  const rows = await sql().query(
    `WITH m AS (
       SELECT to_char(date_trunc('month', now() AT TIME ZONE '${ZONA}') - (i || ' month')::interval, 'YYYY-MM') AS mes
       FROM generate_series(0, $1 - 1) AS i)
     SELECT m.mes,
       COALESCE((SELECT SUM(monto) FROM ingresos WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') = m.mes), 0) AS ingresos,
       COALESCE((SELECT SUM(monto) FROM gastos WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') = m.mes), 0) AS gastos
     FROM m ORDER BY m.mes`,
    [meses],
  );
  return rows.map((r) => ({ mes: String(r.mes), ingresos: n(r.ingresos), gastos: n(r.gastos) }));
}

// ---------- Resumen ----------

export async function resumen(): Promise<Resumen> {
  const [[tot], cats, catsAnt, ds, fs] = await Promise.all([
    sql().query(
      `SELECT
        (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE ${ESTE_MES('fecha')}) AS ingresos,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ${ESTE_MES('fecha')}) AS variables,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos
           WHERE (fecha AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date) AS hoy,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos
           WHERE (fecha AT TIME ZONE '${ZONA}')::date > (now() AT TIME ZONE '${ZONA}')::date - 7) AS ultimos7`,
    ),
    sql().query(
      `SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${ESTE_MES('fecha')} GROUP BY categoria ORDER BY total DESC`,
    ),
    sql().query(
      `SELECT categoria, SUM(monto) AS total FROM gastos
       WHERE date_trunc('month', fecha AT TIME ZONE '${ZONA}') = date_trunc('month', now() AT TIME ZONE '${ZONA}') - interval '1 month'
       GROUP BY categoria`,
    ),
    deudas(),
    fijos(),
  ]);
  return calcularResumen({
    ingresos: n(tot.ingresos),
    variables: n(tot.variables),
    gastadoHoy: n(tot.hoy),
    ultimos7: n(tot.ultimos7),
    porCategoria: cats.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    porCategoriaMesAnterior: catsAnt.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    deudas: ds,
    fijos: fs,
  });
}

/** La parte de cálculo del resumen, sin base de datos (se puede probar sola). */
export function calcularResumen(d: {
  ingresos: number; variables: number; gastadoHoy: number; ultimos7: number;
  porCategoria: Resumen['porCategoria']; porCategoriaMesAnterior: Resumen['porCategoria'];
  deudas: Deuda[]; fijos: Fijo[];
}): Resumen {
  const hoy = hoyEnColombia();
  const activas = d.deudas.filter((x) => x.saldo > 0 || x.abonadoMes > 0);
  const cuotas = activas.reduce((s, x) => s + x.cuota, 0);
  const extraAbonos = d.deudas.reduce((s, x) => s + Math.max(0, x.abonadoMes - x.cuota), 0);
  const fijosTot = d.fijos.reduce((s, f) => s + f.monto, 0);
  const disponible = d.ingresos - cuotas - fijosTot - d.variables - extraAbonos;

  const pendientes: Pendiente[] = [
    ...d.deudas
      .filter((x) => x.saldo > 0 && x.cuota > x.abonadoMes)
      .map((x) => ({ tipo: 'cuota' as const, id: x.id, nombre: x.nombre, monto: Math.min(x.saldo, x.cuota - x.abonadoMes) })),
    ...d.fijos.filter((f) => !f.pagadoMes && f.monto > 0).map((f) => ({ tipo: 'fijo' as const, id: f.id, nombre: f.concepto, monto: f.monto })),
  ];

  const pago = proximoPago(hoy);
  // El presupuesto de hoy se calcula con la plata que tenías al empezar el día,
  // para que gastar hoy no cambie el número de hoy (solo el de mañana).
  const presupuestoHoy = Math.max(0, Math.floor((disponible + d.gastadoHoy) / pago.dias));

  return {
    ingresos: d.ingresos,
    cuotas,
    fijos: fijosTot,
    variables: d.variables,
    extraAbonos,
    disponible,
    porCategoria: d.porCategoria,
    porCategoriaMesAnterior: d.porCategoriaMesAnterior,
    gastadoHoy: d.gastadoHoy,
    presupuestoHoy,
    proximoPago: pago,
    ritmo7: Math.round(d.ultimos7 / 7),
    pendientes,
    totalPendiente: pendientes.reduce((s, p) => s + p.monto, 0),
    diaHoy: hoy.dia,
    diasMes: hoy.diasMes,
  };
}
