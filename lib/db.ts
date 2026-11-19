import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';

let cliente: NeonQueryFunction<false, false> | null = null;

// Solo para desarrollo local (ver scripts/neon-local.mjs). En Vercel no se define.
if (process.env.NEON_LOCAL_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_LOCAL_ENDPOINT;

/** Conexión a Neon. Se crea la primera vez que se usa, no al compilar. */
export function sql() {
  if (!cliente) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Falta DATABASE_URL. Conecta Neon al proyecto en Vercel.');
    cliente = neon(url);
  }
  return cliente;
}
