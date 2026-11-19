import type { Deuda, Fijo, Hormiga, Meta, Resumen, Suscripcion } from './datos';

export type Nivel = 'alerta' | 'aviso' | 'idea' | 'bien';
export type Consejo = { id: string; nivel: Nivel; titulo: string; texto: string };

const pesos = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('es-CO');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Tasa mensual (0.025 = 2,5 %) a partir de lo que escribió el usuario: "35.9% E.A.", "2,1% M.V.", "~28-29% E.A.". */
export function tasaMensual(tasa: string | null): number | null {
  if (!tasa) return null;
  const m = tasa.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const valor = Number(m[1]) / 100;
  if (!(valor > 0) || valor > 10) return null;
  if (/m\.?\s*v|mensual|\bmes\b/i.test(tasa)) return valor;
  return Math.pow(1 + valor, 1 / 12) - 1; // efectiva anual → mensual
}

/** Meses para pagar `saldo` con `cuota` mensual y tasa `r`. Infinity si la cuota no cubre ni los intereses. */
export function mesesParaPagar(saldo: number, cuota: number, r: number | null): number {
  if (saldo <= 0) return 0;
  if (cuota <= 0) return Infinity;
  if (!r) return Math.ceil(saldo / cuota);
  if (cuota <= saldo * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * saldo) / cuota) / Math.log(1 + r));
}

export type Simulacion = { meses: number; intereses: number; totalPagado: number };

/**
 * Simula el pago mes a mes: cada mes se suman los intereses del saldo y se resta la cuota (+ abono extra).
 * `abonoHoy` es un abono a capital que se hace ya, antes del primer mes.
 * Devuelve null si con esa cuota la deuda nunca se termina (la cuota no cubre ni los intereses).
 */
export function simularPago(saldo: number, cuota: number, r: number | null, extraMensual = 0, abonoHoy = 0): Simulacion | null {
  let s = Math.max(0, saldo - abonoHoy);
  const pago = cuota + extraMensual;
  if (s <= 0) return { meses: 0, intereses: 0, totalPagado: Math.min(abonoHoy, saldo) };
  if (pago <= 0) return null;
  const tasa = r ?? 0;
  if (pago <= s * tasa) return null;
  let intereses = 0;
  let total = Math.min(abonoHoy, saldo);
  for (let mes = 1; mes <= 600; mes++) {
    const interes = s * tasa;
    intereses += interes;
    s += interes;
    const pagoMes = Math.min(pago, s);
    total += pagoMes;
    s -= pagoMes;
    if (s <= 0.5) return { meses: mes, intereses: Math.round(intereses), totalPagado: Math.round(total) };
  }
  return null;
}

function mesDentroDe(meses: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

const ORDEN: Record<Nivel, number> = { alerta: 0, aviso: 1, idea: 2, bien: 3 };

/** Recomendaciones con reglas simples sobre tus números. No usa IA. */
export function generarConsejos(
  r: Resumen,
  deudas: Deuda[],
  fijos: Fijo[],
  extra: { metas?: Meta[]; hormiga?: Hormiga[]; suscripciones?: Suscripcion[] } = {},
): Consejo[] {
  const out: Consejo[] = [];
  const activas = deudas.filter((d) => d.saldo > 0);
  const pago = r.proximoPago;
  const fechaPago = `el ${pago.dia}`;

  // --- El mes en general ---
  const conBase = r.modo === 'cuentas' || r.ingresos > 0;
  if (!conBase) {
    out.push({
      id: 'sin-ingresos', nivel: 'idea', titulo: 'Registra lo que te entra',
      texto: 'Sin ingresos registrados no puedo calcular cuánto te alcanza. Escríbele al bot “me pagaron 1.100.000” o “tengo 300 mil en efectivo”.',
    });
  } else if (r.disponible < 0) {
    out.push({
      id: 'sobregiro', nivel: 'alerta', titulo: `Te faltan ${pesos(-r.disponible)}`,
      texto: r.modo === 'cuentas'
        ? 'Lo que tienes en tus cuentas no alcanza para lo que te falta pagar este mes. Prioriza las cuotas y frena lo que no sea necesario hasta el próximo pago.'
        : 'Tus cuotas, fijos y gastos de este mes ya superan lo que te ha entrado. Frena los gastos que no sean necesarios hasta el próximo pago.',
    });
  }

  // --- El ritmo de gasto ---
  if (r.esActual && conBase && r.disponible > 0 && r.ritmo7 > 0) {
    const limite = r.presupuestoHoy;
    if (r.ritmo7 > limite * 1.15) {
      const diasQueAlcanza = Math.floor(r.disponible / r.ritmo7);
      out.push({
        id: 'ritmo', nivel: 'aviso', titulo: 'Estás gastando más rápido de lo que alcanza',
        texto: `Esta semana vas en ${pesos(r.ritmo7)} por día y tu límite es ${pesos(limite)}. A ese ritmo la plata te dura ${diasQueAlcanza} ${diasQueAlcanza === 1 ? 'día' : 'días'}, y faltan ${pago.dias} para ${fechaPago}.`,
      });
    } else if (r.ritmo7 < limite * 0.8 && r.diaHoy > 3) {
      out.push({
        id: 'ritmo-bien', nivel: 'bien', titulo: 'Vas bien de ritmo',
        texto: `Esta semana gastas ${pesos(r.ritmo7)} por día, por debajo de tu límite de ${pesos(limite)}. Lo que sobre al ${pago.dia}, abónalo a tu deuda o guárdalo.`,
      });
    }
  }
  if (r.esActual && r.gastadoHoy > r.presupuestoHoy && r.presupuestoHoy > 0) {
    out.push({
      id: 'hoy', nivel: 'aviso', titulo: 'Hoy ya te pasaste del límite',
      texto: `Llevas ${pesos(r.gastadoHoy)} y el límite de hoy era ${pesos(r.presupuestoHoy)}. Mañana el límite baja para compensar.`,
    });
  }

  // --- Proyección de fin de mes ---
  if (r.proyeccion && conBase && r.diasMes - r.diaHoy >= 3) {
    const { finDeMes, ingresoEsperado } = r.proyeccion;
    if (finDeMes < 0) {
      out.push({
        id: 'proyeccion', nivel: finDeMes + ingresoEsperado < 0 ? 'alerta' : 'aviso',
        titulo: `A este ritmo terminas el mes en ${pesos(finDeMes)}`,
        texto: ingresoEsperado > 0
          ? `Si te entra lo de siempre (unos ${pesos(ingresoEsperado)} más), cerrarías en ${pesos(finDeMes + ingresoEsperado)}. Baja el gasto diario para no depender de eso.`
          : `Gastas ${pesos(r.ritmo7)} por día. Bajar un poco el ritmo los días que quedan te deja en verde.`,
      });
    } else if (finDeMes > 50_000 && r.esActual) {
      out.push({
        id: 'proyeccion', nivel: 'bien', titulo: `Vas para terminar el mes con ${pesos(finDeMes)} libres`,
        texto: 'Decide desde ya a dónde va: un abono a capital de tu deuda más cara o tu fondo de emergencia.',
      });
    }
  }

  // --- Topes por categoría ---
  for (const [cat, tope] of Object.entries(r.topes)) {
    const usado = r.porCategoria.find((c) => c.categoria === cat)?.total ?? 0;
    if (usado > tope) {
      out.push({ id: `tope-${cat}`, nivel: 'alerta', titulo: `Te pasaste del tope de ${cat}`, texto: `Llevas ${pesos(usado)} y el tope del mes es ${pesos(tope)}.` });
    } else if (usado >= tope * 0.8 && r.esActual) {
      out.push({ id: `tope-${cat}`, nivel: 'aviso', titulo: `${cat}: vas en ${Math.round((usado / tope) * 100)} % del tope`, texto: `Te quedan ${pesos(tope - usado)} para lo que queda del mes.` });
    }
  }

  // --- Pagos pendientes ---
  if (r.pendientes.length && r.esActual) {
    const nombres = r.pendientes.slice(0, 4).map((p) => p.nombre).join(', ');
    const sobra = r.disponible + r.totalPendiente; // lo que hay antes de pagar lo pendiente
    out.push({
      id: 'pendientes', nivel: conBase && sobra < r.totalPendiente ? 'alerta' : 'aviso',
      titulo: `Aparta ${pesos(r.totalPendiente)} para lo que falta pagar`,
      texto: `Te falta: ${nombres}${r.pendientes.length > 4 ? ' y más' : ''}. Apenas te paguen, separa esa plata en otro bolsillo para que no se mezcle con la del día a día.`,
    });
  }

  // --- Gastos hormiga y suscripciones ---
  const hormigaTotal = (extra.hormiga ?? []).reduce((s, h) => s + h.total, 0);
  if (hormigaTotal >= 30_000) {
    const h = extra.hormiga![0];
    out.push({
      id: 'hormiga', nivel: 'idea', titulo: `Gastos hormiga: ${pesos(hormigaTotal)} este mes`,
      texto: `Solo en ${h.concepto.toLowerCase()} van ${h.veces} veces (${pesos(h.total)}). Son pequeños, pero juntos pesan.`,
    });
  }
  const subs = extra.suscripciones ?? [];
  if (subs.length >= 2) {
    const total = subs.reduce((s, x) => s + x.monto, 0);
    out.push({
      id: 'suscripciones', nivel: 'idea', titulo: `Tienes ${subs.length} pagos que se repiten (~${pesos(total)}/mes)`,
      texto: `${subs.slice(0, 4).map((x) => x.concepto).join(', ')}. Revisa si de verdad usas todos.`,
    });
  }

  // --- Metas ---
  for (const m of extra.metas ?? []) {
    if (!m.fechaMeta || m.ahorrado >= m.objetivo) continue;
    const meses = Math.max(1, Math.round((new Date(`${m.fechaMeta}T12:00:00`).getTime() - Date.now()) / (30.4 * 86_400_000)));
    const porMes = Math.ceil((m.objetivo - m.ahorrado) / meses / 1000) * 1000;
    if (r.esActual && m.aportadoMes < porMes) {
      out.push({
        id: `meta-${m.id}`, nivel: 'idea', titulo: `${m.nombre}: aparta ${pesos(porMes)} al mes`,
        texto: `Te faltan ${pesos(m.objetivo - m.ahorrado)} y quedan ${meses} ${meses === 1 ? 'mes' : 'meses'}. Este mes llevas ${pesos(m.aportadoMes)}.`,
      });
    }
  }

  // --- Categorías ---
  const top = r.porCategoria[0];
  if (top && r.variables >= 50_000 && top.total / r.variables >= 0.4 && top.categoria !== 'Otros' && top.categoria !== 'Ajuste') {
    const tope = Math.round((top.total * 0.8) / 1000) * 1000;
    out.push({
      id: 'categoria-top', nivel: 'idea', titulo: `${top.categoria} se lleva el ${Math.round((top.total / r.variables) * 100)} % de tus gastos`,
      texto: `Van ${pesos(top.total)} este mes. Ponle un tope para el próximo, por ejemplo ${pesos(tope)}, y decide el monto antes de gastar, no cuando llegue la cuenta.`,
    });
  }
  for (const c of r.porCategoria) {
    const ant = r.porCategoriaMesAnterior.find((x) => x.categoria === c.categoria)?.total ?? 0;
    if (ant >= 30_000 && c.total > ant * 1.3 && c.total - ant >= 20_000) {
      out.push({
        id: `sube-${c.categoria}`, nivel: 'aviso', titulo: `${c.categoria} subió frente al mes pasado`,
        texto: `Llevas ${pesos(c.total)} y el mes pasado fueron ${pesos(ant)} en total, y este mes todavía no termina.`,
      });
      break;
    }
  }

  // --- Deudas ---
  if (r.ingresos > 0 && r.cuotas + r.fijos > r.ingresos * 0.6) {
    out.push({
      id: 'carga', nivel: 'aviso', titulo: 'Tus compromisos fijos pesan mucho',
      texto: `Cuotas y gastos fijos suman ${pesos(r.cuotas + r.fijos)}, más del 60 % de lo que te entra. Evita nuevas deudas hasta terminar alguna.`,
    });
  }
  for (const d of activas) {
    const t = tasaMensual(d.tasa);
    if (t && d.cuota > 0 && d.cuota <= d.saldo * t) {
      out.push({
        id: `intereses-${d.id}`, nivel: 'alerta', titulo: `La cuota de ${d.nombre} no alcanza`,
        texto: `Con ${pesos(d.cuota)} al mes apenas cubres los intereses (≈${pesos(d.saldo * t)}); el saldo no baja. Súbele la cuota o abónale extra.`,
      });
    }
  }
  const conTasa = activas.map((d) => ({ d, t: tasaMensual(d.tasa) })).filter((x) => x.t !== null) as { d: Deuda; t: number }[];
  if (conTasa.length >= 2) {
    const masCara = [...conTasa].sort((a, b) => b.t - a.t)[0];
    if (activas[0] && masCara.d.id !== activas[0].id) {
      out.push({
        id: 'orden', nivel: 'idea', titulo: `Ataca primero ${masCara.d.nombre}`,
        texto: `Es la que más intereses cobra (${masCara.d.tasa}). Ponle prioridad 1 y manda allá cualquier plata extra: así pagas menos en total.`,
      });
    }
  }
  const primera = activas[0];
  if (primera && primera.cuota > 0) {
    const t = tasaMensual(primera.tasa);
    const meses = mesesParaPagar(primera.saldo, primera.cuota, t);
    if (Number.isFinite(meses) && meses > 0) {
      const extra = Math.max(20_000, Math.round(primera.cuota * 0.5 / 10_000) * 10_000);
      const conExtra = mesesParaPagar(primera.saldo, primera.cuota + extra, t);
      out.push({
        id: 'plan-deuda', nivel: 'idea', titulo: `${primera.nombre}: libre en ${meses} ${meses === 1 ? 'mes' : 'meses'}`,
        texto: `Pagando ${pesos(primera.cuota)} al mes terminas en ${mesDentroDe(meses)}.${conExtra < meses ? ` Con ${pesos(extra)} extra al mes, en ${conExtra} ${conExtra === 1 ? 'mes' : 'meses'}.` : ''}`,
      });
    }
  }
  // --- Cuánto se va en intereses y cuánto se ahorra abonando a capital ---
  let interesesTotal = 0;
  for (const d of activas) {
    const sim = simularPago(d.saldo, d.cuotaBase || d.cuota, tasaMensual(d.tasa));
    if (sim) interesesTotal += sim.intereses;
  }
  const objetivo = activas.map((d) => ({ d, r: tasaMensual(d.tasa) })).filter((x) => x.r).sort((a, b) => b.r! - a.r!)[0];
  if (objetivo && interesesTotal >= 50_000) {
    const cuota = objetivo.d.cuotaBase || objetivo.d.cuota;
    const extra = Math.max(20_000, Math.round((cuota * 0.5) / 10_000) * 10_000);
    const base = simularPago(objetivo.d.saldo, cuota, objetivo.r);
    const conExtra = simularPago(objetivo.d.saldo, cuota, objetivo.r, extra);
    if (base && conExtra && base.intereses - conExtra.intereses >= 10_000) {
      out.push({
        id: 'intereses', nivel: 'idea', titulo: `Si sigues igual pagarás ${pesos(interesesTotal)} en intereses`,
        texto: `Abonando ${pesos(extra)} extra al mes a capital de ${objetivo.d.nombre} te ahorras ${pesos(base.intereses - conExtra.intereses)} y terminas ${base.meses - conExtra.meses} meses antes.`,
      });
    }
  }

  const pagadas = deudas.filter((d) => d.saldo === 0 && d.cuota > 0);
  if (pagadas.length && activas.length) {
    const liberado = pagadas.reduce((s, d) => s + d.cuota, 0);
    out.push({
      id: 'bola-nieve', nivel: 'bien', titulo: `Liberaste ${pesos(liberado)} al mes`,
      texto: `Ya pagaste ${pagadas.map((d) => d.nombre).join(' y ')}. Suma esa cuota a ${activas[0].nombre} y la terminas mucho antes (método bola de nieve).`,
    });
  }
  if (!activas.length && deudas.length) {
    const fondo = (r.fijos || fijos.reduce((s, f) => s + f.monto, 0)) * 3;
    out.push({
      id: 'sin-deudas', nivel: 'bien', titulo: 'No tienes deudas',
      texto: fondo > 0
        ? `Buen momento para armar un fondo de emergencia: 3 meses de gastos fijos, unos ${pesos(fondo)}. Aparta una parte fija cada quincena.`
        : 'Buen momento para armar un fondo de emergencia. Aparta una parte fija cada quincena.',
    });
  }

  return out.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}

export type PlanDeudas = { meses: number; porDeuda: Record<number, number> } | null;

/**
 * Simula el pago mes a mes en el orden de prioridad (bola de nieve): cuando una deuda se termina,
 * su cuota se suma a la siguiente. Devuelve en cuántos meses quedas libre y el mes de cada deuda.
 * null si con las cuotas actuales alguna deuda nunca se termina.
 */
export function planDeudas(deudas: Deuda[]): PlanDeudas {
  const vivas = deudas
    .filter((d) => d.saldo > 0)
    .map((d) => ({ id: d.id, saldo: d.saldo, cuota: d.cuota, r: tasaMensual(d.tasa) ?? 0 }));
  if (!vivas.length) return { meses: 0, porDeuda: {} };
  const porDeuda: Record<number, number> = {};
  let liberado = 0;
  for (let mes = 1; mes <= 360; mes++) {
    let extra = liberado;
    for (const d of vivas) {
      if (d.saldo <= 0) continue;
      d.saldo += d.saldo * d.r;
      d.saldo -= d.cuota + extra;
      extra = 0;
      if (d.saldo <= 0) {
        extra = -d.saldo; // lo que sobró del pago pasa a la siguiente
        liberado += d.cuota;
        porDeuda[d.id] = mes;
        d.saldo = 0;
      }
    }
    if (vivas.every((d) => d.saldo <= 0)) return { meses: mes, porDeuda };
  }
  return null;
}

export { mesDentroDe };
