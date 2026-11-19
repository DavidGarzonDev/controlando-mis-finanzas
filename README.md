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

1. En tu proyecto de Vercel → pestaña **Storage** → **Create Database** → **Neon** (plan gratis) → conéctala al proyecto. Vercel agrega `DATABASE_URL` solo.
2. Abre la base de datos en Neon → **SQL Editor**:
   - Pega y ejecuta todo el contenido de `db/schema.sql`.
   - (Opcional) Copia `db/seed.example.sql` como `db/seed.sql`, pon tus deudas y gastos fijos, y ejecútalo. O cárgalos después desde el dashboard. (`db/seed.sql` no se sube a GitHub.)
3. En Vercel → **Deployments** → los tres puntos del último → **Redeploy**, para que tome `DATABASE_URL`.

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

| Escribes | Qué pasa |
|---|---|
| `almuerzo 15 mil` / `gasolina 40k` / `tinto 2500` | Registra el gasto y te dice cuánto te queda |
| `almuerzo 15` | Lo entiende como $15.000 |
| `me pagaron 1.100.000` / `quincena 1100000` | Registra un ingreso |
| `/resumen` | Cómo vas este mes y en qué se va la plata |
| `/hoy` | Lo que gastaste hoy |
| `/deudas` | Deudas en orden de ataque |
| `/abono nequi 50000` | Le resta el abono al saldo de Nequi |
| `/cat Salidas` | Corrige la categoría del último gasto y aprende la palabra |
| `/borrar` | Borra el último gasto (si te equivocaste) |

Cuando la IA interpretó el mensaje, la respuesta lleva un 🤖.

**Dashboard:** abre `https://TU-APP.vercel.app`, usuario cualquiera y tu `DASHBOARD_PASSWORD`. Desde ahí editas todo con ventanas (modales).

Tip: en el celular, abre el dashboard en Chrome → menú → *Agregar a pantalla principal* y queda como una app.

## Probar en tu computador (opcional)

```bash
cp .env.example .env.local   # y llena DATABASE_URL y DASHBOARD_PASSWORD
npm install
npm run dev                  # http://localhost:3000
```

## Estructura

```
app/api/telegram/route.ts  → recibe los mensajes de Telegram
lib/parser.ts              → intérprete hecho a mano (montos y categorías)
lib/gemini.ts              → respaldo con IA
lib/bot.ts                 → comandos y respuestas del bot
lib/datos.ts               → consultas a la base de datos
components/App.tsx         → el dashboard (pestañas y modales)
middleware.ts              → contraseña del dashboard
db/schema.sql              → tablas
db/seed.example.sql        → datos de ejemplo (plantilla)
```

## Si algo no funciona

- **El bot no responde:** abre `https://api.telegram.org/botTU_TOKEN/getWebhookInfo` y mira `last_error_message`. En Vercel → Logs ves los errores del servidor.
- **"Falta DATABASE_URL":** conecta Neon (paso 5) y haz Redeploy.
- **El bot dice que la IA llegó a su límite:** el plan gratis de Gemini se reinicia cada día. Mientras tanto, escribe los gastos con monto claro (`almuerzo 15000`) y se registran igual.
