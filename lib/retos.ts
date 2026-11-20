import { sql } from './db';
import { ZONA } from './config';
import { CATALOGO, evaluarReto, type EstadoReto, type Reto, type RetoGuardado, type TipoReto } from './retosComun';

export { CATALOGO, evaluarReto, rachaLimite, type Reto } from './retosComun';

const n = (v: unknown) => Number(v) || 0;

/** Los retos (activos y de los últimos 30 días), evaluados. Guarda en la base los que terminaron. */
export async function retos(): Promise<Reto[]> {
  const filas = await sql()`
    SELECT id, tipo, nombre, to_char(inicio, 'YYYY-MM-DD') AS inicio, dias, regla, monto, estado, avisado FROM retos
    WHERE estado = 'activo' OR inicio > (now() AT TIME ZONE 'America/Bogota')::date - 30
    ORDER BY (estado = 'activo') DESC, inicio DESC, id DESC`;
  if (!filas.length) return [];
  const desde = filas.reduce((m, f) => (String(f.inicio) < m ? String(f.inicio) : m), String(filas[0].inicio));
  const gs = await sql().query(
    `SELECT to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') AS fecha, concepto, categoria, monto FROM gastos
     WHERE (fecha AT TIME ZONE '${ZONA}')::date >= $1::date ORDER BY fecha`,
    [desde],
  );
  const gastos = gs.map((g) => ({ fecha: String(g.fecha), concepto: String(g.concepto), categoria: String(g.categoria), monto: n(g.monto) }));
  const out: Reto[] = [];
  for (const f of filas) {
    const guardado: RetoGuardado = {
      id: n(f.id), tipo: f.tipo as TipoReto, nombre: String(f.nombre), inicio: String(f.inicio), dias: n(f.dias),
      regla: (f.regla as string | null) ?? null, monto: f.monto == null ? null : n(f.monto), estado: f.estado as EstadoReto, avisado: f.avisado === true,
    };
    const r = evaluarReto(guardado, gastos);
    if (guardado.estado === 'activo' && r.estado !== 'activo') await sql()`UPDATE retos SET estado = ${r.estado} WHERE id = ${r.id}`;
    out.push(guardado.estado !== 'activo' ? { ...r, estado: guardado.estado } : r);
  }
  return out;
}

export async function crearReto(clave: string, limiteDiario: number) {
  const c = CATALOGO.find((x) => x.clave === clave);
  if (!c) return null;
  const monto = c.tipo === 'limite' ? Math.max(1000, Math.round(limiteDiario / 1000) * 1000) : c.monto ?? null;
  const [fila] = await sql()`
    INSERT INTO retos (tipo, nombre, inicio, dias, regla, monto)
    VALUES (${c.tipo}, ${c.nombre}, (now() AT TIME ZONE 'America/Bogota')::date, ${c.dias}, ${c.regla ?? null}, ${monto})
    RETURNING id`;
  return n(fila.id);
}

/** Quita un reto (si lo abandonas). */
export async function quitarReto(id: number) {
  await sql()`UPDATE retos SET estado = 'roto', avisado = true WHERE id = ${id} AND estado = 'activo'`;
}

/** Retos que terminaron (rotos o logrados) y aún no se avisaron por Telegram; los marca como avisados. */
export async function retosParaAvisar(): Promise<Reto[]> {
  const todos = await retos();
  const pendientes = todos.filter((r) => r.estado !== 'activo' && !r.avisado);
  for (const r of pendientes) await sql()`UPDATE retos SET avisado = true WHERE id = ${r.id}`;
  return pendientes;
}

