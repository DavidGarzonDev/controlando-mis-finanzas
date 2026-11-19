'use server';

import { revalidatePath } from 'next/cache';
import * as db from '@/lib/datos';
import { normalizarCategoria } from '@/lib/categorias';

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const entero = (fd: FormData, k: string) => Math.max(0, Math.round(Number(String(fd.get(k) ?? '').replace(/[^\d]/g, '')) || 0));
const idDe = (fd: FormData) => Number(fd.get('id')) || null;

export async function guardarGasto(fd: FormData) {
  const datos = {
    concepto: texto(fd, 'concepto') || 'Gasto',
    monto: entero(fd, 'monto'),
    categoria: normalizarCategoria(texto(fd, 'categoria')) ?? 'Otros',
  };
  const id = idDe(fd);
  if (id) await db.actualizarGasto(id, datos);
  else await db.insertarGasto({ ...datos, origen: 'web' });
  revalidatePath('/');
}

export async function guardarIngreso(fd: FormData) {
  const datos = { concepto: texto(fd, 'concepto') || 'Ingreso', monto: entero(fd, 'monto') };
  const id = idDe(fd);
  if (id) await db.actualizarIngreso(id, datos);
  else await db.insertarIngreso(datos);
  revalidatePath('/');
}

export async function guardarDeuda(fd: FormData) {
  await db.guardarDeuda(idDe(fd), {
    nombre: texto(fd, 'nombre') || 'Deuda',
    saldo: entero(fd, 'saldo'),
    cuota: entero(fd, 'cuota'),
    tasa: texto(fd, 'tasa') || null,
    prioridad: entero(fd, 'prioridad') || 99,
  });
  revalidatePath('/');
}

export async function guardarFijo(fd: FormData) {
  await db.guardarFijo(idDe(fd), { concepto: texto(fd, 'concepto') || 'Gasto fijo', monto: entero(fd, 'monto') });
  revalidatePath('/');
}

export async function borrar(tipo: 'gasto' | 'ingreso' | 'deuda' | 'fijo', id: number) {
  if (tipo === 'gasto') await db.borrarGasto(id);
  if (tipo === 'ingreso') await db.borrarIngreso(id);
  if (tipo === 'deuda') await db.borrarDeuda(id);
  if (tipo === 'fijo') await db.borrarFijo(id);
  revalidatePath('/');
}
