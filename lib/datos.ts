import { sql } from './db';
import { esCategoria, type Categoria } from './categorias';

export type Gasto = { id: number; fecha: string; concepto: string; monto: number; categoria: string; origen: string };
export type Ingreso = { id: number; fecha: string; concepto: string; monto: number };
export type Deuda = { id: number; nombre: string; saldo: number; cuota: number; tasa: string | null; prioridad: number };
export type Fijo = { id: number; concepto: string; monto: number };

export type Resumen = {
  ingresos: number;
  cuotas: number;
  fijos: number;
  variables: number;
  disponible: number;
  diasRestantes: number;
  porDia: number;
  porCategoria: { categoria: string; total: number }[];
};

const n = (v: unknown) => Number(v) || 0;

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
  return rows[0] ? (rows[0] as Gasto) : null;
}

export async function gastosDelMes(): Promise<Gasto[]> {
  const rows = await sql()`
    SELECT id, fecha, concepto, monto, categoria, origen FROM gastos
    WHERE date_trunc('month', fecha AT TIME ZONE 'America/Bogota') = date_trunc('month', now() AT TIME ZONE 'America/Bogota')
    ORDER BY fecha DESC`;
  return rows.map((r) => ({ ...(r as Gasto), monto: n(r.monto) }));
}

export async function gastosDeHoy(): Promise<Gasto[]> {
  const rows = await sql()`
    SELECT id, fecha, concepto, monto, categoria, origen FROM gastos
    WHERE (fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
    ORDER BY fecha`;
  return rows.map((r) => ({ ...(r as Gasto), monto: n(r.monto) }));
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
  const rows = await sql()`
    SELECT id, fecha, concepto, monto FROM ingresos
    WHERE date_trunc('month', fecha AT TIME ZONE 'America/Bogota') = date_trunc('month', now() AT TIME ZONE 'America/Bogota')
    ORDER BY fecha DESC`;
  return rows.map((r) => ({ ...(r as Ingreso), monto: n(r.monto) }));
}

// ---------- Deudas ----------

export async function deudas(): Promise<Deuda[]> {
  const rows = await sql()`SELECT id, nombre, saldo, cuota, tasa, prioridad FROM deudas ORDER BY prioridad, id`;
  return rows.map((r) => ({ ...(r as Deuda), saldo: n(r.saldo), cuota: n(r.cuota), prioridad: n(r.prioridad) }));
}
export async function guardarDeuda(id: number | null, d: Omit<Deuda, 'id'>) {
  if (id) {
    await sql()`UPDATE deudas SET nombre = ${d.nombre}, saldo = ${d.saldo}, cuota = ${d.cuota}, tasa = ${d.tasa}, prioridad = ${d.prioridad} WHERE id = ${id}`;
  } else {
    await sql()`INSERT INTO deudas (nombre, saldo, cuota, tasa, prioridad) VALUES (${d.nombre}, ${d.saldo}, ${d.cuota}, ${d.tasa}, ${d.prioridad})`;
  }
}
export async function borrarDeuda(id: number) {
  await sql()`DELETE FROM deudas WHERE id = ${id}`;
}
/** Resta un abono al saldo de la deuda cuyo nombre se parece al texto. */
export async function abonarDeuda(nombre: string, monto: number): Promise<Deuda | null> {
  const rows = await sql()`
    UPDATE deudas SET saldo = GREATEST(saldo - ${monto}, 0)
    WHERE id = (SELECT id FROM deudas WHERE nombre ILIKE ${'%' + nombre + '%'} ORDER BY prioridad LIMIT 1)
    RETURNING id, nombre, saldo, cuota, tasa, prioridad`;
  return rows[0] ? ({ ...(rows[0] as Deuda), saldo: n(rows[0].saldo) }) : null;
}

// ---------- Fijos ----------

export async function fijos(): Promise<Fijo[]> {
  const rows = await sql()`SELECT id, concepto, monto FROM fijos ORDER BY monto DESC, id`;
  return rows.map((r) => ({ ...(r as Fijo), monto: n(r.monto) }));
}
export async function guardarFijo(id: number | null, f: Omit<Fijo, 'id'>) {
  if (id) await sql()`UPDATE fijos SET concepto = ${f.concepto}, monto = ${f.monto} WHERE id = ${id}`;
  else await sql()`INSERT INTO fijos (concepto, monto) VALUES (${f.concepto}, ${f.monto})`;
}
export async function borrarFijo(id: number) {
  await sql()`DELETE FROM fijos WHERE id = ${id}`;
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

// ---------- Resumen ----------

export function diasRestantesDelMes(): number {
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return ultimo - hoy.getDate() + 1; // incluye hoy
}

export async function resumen(): Promise<Resumen> {
  const [tot] = await sql()`
    SELECT
      (SELECT COALESCE(SUM(monto), 0) FROM ingresos
         WHERE date_trunc('month', fecha AT TIME ZONE 'America/Bogota') = date_trunc('month', now() AT TIME ZONE 'America/Bogota')) AS ingresos,
      (SELECT COALESCE(SUM(cuota), 0) FROM deudas WHERE saldo > 0) AS cuotas,
      (SELECT COALESCE(SUM(monto), 0) FROM fijos) AS fijos,
      (SELECT COALESCE(SUM(monto), 0) FROM gastos
         WHERE date_trunc('month', fecha AT TIME ZONE 'America/Bogota') = date_trunc('month', now() AT TIME ZONE 'America/Bogota')) AS variables`;
  const cats = await sql()`
    SELECT categoria, SUM(monto) AS total FROM gastos
    WHERE date_trunc('month', fecha AT TIME ZONE 'America/Bogota') = date_trunc('month', now() AT TIME ZONE 'America/Bogota')
    GROUP BY categoria ORDER BY total DESC`;

  const ingresos = n(tot.ingresos);
  const cuotas = n(tot.cuotas);
  const fijosTot = n(tot.fijos);
  const variables = n(tot.variables);
  const disponible = ingresos - cuotas - fijosTot - variables;
  const dias = diasRestantesDelMes();
  return {
    ingresos,
    cuotas,
    fijos: fijosTot,
    variables,
    disponible,
    diasRestantes: dias,
    porDia: disponible > 0 ? Math.floor(disponible / dias) : 0,
    porCategoria: cats.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
  };
}
