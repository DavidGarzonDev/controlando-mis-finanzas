import { sql } from './db';
import { esCategoria, type Categoria, type CategoriaPropia } from './categorias';
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
  /** Cómo cierras el mes si sigues gastando a tu ritmo real (el mayor entre la última semana y el promedio del mes). */
  proyeccion: { finDeMes: number; ingresoEsperado: number; ritmo: number; diasRestantes: number } | null;
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
  concepto: string; monto: number; categoria: string; origen: 'telegram' | 'web' | 'auto'; texto?: string; cuentaId?: number | null;
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
  if (!antes) return;
  await moverCuenta(nulo(antes.cuenta_id), n(antes.monto));
  // Si era una cuenta dividida, también se deshacen las partes que te debían (la plata vuelve completa)
  for (const p of await sql()`SELECT id FROM prestamos WHERE gasto_id = ${id}`) await borrarPrestamo(n(p.id));
}

const filaGasto = (r: Record<string, unknown>): Gasto => ({
  id: n(r.id), fecha: String(r.fecha), concepto: String(r.concepto), monto: n(r.monto),
  categoria: String(r.categoria), origen: String(r.origen), cuentaId: nulo(r.cuenta_id),
});

export async function gastoPorId(id: number): Promise<Gasto | null> {
  const rows = await sql()`SELECT id, fecha, concepto, monto, categoria, origen, cuenta_id FROM gastos WHERE id = ${id}`;
  return rows[0] ? filaGasto(rows[0]) : null;
}

export async function ingresoPorId(id: number): Promise<Ingreso | null> {
  const [r] = await sql()`SELECT id, fecha, concepto, monto, cuenta_id FROM ingresos WHERE id = ${id}`;
  return r ? { id: n(r.id), fecha: String(r.fecha), concepto: String(r.concepto), monto: n(r.monto), cuentaId: nulo(r.cuenta_id) } : null;
}

/** El otro monto posible mientras no lo confirmes ("700": ¿$700 o $700.000?). */
export async function dudaMonto(tipo: 'gasto' | 'ingreso', id: number): Promise<number | null> {
  const [r] = await sql().query(`SELECT duda_monto FROM ${tipo === 'gasto' ? 'gastos' : 'ingresos'} WHERE id = $1`, [id]);
  return r ? nulo(r.duda_monto) : null;
}
export async function guardarDuda(tipo: 'gasto' | 'ingreso', id: number, otro: number | null) {
  await sql().query(`UPDATE ${tipo === 'gasto' ? 'gastos' : 'ingresos'} SET duda_monto = $1 WHERE id = $2`, [otro, id]);
}

/** Cambia la cuenta de un gasto o ingreso: devuelve la plata a la cuenta vieja y la mueve en la nueva. */
export async function cambiarCuenta(tipo: 'gasto' | 'ingreso', id: number, cuentaId: number) {
  const tabla = tipo === 'gasto' ? 'gastos' : 'ingresos';
  const [antes] = await sql().query(`SELECT monto, cuenta_id FROM ${tabla} WHERE id = $1`, [id]);
  if (!antes) return null;
  const signo = tipo === 'gasto' ? -1 : 1;
  if (nulo(antes.cuenta_id) === cuentaId) return { mismo: true };
  await sql().query(`UPDATE ${tabla} SET cuenta_id = $1 WHERE id = $2`, [cuentaId, id]);
  await moverCuenta(nulo(antes.cuenta_id), -signo * n(antes.monto));
  await moverCuenta(cuentaId, signo * n(antes.monto));
  return { mismo: false };
}

/** Cuántas veces y cuánto en los últimos 7 días para conceptos que coinciden (ej. domicilios). */
export async function vecesEnLaSemana(patron: string): Promise<{ veces: number; total: number }> {
  const [r] = await sql().query(
    `SELECT COUNT(*) AS veces, COALESCE(SUM(monto), 0) AS total FROM gastos
     WHERE fecha > now() - interval '7 days' AND (concepto ~* $1 OR texto_original ~* $1)`,
    [patron],
  );
  return { veces: n(r?.veces), total: n(r?.total) };
}

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

/** El último gasto o ingreso registrado (el más reciente de los dos). */
export async function ultimoMovimiento(): Promise<{ tipo: 'gasto' | 'ingreso'; id: number; concepto: string; monto: number; cuentaId: number | null } | null> {
  const [r] = await sql()`
    SELECT * FROM (
      SELECT 'gasto' AS tipo, id, fecha, concepto, monto, cuenta_id FROM gastos
      UNION ALL
      SELECT 'ingreso', id, fecha, concepto, monto, cuenta_id FROM ingresos
    ) m ORDER BY fecha DESC, id DESC LIMIT 1`;
  return r ? { tipo: r.tipo as 'gasto' | 'ingreso', id: n(r.id), concepto: String(r.concepto), monto: n(r.monto), cuentaId: nulo(r.cuenta_id) } : null;
}

/** Cambia el monto de un gasto o ingreso (ej. era $700 y no $700.000). Ajusta el saldo de su cuenta. */
export async function corregirMonto(tipo: 'gasto' | 'ingreso', id: number, monto: number) {
  if (tipo === 'gasto') {
    const [g] = await sql()`SELECT concepto, categoria FROM gastos WHERE id = ${id}`;
    if (!g) return null;
    await actualizarGasto(id, { concepto: String(g.concepto), monto, categoria: String(g.categoria) });
  } else {
    const [i] = await sql()`SELECT concepto FROM ingresos WHERE id = ${id}`;
    if (!i) return null;
    await actualizarIngreso(id, { concepto: String(i.concepto), monto });
  }
  return { monto };
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
  const [ab] = await sql()`INSERT INTO abonos (deuda_id, monto, cuenta_id, tipo) VALUES (${id}, ${monto}, ${cuentaId ?? null}, ${tipo}) RETURNING id`;
  await moverCuenta(cuentaId, -monto);
  return { id: n(rows[0].id), nombre: String(rows[0].nombre), saldo: n(rows[0].saldo), cuota: n(rows[0].cuota), abonoId: n(ab.id) };
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
    await anotarAjuste(id, c.saldo);
    await sql()`
      UPDATE cuentas SET nombre = ${c.nombre}, banco = ${c.banco}, saldo = ${c.saldo}, ultimos4 = ${c.ultimos4},
        franquicia = ${c.franquicia}, color = ${c.color}, actualizado = now()
      WHERE id = ${id}`;
  } else {
    const [nueva] = await sql()`
      INSERT INTO cuentas (nombre, banco, saldo, ultimos4, franquicia, color, principal)
      VALUES (${c.nombre}, ${c.banco}, ${c.saldo}, ${c.ultimos4}, ${c.franquicia}, ${c.color}, ${c.principal ?? false})
      RETURNING id`;
    await sql()`INSERT INTO ajustes_saldo (cuenta_id, antes, despues) VALUES (${n(nueva.id)}, 0, ${c.saldo})`;
  }
}

/** Si el saldo nuevo es distinto al que había, deja constancia (antes → después). */
async function anotarAjuste(id: number, saldoNuevo: number) {
  const [c] = await sql()`SELECT saldo FROM cuentas WHERE id = ${id}`;
  if (c && n(c.saldo) !== saldoNuevo) await sql()`INSERT INTO ajustes_saldo (cuenta_id, antes, despues) VALUES (${id}, ${n(c.saldo)}, ${saldoNuevo})`;
}

export type MovCuenta = {
  fecha: string; tipo: 'gasto' | 'ingreso' | 'sale' | 'entra' | 'pago' | 'ajuste';
  /** null: es de antes de que se anotaran los cambios de saldo a mano, así que no se sabe cuánto quedó. */
  concepto: string; delta: number; saldoDespues: number | null; antes?: number;
};

/**
 * Todo lo que movió el saldo de una cuenta (lo más nuevo primero), con el saldo que quedó después de cada cosa.
 * Se calcula hacia atrás desde el saldo actual; los cambios de saldo a mano aparecen como "ajuste".
 */
export async function movimientosCuenta(id: number, limite = 40): Promise<{
  cuenta: Cuenta | null; movs: MovCuenta[];
  /** Cuánto había antes del movimiento más viejo de la lista (si no hubo cambios a mano sin anotar). */
  saldoAntes: number; entradas: number; salidas: number; completo: boolean;
}> {
  const cuenta = (await cuentas()).find((c) => c.id === id) ?? null;
  if (!cuenta) return { cuenta: null, movs: [], saldoAntes: 0, entradas: 0, salidas: 0, completo: true };
  const rows = await sql().query(
    `SELECT * FROM (
       SELECT fecha, 'gasto' AS tipo, concepto, -monto AS delta, NULL::int AS antes, NULL::int AS despues FROM gastos WHERE cuenta_id = $1
       UNION ALL SELECT fecha, 'ingreso', concepto, monto, NULL, NULL FROM ingresos WHERE cuenta_id = $1
       UNION ALL SELECT t.fecha, 'sale', COALESCE(t.nota, 'Pasaste a ' || COALESCE(c.nombre, 'otra cuenta')), -t.monto, NULL, NULL
         FROM transferencias t LEFT JOIN cuentas c ON c.id = t.hacia_id WHERE t.desde_id = $1
       UNION ALL SELECT t.fecha, 'entra', COALESCE(t.nota, 'Llegó de ' || COALESCE(c.nombre, 'otra cuenta')), t.monto, NULL, NULL
         FROM transferencias t LEFT JOIN cuentas c ON c.id = t.desde_id WHERE t.hacia_id = $1
       UNION ALL SELECT a.fecha, 'pago', 'Pago a ' || d.nombre, -a.monto, NULL, NULL
         FROM abonos a JOIN deudas d ON d.id = a.deuda_id WHERE a.cuenta_id = $1
       UNION ALL SELECT pf.fecha, 'pago', f.concepto || ' (gasto fijo)', -pf.monto, NULL, NULL
         FROM pagos_fijos pf JOIN fijos f ON f.id = pf.fijo_id WHERE pf.cuenta_id = $1 AND pf.monto IS NOT NULL
       UNION ALL SELECT fecha, 'sale', 'Préstamo a ' || persona, -monto, NULL, NULL FROM prestamos WHERE cuenta_id = $1
       UNION ALL SELECT pp.fecha, 'entra', p.persona || ' te devolvió', pp.monto, NULL, NULL
         FROM pagos_prestamo pp JOIN prestamos p ON p.id = pp.prestamo_id WHERE pp.cuenta_id = $1
       UNION ALL SELECT fecha, 'ajuste', 'Pusiste el saldo a mano', despues - antes, antes, despues FROM ajustes_saldo WHERE cuenta_id = $1
     ) m ORDER BY fecha DESC LIMIT $2`,
    [id, limite],
  );
  const [desde] = await sql()`SELECT fecha FROM migraciones WHERE id = 'registro_ajustes'`;
  const inicioRegistro = desde ? new Date(String(desde.fecha)).getTime() : 0;
  let saldo = cuenta.saldo;
  const movs: MovCuenta[] = rows.map((r) => {
    const conocido = new Date(String(r.fecha)).getTime() >= inicioRegistro;
    const m: MovCuenta = {
      fecha: String(r.fecha), tipo: r.tipo as MovCuenta['tipo'], concepto: String(r.concepto), delta: n(r.delta),
      saldoDespues: r.tipo === 'ajuste' ? n(r.despues) : conocido ? saldo : null, antes: r.tipo === 'ajuste' ? n(r.antes) : undefined,
    };
    saldo = r.tipo === 'ajuste' ? n(r.antes) : saldo - n(r.delta);
    return m;
  });
  // Totales desde el último ajuste a mano (o desde el principio de la lista)
  const hastaAjuste = movs.findIndex((m) => m.tipo === 'ajuste');
  const tramo = hastaAjuste >= 0 ? movs.slice(0, hastaAjuste) : movs;
  const entradas = tramo.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const salidas = tramo.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);
  const saldoAntes = hastaAjuste >= 0 ? movs[hastaAjuste].saldoDespues ?? 0 : saldo;
  return { cuenta, movs, saldoAntes, entradas, salidas, completo: rows.length < limite };
}
/** La cuenta de efectivo; si no existe, la crea en $0. */
export async function cuentaEfectivo(): Promise<Cuenta> {
  const existente = (await cuentas()).find((c) => c.banco === 'efectivo');
  if (existente) return existente;
  await sql()`INSERT INTO cuentas (nombre, banco, saldo) VALUES ('Efectivo', 'efectivo', 0)`;
  return (await cuentas()).find((c) => c.banco === 'efectivo')!;
}

export async function actualizarSaldoCuenta(id: number, saldo: number) {
  await anotarAjuste(id, saldo);
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
            -- Lo apartado para metas sigue dentro de tus cuentas: no se suma otra vez
            (SELECT COALESCE(SUM(saldo), 0) FROM cuentas) + (SELECT COALESCE(SUM(pendiente), 0) FROM prestamos),
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

/**
 * Marca (o desmarca) un gasto fijo como pagado este mes. Si dices de qué cuenta salió, se descuenta de esa
 * cuenta; al desmarcarlo, la plata vuelve. Devuelve false si ya estaba marcado.
 */
export async function marcarFijo(id: number, pagado: boolean, mes = mesClave(), cuentaId: number | null = null): Promise<boolean> {
  const m = mesValido(mes);
  if (pagado) {
    const [f] = await sql()`SELECT monto FROM fijos WHERE id = ${id}`;
    if (!f) return false;
    const r = await sql()`
      INSERT INTO pagos_fijos (fijo_id, mes, cuenta_id, monto) VALUES (${id}, ${m}, ${cuentaId}, ${n(f.monto)})
      ON CONFLICT DO NOTHING RETURNING fijo_id`;
    if (!r[0]) return false;
    await moverCuenta(cuentaId, -n(f.monto));
    return true;
  }
  const [p] = await sql()`DELETE FROM pagos_fijos WHERE fijo_id = ${id} AND mes = ${m} RETURNING cuenta_id, monto`;
  if (p) await moverCuenta(nulo(p.cuenta_id), n(p.monto));
  return Boolean(p);
}

/** Le pone cuenta al pago de un fijo que se marcó sin ella (botón del bot). Solo descuenta una vez. */
export async function cuentaPagoFijo(id: number, cuentaId: number, mes = mesClave()) {
  const [p] = await sql()`
    UPDATE pagos_fijos SET cuenta_id = ${cuentaId}
    WHERE fijo_id = ${id} AND mes = ${mesValido(mes)} AND cuenta_id IS NULL RETURNING monto`;
  if (!p) return false;
  await moverCuenta(cuentaId, -n(p.monto));
  return true;
}

/** Le pone cuenta a un pago de crédito que se registró sin ella (botón del bot). */
export async function cuentaAbono(abonoId: number, cuentaId: number) {
  const [a] = await sql()`UPDATE abonos SET cuenta_id = ${cuentaId} WHERE id = ${abonoId} AND cuenta_id IS NULL RETURNING monto`;
  if (!a) return false;
  await moverCuenta(cuentaId, -n(a.monto));
  return true;
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
  const [rows, propias] = await Promise.all([sql()`SELECT palabra, categoria FROM palabras`, nombresPropios()]);
  const out: Record<string, Categoria> = {};
  for (const r of rows) if (esCategoria(String(r.categoria), propias)) out[String(r.palabra)] = String(r.categoria);
  return out;
}

// ---------- Tu año en Pilas ----------

export type Anio = {
  anio: number; gastos: number; ingresos: number; ahorro: number; movimientos: number; diasConGasto: number;
  porMes: { mes: number; gastos: number; ingresos: number }[];
  categorias: { categoria: string; total: number }[];
  repetidos: { concepto: string; veces: number; total: number }[];
  diaMasCaro: { fecha: string; total: number } | null;
  deudaInicio: number | null; deudaFin: number | null;
};

export async function resumenAnio(anio: number): Promise<Anio> {
  const dia = `(fecha AT TIME ZONE '${ZONA}')`;
  const filtro = `EXTRACT(YEAR FROM ${dia}) = $1`;
  const [[t], meses, cats, reps, [caro], deu] = await Promise.all([
    sql().query(`SELECT
        (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ${filtro}) AS gastos,
        (SELECT COUNT(*) FROM gastos WHERE ${filtro}) AS movimientos,
        (SELECT COUNT(DISTINCT ${dia}::date) FROM gastos WHERE ${filtro}) AS dias,
        (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE ${filtro}) AS ingresos,
        (SELECT COALESCE(SUM(monto), 0) FROM aportes_meta WHERE ${filtro}) AS ahorro`, [anio]),
    sql().query(`SELECT m AS mes,
        COALESCE((SELECT SUM(monto) FROM gastos WHERE ${filtro} AND EXTRACT(MONTH FROM ${dia}) = m), 0) AS gastos,
        COALESCE((SELECT SUM(monto) FROM ingresos WHERE ${filtro} AND EXTRACT(MONTH FROM ${dia}) = m), 0) AS ingresos
      FROM generate_series(1, 12) AS m`, [anio]),
    sql().query(`SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${filtro} AND categoria <> 'Ajuste' GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [anio]),
    sql().query(`SELECT initcap(lower(trim(concepto))) AS concepto, COUNT(*) AS veces, SUM(monto) AS total FROM gastos
      WHERE ${filtro} GROUP BY 1 HAVING COUNT(*) >= 2 ORDER BY 2 DESC, 3 DESC LIMIT 5`, [anio]),
    sql().query(`SELECT to_char(${dia}::date, 'YYYY-MM-DD') AS fecha, SUM(monto) AS total FROM gastos WHERE ${filtro}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, [anio]),
    sql().query(`SELECT deudas FROM patrimonio_diario WHERE EXTRACT(YEAR FROM fecha) = $1 ORDER BY fecha`, [anio]),
  ]);
  return {
    anio, gastos: n(t.gastos), ingresos: n(t.ingresos), ahorro: n(t.ahorro), movimientos: n(t.movimientos), diasConGasto: n(t.dias),
    porMes: meses.map((m) => ({ mes: n(m.mes), gastos: n(m.gastos), ingresos: n(m.ingresos) })),
    categorias: cats.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    repetidos: reps.map((r) => ({ concepto: String(r.concepto), veces: n(r.veces), total: n(r.total) })),
    diaMasCaro: caro ? { fecha: String(caro.fecha), total: n(caro.total) } : null,
    deudaInicio: deu.length ? n(deu[0].deudas) : null,
    deudaFin: deu.length ? n(deu[deu.length - 1].deudas) : null,
  };
}

// ---------- Registro automático ----------

/** Ya llegó esta misma notificación hace poco? (el banco a veces la manda por push, SMS y correo). Si no, la anota. */
export async function notificacionNueva(huella: string): Promise<boolean> {
  await sql()`DELETE FROM notificaciones_vistas WHERE fecha < now() - interval '3 days'`;
  const rows = await sql()`INSERT INTO notificaciones_vistas (huella) VALUES (${huella}) ON CONFLICT DO NOTHING RETURNING huella`;
  return rows.length > 0;
}
export async function notificacionesUltimaHora(): Promise<number> {
  const [r] = await sql()`SELECT COUNT(*) AS n FROM notificaciones_vistas WHERE fecha > now() - interval '1 hour'`;
  return n(r?.n);
}
/** Un gasto del mismo monto en los últimos minutos (quizá ya lo registraste a mano). */
export async function gastoReciente(monto: number, minutos = 20): Promise<Gasto | null> {
  const rows = await sql().query(
    `SELECT id, fecha, concepto, monto, categoria, origen, cuenta_id FROM gastos
     WHERE monto = $1 AND fecha > now() - ($2 || ' minutes')::interval ORDER BY fecha DESC LIMIT 1`,
    [monto, String(minutos)],
  );
  return rows[0] ? filaGasto(rows[0]) : null;
}

// ---------- Semana ----------

export type Semana = {
  desde: string; hasta: string; total: number; anterior: number; veces: number;
  porCategoria: { categoria: string; total: number }[];
  porDia: { fecha: string; total: number }[];
  ingresos: number;
};

/** Los últimos 7 días (hoy incluido) contra los 7 anteriores. */
export async function resumenSemana(): Promise<Semana> {
  const hoy = `(now() AT TIME ZONE '${ZONA}')::date`;
  const dia = `(fecha AT TIME ZONE '${ZONA}')::date`;
  const [[t], cats, dias] = await Promise.all([
    sql().query(`SELECT
      (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ${dia} > ${hoy} - 7) AS total,
      (SELECT COUNT(*) FROM gastos WHERE ${dia} > ${hoy} - 7) AS veces,
      (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ${dia} > ${hoy} - 14 AND ${dia} <= ${hoy} - 7) AS anterior,
      (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE ${dia} > ${hoy} - 7) AS ingresos,
      to_char(${hoy} - 6, 'YYYY-MM-DD') AS desde, to_char(${hoy}, 'YYYY-MM-DD') AS hasta`),
    sql().query(`SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${dia} > ${hoy} - 7 AND categoria <> 'Ajuste'
      GROUP BY categoria ORDER BY total DESC`),
    sql().query(`SELECT to_char(d, 'YYYY-MM-DD') AS fecha,
        COALESCE((SELECT SUM(monto) FROM gastos WHERE ${dia} = d::date), 0) AS total
      FROM generate_series(${hoy} - 6, ${hoy}, interval '1 day') AS d ORDER BY d`),
  ]);
  return {
    desde: String(t.desde), hasta: String(t.hasta), total: n(t.total), anterior: n(t.anterior), veces: n(t.veces), ingresos: n(t.ingresos),
    porCategoria: cats.map((c) => ({ categoria: String(c.categoria), total: n(c.total) })),
    porDia: dias.map((d) => ({ fecha: String(d.fecha), total: n(d.total) })),
  };
}

/** Marca la semana como enviada; false si ya se había enviado. */
export async function marcarSemana(fecha: string): Promise<boolean> {
  const rows = await sql()`INSERT INTO resumenes_semanales (semana) VALUES (${fecha}) ON CONFLICT DO NOTHING RETURNING semana`;
  return rows.length > 0;
}

// ---------- Préstamos a personas ("te deben") ----------

export type PagoPrestamo = { id: number; fecha: string; monto: number; cuentaId: number | null };
export type Prestamo = {
  id: number; fecha: string; persona: string; monto: number; pendiente: number; cuentaId: number | null; nota: string | null;
  pagos: PagoPrestamo[];
};

export async function prestamos(soloPendientes = false): Promise<Prestamo[]> {
  const [rows, pagos] = await Promise.all([
    sql().query(`SELECT id, fecha, persona, monto, pendiente, cuenta_id, nota FROM prestamos
      ${soloPendientes ? 'WHERE pendiente > 0' : ''} ORDER BY (pendiente > 0) DESC, fecha DESC LIMIT 200`),
    sql()`SELECT id, fecha, prestamo_id, monto, cuenta_id FROM pagos_prestamo ORDER BY fecha`,
  ]);
  return rows.map((r) => ({
    id: n(r.id), fecha: String(r.fecha), persona: String(r.persona), monto: n(r.monto), pendiente: n(r.pendiente),
    cuentaId: nulo(r.cuenta_id), nota: r.nota ? String(r.nota) : null,
    pagos: pagos.filter((p) => n(p.prestamo_id) === n(r.id)).map((p) => ({ id: n(p.id), fecha: String(p.fecha), monto: n(p.monto), cuentaId: nulo(p.cuenta_id) })),
  }));
}

/** Prestas plata: sale de la cuenta, pero no es gasto (queda como "te deben"). */
export async function crearPrestamo(p: { persona: string; monto: number; cuentaId: number | null; nota?: string | null }): Promise<number> {
  const [r] = await sql()`
    INSERT INTO prestamos (persona, monto, pendiente, cuenta_id, nota)
    VALUES (${p.persona.slice(0, 60)}, ${p.monto}, ${p.monto}, ${p.cuentaId}, ${p.nota ?? null}) RETURNING id`;
  await moverCuenta(p.cuentaId, -p.monto);
  return n(r.id);
}

/** Le pone cuenta a un préstamo que se anotó sin ella (botón del bot): ahí sí sale la plata. */
export async function asignarCuentaPrestamo(id: number, cuentaId: number) {
  const [p] = await sql()`UPDATE prestamos SET cuenta_id = ${cuentaId} WHERE id = ${id} AND cuenta_id IS NULL RETURNING monto`;
  if (p) await moverCuenta(cuentaId, -n(p.monto));
}

/** Te devuelven (todo o una parte): la plata entra a la cuenta y baja lo que te deben. No es ingreso. */
export async function pagarPrestamo(id: number, monto: number, cuentaId: number | null) {
  const [p] = await sql()`SELECT pendiente FROM prestamos WHERE id = ${id}`;
  if (!p) return null;
  const abono = Math.min(monto, n(p.pendiente));
  if (abono <= 0) return { abono: 0, pendiente: n(p.pendiente) };
  await sql()`INSERT INTO pagos_prestamo (prestamo_id, monto, cuenta_id) VALUES (${id}, ${abono}, ${cuentaId})`;
  const [q] = await sql()`UPDATE prestamos SET pendiente = pendiente - ${abono} WHERE id = ${id} RETURNING pendiente`;
  await moverCuenta(cuentaId, abono);
  return { abono, pendiente: n(q.pendiente) };
}

/** Borra el préstamo (si fue un error): devuelve la plata a la cuenta y deshace lo que te habían pagado. */
export async function borrarPrestamo(id: number) {
  const pagos = await sql()`SELECT monto, cuenta_id FROM pagos_prestamo WHERE prestamo_id = ${id}`;
  const [p] = await sql()`DELETE FROM prestamos WHERE id = ${id} RETURNING monto, cuenta_id`;
  if (!p) return;
  await moverCuenta(nulo(p.cuenta_id), n(p.monto));
  for (const x of pagos) await moverCuenta(nulo(x.cuenta_id), -n(x.monto));
}

/** Un gasto que en realidad era un préstamo: se vuelve préstamo sin mover la plata otra vez. */
export async function convertirEnPrestamo(gastoId: number, persona: string): Promise<number | null> {
  const [g] = await sql()`DELETE FROM gastos WHERE id = ${gastoId} RETURNING monto, cuenta_id, concepto`;
  if (!g) return null;
  const [r] = await sql()`
    INSERT INTO prestamos (persona, monto, pendiente, cuenta_id, nota)
    VALUES (${persona.slice(0, 60)}, ${n(g.monto)}, ${n(g.monto)}, ${nulo(g.cuenta_id)}, ${String(g.concepto)}) RETURNING id`;
  return n(r.id);
}

export type Division = { personas: number; parte: number; teDeben: number; deudores: { persona: string; monto: number }[] };

/** Si el gasto ya se dividió: entre cuántos y cuánto te deben por él. */
export async function divisionDeGasto(gastoId: number): Promise<Division | null> {
  const rows = await sql()`SELECT persona, monto, nota FROM prestamos WHERE gasto_id = ${gastoId} ORDER BY id`;
  if (!rows.length) return null;
  const [g] = await sql()`SELECT monto FROM gastos WHERE id = ${gastoId}`;
  const personas = Number(String(rows[0].nota ?? '').match(/entre (\d+)/)?.[1]) || rows.length + 1;
  return {
    personas, parte: n(g?.monto), teDeben: rows.reduce((s, r) => s + n(r.monto), 0),
    deudores: rows.map((r) => ({ persona: String(r.persona), monto: n(r.monto) })),
  };
}

/**
 * Dividir la cuenta ("la vaca"): pagaste todo, pero tu parte es solo una. El gasto queda en tu parte y
 * lo de los demás queda en "Te deben" (sin mover la plata otra vez: ya salió toda de tu cuenta).
 * Con nombres, un préstamo por persona; sin nombres, uno solo por el resto.
 */
export async function dividirGasto(gastoId: number, personas: number, nombres: string[] = []): Promise<Division | null> {
  if (!Number.isInteger(personas) || personas < 2 || personas > 30) return null;
  if (await divisionDeGasto(gastoId)) return null; // ya estaba dividido
  const [g] = await sql()`SELECT concepto, monto, cuenta_id FROM gastos WHERE id = ${gastoId}`;
  if (!g || n(g.monto) < personas) return null;
  const total = n(g.monto);
  const concepto = String(g.concepto);
  const cada = Math.floor(total / personas);
  const parte = total - cada * (personas - 1);
  const otros = personas - 1;
  const deudores = nombres.length === otros
    ? nombres.map((p) => ({ persona: p, monto: cada }))
    : [{ persona: `${concepto} (${otros} ${otros === 1 ? 'persona' : 'personas'})`, monto: cada * otros }];
  const nota = `Cuenta dividida entre ${personas}: ${concepto} de ${total}`;
  await sql()`UPDATE gastos SET monto = ${parte} WHERE id = ${gastoId}`;
  for (const d of deudores) {
    await sql()`
      INSERT INTO prestamos (persona, monto, pendiente, cuenta_id, nota, gasto_id)
      VALUES (${d.persona.slice(0, 60)}, ${d.monto}, ${d.monto}, ${nulo(g.cuenta_id)}, ${nota}, ${gastoId})`;
  }
  return { personas, parte, teDeben: total - parte, deudores };
}

/** "Envío a juan" / "Presté abuelo mi novia" → "Juan" / "Abuelo mi novia": la persona a partir del concepto de un gasto. */
export function personaDeConcepto(concepto: string): string {
  const t = concepto
    .replace(/^(env[ií]o|pr[eé]stamo|prest[eé]|le prest[eé]|transferencia)\s+(a|al|para)?\s*/i, '')
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Alguien';
}

// ---------- Categorías propias ----------

export async function categoriasPropias(): Promise<CategoriaPropia[]> {
  const rows = await sql()`SELECT nombre, emoji, color FROM categorias_propias ORDER BY creada`;
  return rows.map((r) => ({ nombre: String(r.nombre), emoji: r.emoji ? String(r.emoji) : null, color: r.color ? String(r.color) : null }));
}
export async function nombresPropios(): Promise<string[]> {
  return (await categoriasPropias()).map((c) => c.nombre);
}
/** Crea (o actualiza) una categoría. El nombre queda con mayúscula inicial; máximo 24 letras. */
export async function crearCategoria(nombre: string, emoji: string | null, color: string | null): Promise<string | null> {
  const limpio = nombre.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').replace(/[^\p{L}\d ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (limpio.length < 2) return null;
  const n = limpio[0].toUpperCase() + limpio.slice(1);
  if (esCategoria(n) || n === 'Ajuste') return n;
  const e = emoji?.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u)?.[0] ?? null;
  await sql()`
    INSERT INTO categorias_propias (nombre, emoji, color) VALUES (${n}, ${e}, ${color})
    ON CONFLICT (nombre) DO UPDATE SET emoji = COALESCE(EXCLUDED.emoji, categorias_propias.emoji), color = COALESCE(EXCLUDED.color, categorias_propias.color)`;
  return n;
}
/** Borra una categoría propia: sus gastos pasan a "Otros" y se olvida lo aprendido. */
export async function borrarCategoria(nombre: string) {
  await sql()`UPDATE gastos SET categoria = 'Otros' WHERE categoria = ${nombre}`;
  await sql()`DELETE FROM palabras WHERE categoria = ${nombre}`;
  await sql()`DELETE FROM presupuestos WHERE categoria = ${nombre}`;
  await sql()`DELETE FROM categorias_propias WHERE nombre = ${nombre}`;
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
    // Ritmo realista: la última semana puede haber sido tranquila; el promedio del mes ya incluye
    // las salidas, la gasolina y los antojos que siempre aparecen. Se usa el mayor de los dos.
    const promedioMes = hoy.dia > 0 ? d.variables / hoy.dia : 0;
    const ritmo = Math.round(Math.max(ritmo7, promedioMes));
    proyeccion = { finDeMes: Math.round(disponible - ritmo * diasRestantes), ingresoEsperado, ritmo, diasRestantes };
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
