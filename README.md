# Mis Finanzas — bot de Telegram + dashboard

Escribes tus gastos en Telegram (`almuerzo 15 mil`) y los ves en un dashboard web.

Un intérprete hecho a mano entiende casi todos los mensajes. Gemini solo se usa cuando no entiende alguno o no sabe la categoría.

Proyecto abierto: cualquiera puede clonarlo y montar su propia versión siguiendo los pasos de abajo. Cada quien usa su propio bot, su base de datos y sus claves; nada se comparte.

**Stack:** Next.js en Vercel · Postgres en Neon (plan gratis) · Telegram Bot API · Gemini Flash-Lite (plan gratis).

---

## Paso 1 — Crear el bot en Telegram (2 min)

1. En Telegram, abre **@BotFather** y envía `/newbot`.
2. Dale un nombre (ej. *Mis Finanzas*) y un usuario que termine en `bot` (ej. `finanzas_tunombre_bot`).
3. Copia el **token** que te da (algo como `123456:ABC-...`). Es tu `TELEGRAM_BOT_TOKEN`. No lo compartas.

## Paso 2 — Clave de Gemini

1. En Google AI Studio → **Proyectos**, crea un proyecto nuevo (ej. *bot-finanzas*).
2. En **Claves de API** → *Crear clave de API*, elígelo y copia la clave. Es tu `GEMINI_API_KEY`.

## Paso 3 — Subir el código a GitHub

1. Haz un fork de este repositorio, o crea uno tuyo en GitHub (ej. `mis-finanzas`) y sube esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/mis-finanzas.git
   git push -u origin main
   ```

## Paso 4 — Desplegar en Vercel

1. En vercel.com → **Add New → Project** → importa el repositorio.
2. Antes de desplegar, abre **Environment Variables** y agrega:

   | Variable | Valor |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | el token de BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | una clave inventada por ti, solo letras, números, `_` y `-` (ej. `finanzas_9x2k7q`) |
   | `TELEGRAM_CHAT_ID` | déjalo vacío por ahora (paso 7) |
   | `GEMINI_API_KEY` | tu clave de Gemini |
   | `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
   | `DASHBOARD_PASSWORD` | la contraseña para abrir tu dashboard |

3. Dale **Deploy**. Anota la URL (ej. `https://mis-finanzas-tunombre.vercel.app`).

## Paso 5 — Crear la base de datos (Neon)

1. En tu proyecto de Vercel → pestaña **Storage** → **Create Database** → **Neon** (plan gratis) → conéctala al proyecto.
   - En **Custom Environment Variable Prefix** escribe `DATABASE` (así la variable queda como `DATABASE_URL`).
   - Deja sin marcar *Create Database Branch*.
2. En Vercel → **Deployments** → los tres puntos del último → **Redeploy**, para que tome `DATABASE_URL`.
3. Listo: **la app crea las tablas sola** la primera vez que abres el dashboard o le escribes al bot (y las actualiza cuando hay versiones nuevas). Si prefieres, también puedes pegar `db/schema.sql` en el **SQL Editor** de Neon.
4. (Opcional) Copia `db/seed.example.sql` como `db/seed.sql`, pon tus deudas y gastos fijos, y ejecútalo en el SQL Editor. O cárgalos desde el dashboard. (`db/seed.sql` no se sube a GitHub.)

## Paso 6 — Conectar Telegram con tu app (webhook)

Abre esta URL en el navegador, reemplazando los tres valores:

```
https://api.telegram.org/botTU_TOKEN/setWebhook?url=https://TU-APP.vercel.app/api/telegram&secret_token=TU_WEBHOOK_SECRET&allowed_updates=["message"]
```

Debe responder `"ok":true` y `"Webhook was set"`.

## Paso 7 — Decirle al bot que eres tú

1. Escríbele `/start` a tu bot. Te responde con tu **chat ID**.
2. En Vercel → Settings → Environment Variables → pon ese número en `TELEGRAM_CHAT_ID`.
3. **Redeploy** otra vez.
4. Escríbele `/start` de nuevo: ahora te muestra la ayuda. ¡Listo!

Solo tu chat ID puede registrar gastos. Si alguien más encuentra el bot, no puede hacer nada.

---

## Cómo se usa

### Gastos e ingresos

| Escribes | Qué pasa |
|---|---|
| `almuerzo 15 mil` / `gasolina 40k` / `tinto 2500` | Registra el gasto y te dice cuánto te queda hoy |
| `almuerzo 15` | Lo entiende como $15.000 |
| `me pagaron 1.100.000` / `quincena 1100000` | Registra un ingreso |
| `tengo 300 mil en efectivo` / `me mandaron 50 mil` / `vendí la bici 200 mil` | También son ingresos, vengan de donde vengan |
| `/ajuste -20000 no sé en qué` / `/ajuste +5000` | Cuadra la plata cuando lo registrado no coincide con lo real |
| `/hoy` | Cuánto puedes gastar hoy y lo que llevas |
| `/resumen` | Cómo vas este mes y en qué se va la plata |
| `/consejos` | Recomendaciones con tus números (sin IA) |
| `/cat Salidas` | Corrige la categoría del último gasto y aprende la palabra |
| `/borrar` | Borra el último gasto (si te equivocaste) |

### Tarjetas, créditos y cuentas

| Escribes | Qué pasa |
|---|---|
| `hice compra con tarjeta de crédito AV Villas por 120 mil` | Suma la compra a esa tarjeta y te dice el cupo disponible |
| `compré tenis con la Nu 250 mil a 6 cuotas` | Igual, diferida a 6 cuotas (sube la cuota mensual) |
| `pagué la cuota de la AV Villas` | Paga lo que falta de la cuota de este mes |
| `pagué 200 mil a la Nu` / `/abono addi 50000` | Abono a una tarjeta o crédito |
| `/tarjetas` | Cupo disponible y usado de cada tarjeta |
| `/deudas` | Todos tus créditos en orden de ataque |
| `/pendientes` / `/pague gimnasio` | Lo que falta pagar este mes / marcar un gasto fijo como pagado |
| `/saldo nequi 250000` / `/saldo` | Actualiza el saldo de una cuenta / ver todas |

Las compras con tarjeta **no** se restan de tu plata del mes: esa plata sale cuando pagas la cuota.

Cuando la IA interpretó el mensaje, la respuesta lleva un 🤖.

### El dashboard

Abre `https://TU-APP.vercel.app`, usuario cualquiera y tu `DASHBOARD_PASSWORD`.

- **Resumen:** cuánto puedes gastar hoy hasta tu próximo pago (15 y 30 por defecto; cámbialo con `DIAS_DE_PAGO`), cómo va el mes contra el ritmo que te alcanza, en qué se va la plata comparado con el mes pasado, calendario de gasto por día, recomendaciones y lo que falta pagar.
- **Movimientos:** todo lo del mes, filtrable por gastos, ingresos o categoría.
- **Billetera:** tus cuentas débito y billeteras (Nequi, Daviplata…), tus tarjetas de crédito con cupo disponible y usado, y tus préstamos con la fecha en que quedas libre.
- **Fijos:** lo que pagas cada mes, para marcarlo cuando lo pagues.

Funciona en modo claro y oscuro. Tip: en el celular, abre el dashboard en Chrome → menú → *Agregar a pantalla principal* y queda como una app.

## Probar en tu computador (opcional)

Con una base de Neon (la misma de Vercel o una nueva):

```bash
cp .env.example .env.local   # y llena DATABASE_URL y DASHBOARD_PASSWORD
npm install
npm run dev                  # http://localhost:3000
```

Sin Neon, con un Postgres normal en tu computador: `scripts/neon-local.mjs` imita la API de Neon.

```bash
LOCAL_PG_URL=postgresql://postgres@localhost:5432/postgres node scripts/neon-local.mjs
```

y en `.env.local`: `DATABASE_URL=postgresql://postgres@localhost:5432/postgres` y `NEON_LOCAL_ENDPOINT=http://localhost:4444/sql`.

## Estructura

```
app/api/telegram/route.ts  → recibe los mensajes de Telegram
lib/parser.ts              → intérprete hecho a mano (montos y categorías)
lib/gemini.ts              → respaldo con IA
lib/bot.ts                 → comandos y respuestas del bot
lib/datos.ts               → consultas a la base de datos y cálculo del resumen
lib/consejos.ts            → recomendaciones y plan de pago de deudas (bola de nieve)
lib/bancos.ts              → bancos y billeteras de Colombia (colores de las tarjetas)
lib/esquema.ts             → crea y actualiza las tablas solas
components/App.tsx         → el dashboard (pestañas)
components/Creditos.tsx    → la billetera: cuentas, tarjetas y préstamos
components/graficas.tsx    → gráficas (SVG propio, sin librerías)
components/Modal.tsx       → ventanas para registrar y editar
middleware.ts              → contraseña del dashboard
db/schema.sql              → tablas (referencia)
db/seed.example.sql        → datos de ejemplo (plantilla)
```

## Si algo no funciona

- **El bot no responde:** abre `https://api.telegram.org/botTU_TOKEN/getWebhookInfo` y mira `last_error_message`. En Vercel → Logs ves los errores del servidor.
- **"Falta DATABASE_URL":** conecta Neon (paso 5) y haz Redeploy.
- **El bot dice que la IA llegó a su límite:** el plan gratis de Gemini se reinicia cada día. Mientras tanto, escribe los gastos con monto claro (`almuerzo 15000`) y se registran igual.
