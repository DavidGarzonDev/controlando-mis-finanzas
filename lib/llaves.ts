import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { headers } from 'next/headers';
import { sql } from './db';

/**
 * Entrar con huella o Face ID (passkeys / WebAuthn).
 * La llave privada nunca sale del celular: aquí solo se guarda la llave pública de cada dispositivo.
 * La clave + código de Telegram siguen funcionando como respaldo.
 */

export type Llave = { id: string; nombre: string; creada: string; ultimoUso: string | null };

const n = (v: unknown) => Number(v) || 0;
const aB64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

/** El dominio y el origen de esta página (la llave queda atada a ellos). */
export async function sitio(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return { rpID: host.split(':')[0], origin: `${proto}://${host}` };
}

export async function llaves(): Promise<Llave[]> {
  const rows = await sql()`SELECT id, nombre, creada, ultimo_uso FROM llaves_acceso ORDER BY creada DESC`;
  return rows.map((r) => ({ id: String(r.id), nombre: String(r.nombre), creada: String(r.creada), ultimoUso: r.ultimo_uso ? String(r.ultimo_uso) : null }));
}

export async function borrarLlave(id: string) {
  await sql()`DELETE FROM llaves_acceso WHERE id = ${id}`;
}

/** Paso 1 para agregar una llave (ya dentro de Pilas). */
export async function opcionesRegistro() {
  const { rpID } = await sitio();
  const existentes = await sql()`SELECT id, transportes FROM llaves_acceso`;
  return generateRegistrationOptions({
    rpName: 'Pilas',
    rpID,
    userName: 'Pilas',
    userDisplayName: 'Tus finanzas',
    userID: new TextEncoder().encode('pilas-dueno'),
    attestationType: 'none',
    excludeCredentials: existentes.map((r) => ({ id: String(r.id), transports: r.transportes ? String(r.transportes).split(',') : undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
}

/** Paso 2: el celular firmó; se verifica y se guarda la llave pública. */
export async function guardarRegistro(respuesta: RegistrationResponseJSON, reto: string, nombre: string): Promise<boolean> {
  const { rpID, origin } = await sitio();
  const v = await verifyRegistrationResponse({
    response: respuesta, expectedChallenge: reto, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
  });
  if (!v.verified) return false;
  const c = v.registrationInfo.credential;
  await sql()`
    INSERT INTO llaves_acceso (id, llave_publica, contador, transportes, nombre)
    VALUES (${c.id}, ${aB64(c.publicKey)}, ${c.counter}, ${(c.transports ?? []).join(',') || null}, ${nombre.slice(0, 40) || 'Mi celular'})
    ON CONFLICT (id) DO NOTHING`;
  return true;
}

/** Paso 1 para entrar: el reto que el celular debe firmar con tu huella. */
export async function opcionesEntrada() {
  const { rpID } = await sitio();
  const existentes = await sql()`SELECT id, transportes FROM llaves_acceso`;
  if (!existentes.length) return null;
  return generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: existentes.map((r) => ({ id: String(r.id), transports: r.transportes ? String(r.transportes).split(',') : undefined })),
  });
}

/** Paso 2 para entrar: verifica la firma con la llave pública guardada. Devuelve el nombre del dispositivo. */
export async function verificarEntrada(respuesta: AuthenticationResponseJSON, reto: string): Promise<string | null> {
  const [fila] = await sql()`SELECT id, llave_publica, contador, transportes, nombre FROM llaves_acceso WHERE id = ${respuesta.id}`;
  if (!fila) return null;
  const { rpID, origin } = await sitio();
  const v = await verifyAuthenticationResponse({
    response: respuesta, expectedChallenge: reto, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: {
      id: String(fila.id), publicKey: deB64(String(fila.llave_publica)), counter: n(fila.contador),
      transports: fila.transportes ? String(fila.transportes).split(',') : undefined,
    },
  });
  if (!v.verified) return null;
  await sql()`UPDATE llaves_acceso SET contador = ${v.authenticationInfo.newCounter}, ultimo_uso = now() WHERE id = ${String(fila.id)}`;
  return String(fila.nombre);
}

export async function hayLlaves(): Promise<boolean> {
  const [r] = await sql()`SELECT COUNT(*) AS n FROM llaves_acceso`;
  return n(r?.n) > 0;
}
