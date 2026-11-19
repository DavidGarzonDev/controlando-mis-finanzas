'use server';

import { revalidatePath } from 'next/cache';
import * as db from '@/lib/datos';
import { asegurarEsquema } from '@/lib/esquema';
import { normalizarCategoria } from '@/lib/categorias';

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const entero = (fd: FormData, k: string) => Math.max(0, Math.round(Number(String(fd.get(k) ?? '').replace(/[^\d]/g, '')) || 0));
const idDe = (fd: FormData) => Number(fd.get('id')) || null;
/** Acabado ('negro', 'oro'…), color libre '#rrggbb' o null (colores del banco). */
const colorDe = (fd: FormData) => {
  const c = texto(fd, 'color');
  return /^[a-z]{3,12}$/.test(c) && c !== 'banco' ? c : /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
};
const ultimos4De = (fd: FormData) => texto(fd, 'ultimos4').replace(/\D/g, '').slice(-4) || null;

async function listo() {
  await asegurarEsquema();
}

export async function guardarGasto(fd: FormData) {
  await listo();
  const datos = {
    concepto: texto(fd, 'concepto') || 'Gasto',
    monto: entero(fd, 'monto'),
    categoria: texto(fd, 'categoria') === 'Ajuste' ? 'Ajuste' : normalizarCategoria(texto(fd, 'categoria')) ?? 'Otros',
  };
  const id = idDe(fd);
  if (id) await db.actualizarGasto(id, datos);
  else await db.insertarGasto({ ...datos, origen: 'web' });
  revalidatePath('/');
}

export async function guardarIngreso(fd: FormData) {
  await listo();
  const datos = { concepto: texto(fd, 'concepto') || 'Ingreso', monto: entero(fd, 'monto') };
  const id = idDe(fd);
  if (id) await db.actualizarIngreso(id, datos);
  else await db.insertarIngreso(datos);
  revalidatePath('/');
}

/** Cuadre: plata que aparece o desaparece sin que sepas en qué. Positivo = ingreso, negativo = gasto "Ajuste". */
export async function guardarAjuste(fd: FormData) {
  await listo();
  const monto = entero(fd, 'monto');
  if (!monto) return;
  const nota = texto(fd, 'nota');
  if (texto(fd, 'signo') === 'mas') {
    await db.insertarIngreso({ concepto: nota ? `Ajuste: ${nota}` : 'Ajuste', monto });
  } else {
    await db.insertarGasto({ concepto: nota || 'Ajuste sin explicar', monto, categoria: 'Ajuste', origen: 'web' });
  }
  revalidatePath('/');
}

export async function guardarDeuda(fd: FormData) {
  await listo();
  const tipo = (['tarjeta', 'prestamo', 'otro'].includes(texto(fd, 'tipo')) ? texto(fd, 'tipo') : 'prestamo') as db.TipoCredito;
  await db.guardarDeuda(idDe(fd), {
    nombre: texto(fd, 'nombre') || (tipo === 'tarjeta' ? 'Tarjeta' : 'Crédito'),
    tipo,
    cupo: tipo === 'tarjeta' ? entero(fd, 'cupo') || null : null,
    banco: texto(fd, 'banco') || null,
    franquicia: tipo === 'tarjeta' ? texto(fd, 'franquicia') || null : null,
    ultimos4: tipo === 'tarjeta' ? ultimos4De(fd) : null,
    color: tipo === 'tarjeta' ? colorDe(fd) : null,
    saldo: entero(fd, 'saldo'),
    cuota: entero(fd, 'cuota'),
    tasa: texto(fd, 'tasa') || null,
    prioridad: entero(fd, 'prioridad') || 99,
  });
  revalidatePath('/');
}

export async function guardarFijo(fd: FormData) {
  await listo();
  await db.guardarFijo(idDe(fd), { concepto: texto(fd, 'concepto') || 'Gasto fijo', monto: entero(fd, 'monto') });
  revalidatePath('/');
}

export async function registrarAbono(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) await db.abonarDeudaPorId(id, monto);
  revalidatePath('/');
}

export async function registrarCompra(fd: FormData) {
  await listo();
  const id = idDe(fd);
  const monto = entero(fd, 'monto');
  if (id && monto > 0) {
    await db.registrarCompraCredito(id, { concepto: texto(fd, 'concepto') || 'Compra', monto, cuotas: entero(fd, 'cuotas') || 1 });
  }
  revalidatePath('/');
}

export async function guardarCuenta(fd: FormData) {
  await listo();
  await db.guardarCuenta(idDe(fd), {
    nombre: texto(fd, 'nombre') || 'Cuenta',
    banco: texto(fd, 'banco') || null,
    saldo: entero(fd, 'saldo'),
    ultimos4: ultimos4De(fd),
    franquicia: texto(fd, 'franquicia') || null,
    color: colorDe(fd),
  });
  revalidatePath('/');
}

export async function marcarFijo(id: number, pagado: boolean) {
  await listo();
  await db.marcarFijo(id, pagado);
  revalidatePath('/');
}

export async function borrar(tipo: 'gasto' | 'ingreso' | 'deuda' | 'fijo' | 'cuenta', id: number) {
  await listo();
  if (tipo === 'gasto') await db.borrarGasto(id);
  if (tipo === 'ingreso') await db.borrarIngreso(id);
  if (tipo === 'deuda') await db.borrarDeuda(id);
  if (tipo === 'fijo') await db.borrarFijo(id);
  if (tipo === 'cuenta') await db.borrarCuenta(id);
  revalidatePath('/');
}
