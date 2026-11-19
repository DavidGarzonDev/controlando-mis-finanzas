import { sql } from './db';
import { esCategoria, type Categoria } from './categorias';
import { ZONA } from './config';
import { hoyEnColombia, mesClave, proximoPago, type Hoy, type ProximoPago } from './fechas';

export type Gasto = {
  id: number; fecha: string; concepto: string; monto: number; categoria: string; origen: string; cuentaId: number | null;
};
export type Ingreso = { id: number; fecha: string; concepto: string; monto: number; cuentaId: number | null };
export type TipoCredito = 'tarjeta' | 'prestamo' | 'otro';
export type Deuda = {
  id: number; nombre: string; tipo: TipoCredito; saldo: number; cuota: number; tasa: string | null; prioridad: number;
  /** Solo tarjetas: el cupo total, el banco, la franquicia y los últimos 4 dígitos. */
  cupo: number | null;
  banco: string | null;
  franquicia: string | null;
  ultimos4: string | null;
  /** Acabado elegido ('negro', 'oro'…), un color '#rrggbb' o null para los colores del banco. */
  color: string | null;
  /** Día del mes en que vence la cuota y (tarjetas) día de corte del extracto. */
  diaPago: number | null;
  diaCorte: number | null;
  montoOriginal: number;
  /**
   * `cuota` = lo que toca pagar este mes: la cuota fija (`cuotaBase`) más las compras con tarjeta
   * que están corriendo (una compra a N cuotas suma monto/N desde el mes siguiente, durante N meses).
   */
  cuotaBase: number;
  cuotaCompras: number;
  /** Lo pagado de la cuota este mes, y lo abonado a capital aparte. */
  abonadoMes: number;
  capitalMes: number;
  /** true si marcaste la cuota de este mes como pagada (la pagaste por fuera de la app). */
  marcadaMes: boolean;
  /** Lo que falta de la cuota de este mes (0 si ya se pagó o se marcó como pagada). */
  faltaMes: number;
};
export type Cuenta = {
  id: number; nombre: string; banco: string | null; saldo: number; ultimos4: string | null;
  franquicia: string | null; color: string | null; actualizado: string;
  /** Los gastos e ingresos sin cuenta se registran en esta. */
  principal: boolean;
};
export type Fijo = { id: number; concepto: string; monto: number; diaPago: number | null; pagadoMes: boolean };
export type Pendiente = { tipo: 'cuota' | 'fijo'; id: number; nombre: string; monto: number; diaPago: number | null };
export type MesHistorial = { mes: string; ingresos: number; gastos: number };
export type Meta = {
  id: number; nombre: string; objetivo: number; ahorrado: number; aportadoMes: number;
  fechaMeta: string | null; color: string | null;
};
export type Transferencia = { id: number; fecha: string; desdeId: number | null; haciaId: number | null; monto: number; nota: string | null };
export type Hormiga = { concepto: string; veces: number; total: number };
export type Suscripcion = { concepto: string; monto: number; meses: number };
export type PuntoPatrimonio = { fecha: string; activos: number; deudas: number };

export type Resumen = {
  /** "2026-11": el mes que se está mirando. */
  mes: string;
  /** true si es el mes en curso (solo ahí hay "hoy", límite diario y proyección). */
  esActual: boolean;
  /**
   * 'cuentas': tienes cuentas registradas, así que "libre" = lo que tienes en cuentas y efectivo
   *   menos lo que falta pagar este mes y lo apartado para metas (tu plata real).
   * 'mes': sin cuentas, "libre" = ingresos del mes menos cuotas, fijos y gastos.
   */
  modo: 'cuentas' | 'mes';
  /** Suma de los saldos de tus cuentas y efectivo. */
  enCuentas: number;
  /** Total apartado en metas de ahorro (no se cuenta como plata libre). */
  apartadoMetas: number;
  /** Ingresos del mes menos todo lo que salió este mes (el "balance" del mes). */
  balanceMes: number;
  ingresos: number;
  cuotas: number;
  fijos: number;
  variables: number;
  /** Abonos a deudas por encima de la cuota del mes: también salen de tu bolsillo. */
  extraAbonos: number;
  /** Lo que apartaste a metas de ahorro este mes (neto de retiros). */
  ahorro: number;
  disponible: number;
  porCategoria: { categoria: string; total: number }[];
  porCategoriaMesAnterior: { categoria: string; total: number }[];
  /** Tope por categoría (presupuesto). */
  topes: Record<string, number>;
  gastadoHoy: number;
  /** Lo que puedes gastar hoy para que la plata alcance hasta el próximo pago. */
  presupuestoHoy: number;
  proximoPago: ProximoPago;
  /** Promedio diario de gasto de los últimos 7 días. */
  ritmo7: number;
  /** Cómo terminarías el mes a este ritmo, y cuánto te suele entrar que aún no ha llegado. */
  proyeccion: { finDeMes: number; ingresoEsperado: number } | null;
  pendientes: Pendiente[];
  totalPendiente: number;
  diaHoy: number;
  diasMes: number;
};

const n = (v: unknown) => Number(v) || 0;
const nulo = (v: unknown) => (v == null ? null : n(v));

/** Acepta solo "AAAA-MM" (se interpola en SQL). */
export function mesValido(m: string | null | undefined): string {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : mesClave();
}
function mesAnterior(m: string) {
  const [a, b] = m.split('-').map(Number);
  return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, '0')}`;
}
/** Filtro SQL: la fecha cae en el mes `m` (hora de Colombia). `m` ya validado. */
const EN_MES = (col: string, m: string) => `to_char(${col} AT TIME ZONE '${ZONA}', 'YYYY-MM') = '${mesValido(m)}'`;

/** El "hoy" con que se calcula un mes: el día real si es el actual; si no, su último día. */
function hoyDelMes(m: string): Hoy & { esActual: boolean } {
  const h = hoyEnColombia();
  if (m === mesClave(h)) return { ...h, esActual: true };
  const [anio, mes] = m.split('-').map(Number);
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { anio, mes, dia: diasMes, diasMes, esActual: false };
}

async function moverCuenta(cuentaId: number | null | undefined, delta: number) {
  if (!cuentaId || !delta) return;
  await sql()`UPDATE cuentas SET saldo = saldo + ${delta}, actualizado = now() WHERE id = ${cuentaId}`;
}

// ---------- Gastos ----------

export async function insertarGasto(g: {
  concepto: string; monto: number; categoria: string; origen: 'telegram' | 'web'; texto?: string; cuentaId?: number | null;
}) {
  const rows = await sql()`
    INSERT INTO gastos (concepto, monto, categoria, origen, texto_original, cuenta_id)
    VALUES (${g.concepto}, ${g.monto}, ${g.categoria}, ${g.origen}, ${g.texto ?? null}, ${g.cuentaId ?? null})
    RETURNING id`;
  await moverCuenta(g.cuentaId, -g.monto);
  return n(rows[0].id);
}

export async function actualizarGasto(id: number, g: { concepto: string; monto: number; categoria: string; cuentaId?: number | null }) {
  const [antes] = await sql()`SELECT monto, cuenta_id FROM gastos WHERE id = ${id}`;
  if (!antes) return;
  const cuentaId = g.cuentaId === undefined ? nulo(antes.cuenta_id) : g.cuentaId;
  await sql()`UPDATE gastos SET concepto = ${g.concepto}, monto = ${g.monto}, categoria = ${g.categoria}, cuenta_id = ${cuentaId} WHERE id = ${id}`;
  await moverCuenta(nulo(antes.cuenta_id), n(antes.monto));
  await moverCuenta(cuentaId, -g.monto);
}

export async function borrarGasto(id: number) {
  const [antes] = await sql()`DELETE FROM gastos WHERE id = ${id} RETURNING monto, cuenta_id`;
  if (antes) await moverCuenta(nulo(antes.cuenta_id), n(antes.monto));
}

const filaGasto = (r: Record<string, unknown>): Gasto => ({
  id: n(r.id), fecha: String(r.fecha), concepto: String(r.concepto), monto: n(r.monto),
  categoria: String(r.categoria), origen: String(r.origen), cuentaId: nulo(r.cuenta_id),
});

export async function ultimoGasto(): Promise<Gasto | null> {
  const rows = await sql()`SELECT id, fecha, concepto, monto, categoria, origen, cuenta_id FROM gastos ORDER BY id DESC LIMIT 1`;
  return rows[0] ? filaGasto(rows[0]) : null;
}

export async function gastosDelMes(mes = mesClave()): Promise<Gasto[]> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto, categoria, origen, cuenta_id FROM gastos WHERE ${EN_MES('fecha', mes)} ORDER BY fecha DESC, id DESC`,
  );
  return rows.map(filaGasto);
}

export async function gastosDeHoy(): Promise<Gasto[]> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto, categoria, origen, cuenta_id FROM gastos
     WHERE (fecha AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date ORDER BY fecha`,
  );
  return rows.map(filaGasto);
}

export async function gastosDeAyer(): Promise<{ total: number; veces: number }> {
  const [r] = await sql().query(
    `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS veces FROM gastos
     WHERE (fecha AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date - 1`,
  );
  return { total: n(r.total), veces: n(r.veces) };
}

/** Total gastado por cada día del mes (índice 0 = día 1). */
export async function gastosPorDia(mes = mesClave()): Promise<number[]> {
  const rows = await sql().query(
    `SELECT EXTRACT(DAY FROM fecha AT TIME ZONE '${ZONA}')::int AS dia, SUM(monto) AS total
     FROM gastos WHERE ${EN_MES('fecha', mes)} GROUP BY 1`,
  );
  const { diasMes } = hoyDelMes(mes);
  const out = Array.from({ length: diasMes }, () => 0);
  for (const r of rows) out[n(r.dia) - 1] = n(r.total);
  return out;
}

// ---------- Ingresos ----------

export async function insertarIngreso(i: { concepto: string; monto: number; cuentaId?: number | null }) {
  const rows = await sql()`INSERT INTO ingresos (concepto, monto, cuenta_id) VALUES (${i.concepto}, ${i.monto}, ${i.cuentaId ?? null}) RETURNING id`;
  await moverCuenta(i.cuentaId, i.monto);
  return n(rows[0].id);
}
export async function actualizarIngreso(id: number, i: { concepto: string; monto: number; cuentaId?: number | null }) {
  const [antes] = await sql()`SELECT monto, cuenta_id FROM ingresos WHERE id = ${id}`;
  if (!antes) return;
  const cuentaId = i.cuentaId === undefined ? nulo(antes.cuenta_id) : i.cuentaId;
  await sql()`UPDATE ingresos SET concepto = ${i.concepto}, monto = ${i.monto}, cuenta_id = ${cuentaId} WHERE id = ${id}`;
  await moverCuenta(nulo(antes.cuenta_id), -n(antes.monto));
  await moverCuenta(cuentaId, i.monto);
}
export async function borrarIngreso(id: number) {
  const [antes] = await sql()`DELETE FROM ingresos WHERE id = ${id} RETURNING monto, cuenta_id`;
  if (antes) await moverCuenta(nulo(antes.cuenta_id), -n(antes.monto));
}
export async function ingresosDelMes(mes = mesClave()): Promise<Ingreso[]> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto, cuenta_id FROM ingresos WHERE ${EN_MES('fecha', mes)} ORDER BY fecha DESC, id DESC`,
  );
  return rows.map((r) => ({ id: n(r.id), fecha: String(r.fecha), concepto: String(r.concepto), monto: n(r.monto), cuentaId: nulo(r.cuenta_id) }));
}

/**
 * Le pone cuenta a un gasto o ingreso que se registró sin ella (botón del bot). Ajusta el saldo.
 * Si ya tenía cuenta, no hace nada (evita descontar dos veces si tocan el botón otra vez).
 */
export async function asignarCuenta(tipo: 'gasto' | 'ingreso', id: number, cuentaId: number) {
  const tabla = tipo === 'gasto' ? 'gastos' : 'ingresos';
  const [fila] = await sql().query(
    `UPDATE ${tabla} SET cuenta_id = $1 WHERE id = $2 AND cuenta_id IS NULL RETURNING concepto, monto`,
    [cuentaId, id],
  );
  if (!fila) return null;
  await moverCuenta(cuentaId, tipo === 'gasto' ? -n(fila.monto) : n(fila.monto));
  const [c] = await sql()`SELECT nombre, saldo FROM cuentas WHERE id = ${cuentaId}`;
  return { concepto: String(fila.concepto), monto: n(fila.monto), cuenta: String(c?.nombre ?? ''), saldo: n(c?.saldo) };
}

// ---------- Transferencias entre cuentas ----------

export async function transferir(t: { desdeId: number | null; haciaId: number | null; monto: number; nota?: string | null }) {
  if (!t.monto || (!t.desdeId && !t.haciaId) || t.desdeId === t.haciaId) return;
  await sql()`INSERT INTO transferencias (desde_id, hacia_id, monto, nota) VALUES (${t.desdeId}, ${t.haciaId}, ${t.monto}, ${t.nota ?? null})`;
  await moverCuenta(t.desdeId, -t.monto);
  await moverCuenta(t.haciaId, t.monto);
}
export async function borrarTransferencia(id: number) {
  const [t] = await sql()`DELETE FROM transferencias WHERE id = ${id} RETURNING desde_id, hacia_id, monto`;
  if (!t) return;
  await moverCuenta(nulo(t.desde_id), n(t.monto));
  await moverCuenta(nulo(t.hacia_id), -n(t.monto));
}
export async function transferenciasDelMes(mes = mesClave()): Promise<Transferencia[]> {
  const rows = await sql().query(
    `SELECT id, fecha, desde_id, hacia_id, monto, nota FROM transferencias WHERE ${EN_MES('fecha', mes)} ORDER BY fecha DESC`,
  );
  return rows.map((r) => ({
    id: n(r.id), fecha: String(r.fecha), desdeId: nulo(r.desde_id), haciaId: nulo(r.hacia_id), monto: n(r.monto), nota: (r.nota as string | null) || null,
  }));
}

// ---------- Deudas y tarjetas ----------

export async function deudas(mes = mesClave()): Promise<Deuda[]> {
  const rows = await sql().query(
    `SELECT d.id, d.nombre, d.tipo, d.cupo, d.banco, d.franquicia, d.ultimos4, d.color, d.dia_pago, d.dia_corte,
            d.saldo, d.cuota, d.tasa, d.prioridad,
            COALESCE(d.monto_original, d.saldo) AS monto_original,
            COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.deuda_id = d.id AND a.tipo <> 'capital' AND ${EN_MES('a.fecha', mes)}), 0) AS abonado_mes,
            COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.deuda_id = d.id AND a.tipo = 'capital' AND ${EN_MES('a.fecha', mes)}), 0) AS capital_mes,
            EXISTS (SELECT 1 FROM cuotas_marcadas c WHERE c.deuda_id = d.id AND c.mes = '${mesValido(mes)}') AS marcada,
            COALESCE((
              SELECT SUM(ROUND(c.monto::numeric / GREATEST(c.cuotas, 1))) FROM compras_credito c
              WHERE c.deuda_id = d.id
                AND (EXTRACT(YEAR FROM to_date('${mesValido(mes)}', 'YYYY-MM')) * 12 + EXTRACT(MONTH FROM to_date('${mesValido(mes)}', 'YYYY-MM')))
                  - (EXTRACT(YEAR FROM c.fecha AT TIME ZONE '${ZONA}') * 12 + EXTRACT(MONTH FROM c.fecha AT TIME ZONE '${ZONA}'))
                  BETWEEN 1 AND c.cuotas), 0) AS cuota_compras
     FROM deudas d ORDER BY d.prioridad, d.id`,
  );
  return rows.map((r) => {
    const cuota = Math.min(n(r.saldo), n(r.cuota) + n(r.cuota_compras)) || n(r.cuota);
    return {
    id: n(r.id), nombre: String(r.nombre), saldo: n(r.saldo), cuota,
    cuotaBase: n(r.cuota), cuotaCompras: n(r.cuota_compras),
    tipo: (['tarjeta', 'prestamo', 'otro'].includes(String(r.tipo)) ? r.tipo : 'prestamo') as TipoCredito,
    cupo: nulo(r.cupo),
    banco: (r.banco as string | null) || null,
    franquicia: (r.franquicia as string | null) || null,
    ultimos4: (r.ultimos4 as string | null) || null,
    color: (r.color as string | null) || null,
    diaPago: nulo(r.dia_pago),
    diaCorte: nulo(r.dia_corte),
    tasa: (r.tasa as string | null) || null, prioridad: n(r.prioridad),
    montoOriginal: Math.max(n(r.monto_original), n(r.saldo)), abonadoMes: n(r.abonado_mes), capitalMes: n(r.capital_mes),
    marcadaMes: r.marcada === true,
    faltaMes: r.marcada === true ? 0 : Math.max(0, Math.min(n(r.saldo), cuota - n(r.abonado_mes))),
  };
  });
}

export async function guardarDeuda(
  id: number | null,
  d: {
    nombre: string; tipo: TipoCredito; saldo: number; cuota: number; tasa: string | null; prioridad: number;
    cupo: number | null; banco: string | null; franquicia: string | null; ultimos4: string | null; color: string | null;
    diaPago: number | null; diaCorte: number | null;
  },
) {
  if (id) {
    await sql()`
      UPDATE deudas SET nombre = ${d.nombre}, tipo = ${d.tipo}, cupo = ${d.cupo}, banco = ${d.banco},
        franquicia = ${d.franquicia}, ultimos4 = ${d.ultimos4}, color = ${d.color}, saldo = ${d.saldo}, cuota = ${d.cuota},
        tasa = ${d.tasa}, prioridad = ${d.prioridad}, dia_pago = ${d.diaPago}, dia_corte = ${d.diaCorte},
        monto_original = GREATEST(COALESCE(monto_original, 0), ${d.saldo})
      WHERE id = ${id}`;
  } else {
    await sql()`
      INSERT INTO deudas (nombre, tipo, cupo, banco, franquicia, ultimos4, color, saldo, cuota, tasa, prioridad, dia_pago, dia_corte, monto_original)
      VALUES (${d.nombre}, ${d.tipo}, ${d.cupo}, ${d.banco}, ${d.franquicia}, ${d.ultimos4}, ${d.color}, ${d.saldo}, ${d.cuota},
        ${d.tasa}, ${d.prioridad}, ${d.diaPago}, ${d.diaCorte}, ${d.saldo})`;
  }
}

/**
 * Compra con tarjeta (o cualquier cargo nuevo a un crédito): sube el saldo.
 * Si se difiere a N cuotas, la cuota mensual sube en monto / N.
 * No cuenta como gasto del mes: la plata sale de tu bolsillo cuando pagas la cuota.
 */
export async function registrarCompraCredito(id: number, c: { concepto: string; monto: number; cuotas: number }) {
  const cuotas = Math.max(1, Math.min(72, Math.round(c.cuotas || 1)));
  // La cuota fija no cambia: la compra se suma sola a la cuota de los próximos meses (ver deudas()).
  const rows = await sql()`
    UPDATE deudas SET saldo = saldo + ${c.monto}, monto_original = COALESCE(monto_original, 0) + ${c.monto}
    WHERE id = ${id} RETURNING nombre, saldo, cuota, cupo`;
  if (!rows[0]) return null;
  await sql()`INSERT INTO compras_credito (deuda_id, concepto, monto, cuotas) VALUES (${id}, ${c.concepto}, ${c.monto}, ${cuotas})`;
  return { nombre: String(rows[0].nombre), saldo: n(rows[0].saldo), cuota: n(rows[0].cuota), cupo: nulo(rows[0].cupo) };
}

export type MovCredito = { id: string; fecha: string; tipo: 'compra' | 'abono'; concepto: string; monto: number; cuotas: number };

/** Últimas compras y abonos de cada crédito. */
export async function movimientosCredito(): Promise<Record<number, MovCredito[]>> {
  const rows = await sql()`
    SELECT * FROM (
      SELECT 'c' || id AS id, deuda_id, fecha, 'compra' AS tipo, concepto, monto, cuotas FROM compras_credito
      UNION ALL
      SELECT 'a' || id, deuda_id, fecha, 'abono', CASE WHEN tipo = 'capital' THEN 'Abono a capital' ELSE 'Pago de cuota' END, monto, 1 FROM abonos
    ) m ORDER BY fecha DESC LIMIT 200`;
  const out: Record<number, MovCredito[]> = {};
  for (const r of rows) {
    const k = n(r.deuda_id);
    const lista = (out[k] ??= []);
    if (lista.length < 6) {
      lista.push({ id: String(r.id), fecha: String(r.fecha), tipo: r.tipo as 'compra' | 'abono', concepto: String(r.concepto), monto: n(r.monto), cuotas: n(r.cuotas) });
    }
  }
  return out;
}

export async function borrarDeuda(id: number) {
  await sql()`DELETE FROM deudas WHERE id = ${id}`;
}

/**
 * Pago a un crédito. `tipo` 'cuota' cuenta para la cuota del mes; 'capital' es un abono extra a capital.
 * Si dices de qué cuenta salió, se descuenta de esa cuenta.
 */
export async function abonarDeudaPorId(id: number, monto: number, cuentaId?: number | null, tipo: 'cuota' | 'capital' = 'cuota') {
  const rows = await sql()`
    UPDATE deudas SET saldo = GREATEST(saldo - ${monto}, 0) WHERE id = ${id}
    RETURNING id, nombre, saldo, cuota`;
  if (!rows[0]) return null;
  await sql()`INSERT INTO abonos (deuda_id, monto, cuenta_id, tipo) VALUES (${id}, ${monto}, ${cuentaId ?? null}, ${tipo})`;
  await moverCuenta(cuentaId, -monto);
  return { id: n(rows[0].id), nombre: String(rows[0].nombre), saldo: n(rows[0].saldo), cuota: n(rows[0].cuota) };
}

// ---------- Cuentas (débito y billeteras) ----------

export async function cuentas(): Promise<Cuenta[]> {
  const rows = await sql()`SELECT id, nombre, banco, saldo, ultimos4, franquicia, color, actualizado, principal FROM cuentas ORDER BY principal DESC, saldo DESC, id`;
  return rows.map((r) => ({
    id: n(r.id), nombre: String(r.nombre), banco: (r.banco as string | null) || null, saldo: n(r.saldo),
    ultimos4: (r.ultimos4 as string | null) || null, actualizado: String(r.actualizado),
    franquicia: (r.franquicia as string | null) || null, color: (r.color as string | null) || null,
    principal: r.principal === true,
  }));
}
export async function guardarCuenta(
  id: number | null,
  c: { nombre: string; banco: string | null; saldo: number; ultimos4: string | null; franquicia: string | null; color: string | null; principal?: boolean },
) {
  // Solo una cuenta puede ser la principal.
  if (c.principal) await sql()`UPDATE cuentas SET principal = false WHERE principal AND id IS DISTINCT FROM ${id}`;
  if (id) {
    if (c.principal !== undefined) await sql()`UPDATE cuentas SET principal = ${c.principal} WHERE id = ${id}`;
    await sql()`
      UPDATE cuentas SET nombre = ${c.nombre}, banco = ${c.banco}, saldo = ${c.saldo}, ultimos4 = ${c.ultimos4},
        franquicia = ${c.franquicia}, color = ${c.color}, actualizado = now()
      WHERE id = ${id}`;
  } else {
    await sql()`
      INSERT INTO cuentas (nombre, banco, saldo, ultimos4, franquicia, color, principal)
      VALUES (${c.nombre}, ${c.banco}, ${c.saldo}, ${c.ultimos4}, ${c.franquicia}, ${c.color}, ${c.principal ?? false})`;
  }
}
/** La cuenta de efectivo; si no existe, la crea en $0. */
export async function cuentaEfectivo(): Promise<Cuenta> {
  const existente = (await cuentas()).find((c) => c.banco === 'efectivo');
  if (existente) return existente;
  await sql()`INSERT INTO cuentas (nombre, banco, saldo) VALUES ('Efectivo', 'efectivo', 0)`;
  return (await cuentas()).find((c) => c.banco === 'efectivo')!;
}

export async function actualizarSaldoCuenta(id: number, saldo: number) {
  await sql()`UPDATE cuentas SET saldo = ${saldo}, actualizado = now() WHERE id = ${id}`;
}
export async function borrarCuenta(id: number) {
  await sql()`DELETE FROM cuentas WHERE id = ${id}`;
}

// ---------- Patrimonio (lo que tienes menos lo que debes) ----------

/** Guarda la foto de hoy. Se llama al abrir el dashboard y en el recordatorio diario. */
export async function registrarPatrimonio() {
  await sql().query(
    `INSERT INTO patrimonio_diario (fecha, activos, deudas)
     SELECT (now() AT TIME ZONE '${ZONA}')::date,
            (SELECT COALESCE(SUM(saldo), 0) FROM cuentas) + (SELECT COALESCE(SUM(monto), 0) FROM aportes_meta),
            (SELECT COALESCE(SUM(saldo), 0) FROM deudas)
     ON CONFLICT (fecha) DO UPDATE SET activos = EXCLUDED.activos, deudas = EXCLUDED.deudas`,
  );
}
export async function historialPatrimonio(dias = 120): Promise<PuntoPatrimonio[]> {
  const rows = await sql().query(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, activos, deudas FROM patrimonio_diario
     WHERE fecha > (now() AT TIME ZONE '${ZONA}')::date - $1::int ORDER BY fecha`,
    [dias],
  );
  return rows.map((r) => ({ fecha: String(r.fecha), activos: n(r.activos), deudas: n(r.deudas) }));
}

// ---------- Fijos ----------

export async function fijos(mes = mesClave()): Promise<Fijo[]> {
  const m = mesValido(mes);
  const rows = await sql()`
    SELECT f.id, f.concepto, f.monto, f.dia_pago,
           EXISTS (SELECT 1 FROM pagos_fijos p WHERE p.fijo_id = f.id AND p.mes = ${m}) AS pagado
    FROM fijos f ORDER BY f.dia_pago NULLS LAST, f.monto DESC, f.id`;
  return rows.map((r) => ({ id: n(r.id), concepto: String(r.concepto), monto: n(r.monto), diaPago: nulo(r.dia_pago), pagadoMes: r.pagado === true }));
}
export async function guardarFijo(id: number | null, f: { concepto: string; monto: number; diaPago: number | null }) {
  if (id) await sql()`UPDATE fijos SET concepto = ${f.concepto}, monto = ${f.monto}, dia_pago = ${f.diaPago} WHERE id = ${id}`;
  else await sql()`INSERT INTO fijos (concepto, monto, dia_pago) VALUES (${f.concepto}, ${f.monto}, ${f.diaPago})`;
}
export async function borrarFijo(id: number) {
  await sql()`DELETE FROM fijos WHERE id = ${id}`;
}
/** Marca (o desmarca) la cuota del mes como pagada, sin tocar el saldo de la deuda ni de tus cuentas. */
export async function marcarCuota(id: number, pagada: boolean, mes = mesClave()) {
  const m = mesValido(mes);
  if (pagada) await sql()`INSERT INTO cuotas_marcadas (deuda_id, mes) VALUES (${id}, ${m}) ON CONFLICT DO NOTHING`;
  else await sql()`DELETE FROM cuotas_marcadas WHERE deuda_id = ${id} AND mes = ${m}`;
}

export async function marcarFijo(id: number, pagado: boolean, mes = mesClave()) {
  const m = mesValido(mes);
  if (pagado) await sql()`INSERT INTO pagos_fijos (fijo_id, mes) VALUES (${id}, ${m}) ON CONFLICT DO NOTHING`;
  else await sql()`DELETE FROM pagos_fijos WHERE fijo_id = ${id} AND mes = ${m}`;
}

// ---------- Presupuestos (tope por categoría) ----------

export async function topes(): Promise<Record<string, number>> {
  const rows = await sql()`SELECT categoria, monto FROM presupuestos WHERE monto > 0`;
  return Object.fromEntries(rows.map((r) => [String(r.categoria), n(r.monto)]));
}
export async function guardarTope(categoria: string, monto: number) {
  if (monto > 0) {
    await sql()`INSERT INTO presupuestos (categoria, monto) VALUES (${categoria}, ${monto})
      ON CONFLICT (categoria) DO UPDATE SET monto = EXCLUDED.monto`;
  } else {
    await sql()`DELETE FROM presupuestos WHERE categoria = ${categoria}`;
  }
}

// ---------- Metas de ahorro ----------

export async function metas(mes = mesClave()): Promise<Meta[]> {
  const rows = await sql().query(
    `SELECT m.id, m.nombre, m.objetivo, to_char(m.fecha_meta, 'YYYY-MM-DD') AS fecha_meta, m.color,
            COALESCE((SELECT SUM(a.monto) FROM aportes_meta a WHERE a.meta_id = m.id), 0) AS ahorrado,
            COALESCE((SELECT SUM(a.monto) FROM aportes_meta a WHERE a.meta_id = m.id AND ${EN_MES('a.fecha', mes)}), 0) AS aportado_mes
     FROM metas m ORDER BY m.fecha_meta NULLS LAST, m.id`,
  );
  return rows.map((r) => ({
    id: n(r.id), nombre: String(r.nombre), objetivo: n(r.objetivo), ahorrado: n(r.ahorrado), aportadoMes: n(r.aportado_mes),
    fechaMeta: (r.fecha_meta as string | null) || null, color: (r.color as string | null) || null,
  }));
}
export async function guardarMeta(id: number | null, m: { nombre: string; objetivo: number; fechaMeta: string | null; color: string | null }) {
  if (id) {
    await sql()`UPDATE metas SET nombre = ${m.nombre}, objetivo = ${m.objetivo}, fecha_meta = ${m.fechaMeta}, color = ${m.color} WHERE id = ${id}`;
  } else {
    await sql()`INSERT INTO metas (nombre, objetivo, fecha_meta, color) VALUES (${m.nombre}, ${m.objetivo}, ${m.fechaMeta}, ${m.color})`;
  }
}
export async function borrarMeta(id: number) {
  await sql()`DELETE FROM metas WHERE id = ${id}`;
}
/** Aporte (positivo) o retiro (negativo) a una meta. */
export async function aportarMeta(id: number, monto: number) {
  if (!monto) return;
  await sql()`INSERT INTO aportes_meta (meta_id, monto) VALUES (${id}, ${monto})`;
}

// ---------- Gastos hormiga y suscripciones ----------

/** Gastos pequeños que se repiten en el mes (tinto, mecato, domicilios…). */
export async function gastosHormiga(mes = mesClave()): Promise<Hormiga[]> {
  const rows = await sql().query(
    `SELECT initcap(lower(trim(concepto))) AS concepto, COUNT(*) AS veces, SUM(monto) AS total
     FROM gastos WHERE ${EN_MES('fecha', mes)} AND monto <= 25000 AND categoria <> 'Ajuste'
     GROUP BY lower(trim(concepto)) HAVING COUNT(*) >= 3 ORDER BY SUM(monto) DESC LIMIT 5`,
  );
  return rows.map((r) => ({ concepto: String(r.concepto), veces: n(r.veces), total: n(r.total) }));
}

const SUSCRIPCIONES = [
  'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video', 'amazon prime', 'youtube', 'icloud', 'google one',
  'chatgpt', 'platzi', 'smart fit', 'smartfit', 'bodytech', 'rappi prime', 'apple', 'deezer', 'crunchyroll', 'paramount', 'star+', 'canva',
];

/** Pagos que se repiten mes a mes por un valor parecido, o que suenan a suscripción (Netflix, Spotify…). */
export async function suscripciones(): Promise<Suscripcion[]> {
  const rows = await sql().query(
    `SELECT initcap(lower(trim(concepto))) AS concepto, ROUND(AVG(monto)) AS monto,
            COUNT(DISTINCT to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM')) AS meses,
            MAX(monto) - MIN(monto) AS rango
     FROM gastos WHERE fecha > now() - interval '100 days' AND categoria <> 'Ajuste'
     GROUP BY lower(trim(concepto))`,
  );
  return rows
    .map((r) => ({ concepto: String(r.concepto), monto: n(r.monto), meses: n(r.meses), rango: n(r.rango) }))
    .filter((r) => {
      const c = r.concepto.toLowerCase();
      const pareceSuscripcion = SUSCRIPCIONES.some((s) => c.includes(s));
      const serepite = r.meses >= 2 && r.rango <= r.monto * 0.15 && r.monto >= 5000;
      return pareceSuscripcion || serepite;
    })
    .map(({ concepto, monto, meses }) => ({ concepto, monto, meses }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);
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

/** Ingresos y gastos de los `meses` meses que terminan en `hasta`, del más viejo al más nuevo. */
export async function historial(meses = 6, hasta = mesClave()): Promise<MesHistorial[]> {
  const rows = await sql().query(
    `WITH m AS (
       SELECT to_char(to_date($2, 'YYYY-MM') - (i || ' month')::interval, 'YYYY-MM') AS mes
       FROM generate_series(0, $1 - 1) AS i)
     SELECT m.mes,
       COALESCE((SELECT SUM(monto) FROM ingresos WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') = m.mes), 0) AS ingresos,
       COALESCE((SELECT SUM(monto) FROM gastos WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') = m.mes), 0) AS gastos
     FROM m ORDER BY m.mes`,
    [meses, mesValido(hasta)],
  );
  return rows.map((r) => ({ mes: String(r.mes), ingresos: n(r.ingresos), gastos: n(r.gastos) }));
}

/** Los meses que tienen algún movimiento, para la navegación (más el actual). */
export async function mesesConDatos(): Promise<string[]> {
  const rows = await sql().query(
    `SELECT DISTINCT to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes FROM (
       SELECT fecha FROM gastos UNION ALL SELECT fecha FROM ingresos) f ORDER BY 1`,
  );
  const lista = rows.map((r) => String(r.mes));
  const actual = mesClave();
  return lista.includes(actual) ? lista : [...lista, actual];
}

// ---------- Resumen ----------

export async function resumen(mesPedido?: string): Promise<Resumen> {
  const mes = mesValido(mesPedido);
  const ant = mesAnterior(mes);
  const [[tot], cats, catsAnt, ds, fs, tps] = await Promise.all([
    sql().query(
      `SELECT
        (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE ${EN_MES('fecha', mes)}) AS ingresos,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ${EN_MES('fecha', mes)}) AS variables,
        (SELECT COALESCE(SUM(monto), 0) FROM aportes_meta WHERE ${EN_MES('fecha', mes)}) AS ahorro,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos
           WHERE (fecha AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date) AS hoy,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos
           WHERE cuenta_id IS NOT NULL AND (fecha AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date) AS hoy_con_cuenta,
        (SELECT COUNT(*) FROM cuentas) AS num_cuentas,
        (SELECT COALESCE(SUM(saldo), 0) FROM cuentas) AS en_cuentas,
        (SELECT COALESCE(SUM(monto), 0) FROM aportes_meta) AS apartado_metas,
        (SELECT COALESCE(SUM(monto), 0) FROM gastos
           WHERE (fecha AT TIME ZONE '${ZONA}')::date > (now() AT TIME ZONE '${ZONA}')::date - 7) AS ultimos7,
        (SELECT COALESCE(AVG(t), 0) FROM (
           SELECT SUM(monto) AS t FROM ingresos
           WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') < '${mes}'
             AND fecha > now() - interval '4 months'
           GROUP BY to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM')) x) AS ingreso_promedio`,
    ),
    sql().query(`SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${EN_MES('fecha', mes)} GROUP BY categoria ORDER BY total DESC`),
    sql().query(`SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${EN_MES('fecha', ant)} GROUP BY categoria`),
    deudas(mes),
    fijos(mes),
    topes(),
  ]);
  return calcularResumen({
    mes,
    ingresos: n(tot.ingresos),
    variables: n(tot.variables),
    ahorro: n(tot.ahorro),
    gastadoHoy: n(tot.hoy),
    gastadoHoyConCuenta: n(tot.hoy_con_cuenta),
    cuentas: n(tot.num_cuentas) > 0 ? { total: n(tot.en_cuentas), apartadoMetas: n(tot.apartado_metas) } : null,
    ultimos7: n(tot.ultimos7),
    ingresoPromedio: n(tot.ingreso_promedio),
    porCategoria: cats.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    porCategoriaMesAnterior: catsAnt.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    deudas: ds,
    fijos: fs,
    topes: tps,
  });
}

/** La parte de cálculo del resumen, sin base de datos (se puede probar sola). */
export function calcularResumen(d: {
  mes?: string;
  ingresos: number; variables: number; ahorro?: number; gastadoHoy: number; ultimos7: number; ingresoPromedio?: number;
  /** Si tienes cuentas registradas: su saldo total y lo apartado en metas. */
  cuentas?: { total: number; apartadoMetas: number } | null;
  gastadoHoyConCuenta?: number;
  porCategoria: Resumen['porCategoria']; porCategoriaMesAnterior: Resumen['porCategoria'];
  deudas: Deuda[]; fijos: Fijo[]; topes?: Record<string, number>;
}): Resumen {
  const mes = mesValido(d.mes);
  const hoy = hoyDelMes(mes);
  const ahorro = d.ahorro ?? 0;
  const activas = d.deudas.filter((x) => x.saldo > 0 || x.abonadoMes > 0);
  const cuotas = activas.reduce((s, x) => s + x.cuota, 0);
  // Lo que pagaste de más en la cuota, más los abonos a capital: también salió de tu bolsillo.
  const extraAbonos = d.deudas.reduce((s, x) => s + Math.max(0, x.abonadoMes - x.cuota) + (x.capitalMes ?? 0), 0);
  const fijosTot = d.fijos.reduce((s, f) => s + f.monto, 0);
  const balanceMes = d.ingresos - cuotas - fijosTot - d.variables - extraAbonos - ahorro;

  const pendientes: Pendiente[] = [
    ...d.deudas
      .filter((x) => x.faltaMes > 0)
      .map((x) => ({ tipo: 'cuota' as const, id: x.id, nombre: x.nombre, monto: x.faltaMes, diaPago: x.diaPago })),
    ...d.fijos
      .filter((f) => !f.pagadoMes && f.monto > 0)
      .map((f) => ({ tipo: 'fijo' as const, id: f.id, nombre: f.concepto, monto: f.monto, diaPago: f.diaPago })),
  ].sort((a, b) => (a.diaPago ?? 99) - (b.diaPago ?? 99));

  const totalPendiente = pendientes.reduce((s, p) => s + p.monto, 0);
  // Con cuentas registradas, lo libre es tu plata real: lo que tienes menos lo que aún debes pagar este mes
  // y lo apartado para metas. Para meses pasados (o sin cuentas) se usa el balance del mes.
  const modo: Resumen['modo'] = d.cuentas && hoy.esActual ? 'cuentas' : 'mes';
  const disponible = modo === 'cuentas' ? d.cuentas!.total - totalPendiente - d.cuentas!.apartadoMetas : balanceMes;

  const pago = proximoPago(hoy);
  const gastadoHoy = hoy.esActual ? d.gastadoHoy : 0;
  // El presupuesto de hoy se calcula con la plata que tenías al empezar el día,
  // para que gastar hoy no cambie el número de hoy (solo el de mañana).
  // (Con cuentas, solo los gastos de hoy que salieron de una cuenta ya bajaron el saldo.)
  const yaDescontadoHoy = modo === 'cuentas' ? (d.gastadoHoyConCuenta ?? 0) : gastadoHoy;
  const presupuestoHoy = hoy.esActual ? Math.max(0, Math.floor((disponible + yaDescontadoHoy) / pago.dias)) : 0;
  const ritmo7 = Math.round(d.ultimos7 / 7);

  let proyeccion: Resumen['proyeccion'] = null;
  if (hoy.esActual) {
    const diasRestantes = hoy.diasMes - hoy.dia;
    const ingresoEsperado = Math.max(0, Math.round((d.ingresoPromedio ?? 0) - d.ingresos));
    proyeccion = { finDeMes: Math.round(disponible - ritmo7 * diasRestantes), ingresoEsperado };
  }

  return {
    mes,
    esActual: hoy.esActual,
    modo,
    enCuentas: d.cuentas?.total ?? 0,
    apartadoMetas: d.cuentas?.apartadoMetas ?? 0,
    balanceMes,
    ingresos: d.ingresos,
    cuotas,
    fijos: fijosTot,
    variables: d.variables,
    extraAbonos,
    ahorro,
    disponible,
    porCategoria: d.porCategoria,
    porCategoriaMesAnterior: d.porCategoriaMesAnterior,
    topes: d.topes ?? {},
    gastadoHoy,
    presupuestoHoy,
    proximoPago: pago,
    ritmo7,
    proyeccion,
    pendientes,
    totalPendiente,
    diaHoy: hoy.dia,
    diasMes: hoy.diasMes,
  };
}

// ---------- Exportar ----------

export type FilaExportar = { fecha: string; tipo: string; concepto: string; categoria: string; monto: number; cuenta: string };

export async function movimientosParaExportar(desde: string, hasta: string): Promise<FilaExportar[]> {
  const a = mesValido(desde);
  const b = mesValido(hasta);
  const rows = await sql().query(
    `SELECT * FROM (
       SELECT g.fecha, 'Gasto' AS tipo, g.concepto, g.categoria, -g.monto AS monto, c.nombre AS cuenta
       FROM gastos g LEFT JOIN cuentas c ON c.id = g.cuenta_id
       UNION ALL
       SELECT i.fecha, 'Ingreso', i.concepto, '', i.monto, c.nombre
       FROM ingresos i LEFT JOIN cuentas c ON c.id = i.cuenta_id
     ) m
     WHERE to_char(fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') BETWEEN '${a}' AND '${b}'
     ORDER BY fecha`,
  );
  return rows.map((r) => ({
    fecha: new Date(String(r.fecha)).toLocaleString('sv-SE', { timeZone: ZONA }).slice(0, 16),
    tipo: String(r.tipo), concepto: String(r.concepto), categoria: String(r.categoria ?? ''),
    monto: n(r.monto), cuenta: (r.cuenta as string | null) ?? '',
  }));
}
