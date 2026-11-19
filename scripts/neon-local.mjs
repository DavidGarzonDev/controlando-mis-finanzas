// Servidor local que imita la API HTTP de Neon sobre un Postgres normal.
// Sirve para probar la app en tu computador sin crear una base en Neon.
//
//   LOCAL_PG_URL=postgresql://postgres@localhost:5432/postgres node scripts/neon-local.mjs
//
// y en .env.local:
//   DATABASE_URL=postgresql://postgres@localhost:5432/postgres
//   NEON_LOCAL_ENDPOINT=http://localhost:4444/sql
import http from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.NEON_LOCAL_PORT || 4444);
const pool = new pg.Pool({ connectionString: process.env.LOCAL_PG_URL || 'postgresql://postgres@localhost:5432/postgres' });
// Devuelve todo como texto: el driver de Neon convierte los tipos por su cuenta.
const crudo = { getTypeParser: () => (v) => v };

async function ejecutar(cliente, { query, params = [] }) {
  const r = await cliente.query({ text: query, values: params, rowMode: 'array', types: crudo });
  return {
    command: r.command,
    rowCount: r.rowCount,
    rows: r.rows,
    fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rowAsArray: true,
  };
}

http
  .createServer(async (req, res) => {
    let cuerpo = '';
    for await (const parte of req) cuerpo += parte;
    const cliente = await pool.connect();
    try {
      const datos = JSON.parse(cuerpo || '{}');
      let salida;
      if (Array.isArray(datos.queries)) {
        await cliente.query('BEGIN');
        const results = [];
        for (const q of datos.queries) results.push(await ejecutar(cliente, q));
        await cliente.query('COMMIT');
        salida = { results };
      } else {
        salida = await ejecutar(cliente, datos);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(salida));
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: e.message, code: e.code }));
    } finally {
      cliente.release();
    }
  })
  .listen(PORT, () => console.log(`Neon local escuchando en http://localhost:${PORT}/sql`));
