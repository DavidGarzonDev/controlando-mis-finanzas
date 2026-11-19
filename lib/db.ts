import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cliente: NeonQueryFunction<false, false> | null = null;

/** Conexión a Neon. Se crea la primera vez que se usa, no al compilar. */
export function sql() {
  if (!cliente) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Falta DATABASE_URL. Conecta Neon al proyecto en Vercel.');
    cliente = neon(url);
  }
  return cliente;
}

/** Filtro SQL: "este mes" en hora de Colombia. */
export const ZONA = 'America/Bogota';
