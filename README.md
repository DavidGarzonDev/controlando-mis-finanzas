# Pilas — bot de Telegram + dashboard para tus finanzas

Escribes tus gastos en Telegram (`almuerzo 15 mil`) y los ves en un dashboard web.

Un intérprete hecho a mano entiende casi todos los mensajes. La inteligencia artificial solo se usa cuando no entiende alguno, para notas de voz y fotos de recibos, y para responder preguntas. **Tú eliges cuál** (Gemini, Claude, OpenAI, Groq, OpenRouter o DeepSeek) con **tu propia clave**.

Proyecto abierto y **gratis**: cualquiera puede montar su propia versión siguiendo los pasos de abajo. Cada quien usa su propio bot, su base de datos y sus claves; nada se comparte entre personas y nadie más ve tus datos.

**Stack:** Next.js en Vercel · Postgres en Neon (plan gratis) · Telegram Bot API · la IA que quieras (Gemini tiene plan gratis).

**¿Cuánto cuesta?** Nada, si usas los planes gratis: Vercel Hobby, Neon Free, Telegram y Gemini (tiene un límite diario de uso gratis). Una persona usa una fracción muy pequeña de esos límites.

[![Desplegar en Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDavidGarzonDev%2Fcontrolando-mis-finanzas&project-name=pilas&repository-name=pilas&env=TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,DASHBOARD_PASSWORD,CRON_SECRET&envDescription=Token%20del%20bot%2C%20un%20secreto%20para%20el%20webhook%2C%20tu%20contrase%C3%B1a%20y%20un%20secreto%20para%20los%20recordatorios&envLink=https%3A%2F%2Fgithub.com%2FDavidGarzonDev%2Fcontrolando-mis-finanzas%23paso-4--desplegar-en-vercel)

El botón copia el proyecto a tu GitHub y lo despliega en tu Vercel. Igual sigue los pasos 1, 2, 5 y 6.

## ❤️ Apoya el proyecto

Pilas es gratis. Si te sirve, puedes invitarme un tinto: los enlaces están en la app (**Plan → Apoya Pilas**) y en el botón **Sponsor** del repositorio. Una ⭐ en GitHub también ayuda.

---

## Paso 1 — Crear el bot en Telegram (2 min)

1. En Telegram, abre **@BotFather** y envía `/newbot`.
2. Dale un nombre (ej. *Mis Finanzas*) y un usuario que termine en `bot` (ej. `finanzas_tunombre_bot`).
3. Copia el **token** que te da (algo como `123456:ABC-...`). Es tu `TELEGRAM_BOT_TOKEN`. No lo compartas.

## Paso 2 — La inteligencia artificial (opcional, recomendada)

Sin IA el bot funciona igual con su intérprete propio; con IA entiende mensajes raros, notas de voz, fotos de recibos y preguntas. Cada persona usa **su propia clave**, así que a nadie le cuesta lo de los demás.

| Proveedor | Variable de la clave | Modelo por defecto | Notas de voz | Precio |
|---|---|---|---|---|
| **Gemini** (Google AI Studio) | `GEMINI_API_KEY` | `gemini-3.1-flash-lite` | Sí | **Plan gratis** (recomendado) |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-opus-5-5` | No | De pago (pon `IA_MODELO=claude-haiku-5-5` para gastar menos) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4.1-mini` | Sí | De pago |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Sí | Tiene plan gratis |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` | No | Tiene modelos gratis |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` | No | De pago, barato |
| Otro compatible con OpenAI | `IA_API_KEY` + `IA_BASE_URL` | el que pongas en `IA_MODELO` | No | — |

- Basta con poner **una** de esas claves en Vercel; Pilas usa la primera que encuentre (en ese orden).
- Para elegir uno a la fuerza: `IA_PROVEEDOR` = `gemini`, `claude`, `openai`, `groq`, `openrouter`, `deepseek` o `compatible`. Para otro modelo: `IA_MODELO`.
- En la app, **Plan → Conexiones y seguridad → Inteligencia artificial** te dice cuál está activa y tiene un botón para **probarla**.

Para Gemini gratis: en Google AI Studio → **Claves de API** → *Crear clave de API* y copia la clave. Es tu `GEMINI_API_KEY`.

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
   | `GEMINI_API_KEY` | tu clave de Gemini (o la de otro proveedor, paso 2) |
   | `DASHBOARD_PASSWORD` | la contraseña para abrir tu dashboard |
   | `CRON_SECRET` | otra clave inventada (mínimo 16 caracteres), para los recordatorios diarios por Telegram |

3. Dale **Deploy**. Anota la URL (ej. `https://mis-finanzas-tunombre.vercel.app`).

## Paso 5 — Crear la base de datos (Neon)

1. En tu proyecto de Vercel → pestaña **Storage** → **Create Database** → **Neon** (plan gratis) → conéctala al proyecto.
   - En **Custom Environment Variable Prefix** escribe `DATABASE` (así la variable queda como `DATABASE_URL`).
   - Deja sin marcar *Create Database Branch*.
2. En Vercel → **Deployments** → los tres puntos del último → **Redeploy**, para que tome `DATABASE_URL`.
3. Listo: **la app crea las tablas sola** la primera vez que abres el dashboard o le escribes al bot (y las actualiza cuando hay versiones nuevas). Si prefieres, también puedes pegar `db/schema.sql` en el **SQL Editor** de Neon.
4. (Opcional) Copia `db/seed.example.sql` como `db/seed.sql`, pon tus deudas y gastos fijos, y ejecútalo en el SQL Editor. O cárgalos desde el dashboard. (`db/seed.sql` no se sube a GitHub.)

## Paso 6 — Conectar Telegram (desde la app, 1 minuto)

1. Abre `https://TU-APP.vercel.app`. La primera vez aparece **Configuremos tu Pilas**:
   - revisa que las variables estén bien (te dice cuál falta y cómo arreglarla),
   - escribe tu `DASHBOARD_PASSWORD` y toca **Conectar con Telegram** (conecta el bot con tu app solo),
   - toca **Abrir Telegram y mandarlo**: le envía a tu bot `/start` con un código de 4 números.
2. Listo: ese chat queda como el dueño y ya puedes entrar con tu clave + el código que te llega a Telegram.

No hay que copiar el chat ID ni volver a desplegar. (Si prefieres hacerlo a mano como antes, la variable `TELEGRAM_CHAT_ID` sigue funcionando y tiene prioridad.)

Solo tu chat puede registrar gastos. Si alguien más encuentra el bot, no puede hacer nada.

---

## Cómo se usa

### Gastos e ingresos

| Escribes | Qué pasa |
|---|---|
| `almuerzo 15 mil` / `gasolina 40k` / `tinto 2500` | Registra el gasto y te dice cuánto te queda hoy |
| `almuerzo 15` | Lo entiende como $15.000 |
| `le di 700 a los que cuidan la moto` | Entre 100 y 999 sin unidad decide con sentido común ($700 si es de monedas o si no te alcanza para $700.000) y te deja corregir con un botón |
| `cancela` / `me equivoqué` / `/borrar` | Borra el último movimiento y devuelve la plata a su cuenta |
| `me pagaron 1.100.000` / `quincena 1100000` | Registra un ingreso |
| `tengo 300 mil en efectivo` / `me mandaron 50 mil` / `vendí la bici 200 mil` | También son ingresos, vengan de donde vengan |
| `/ajuste -20000 no sé en qué` / `/ajuste +5000` | Cuadra la plata cuando lo registrado no coincide con lo real |
| `/hoy` | Cuánto puedes gastar hoy y lo que llevas |
| `/intereses` | Cuánto pagarás en intereses si sigues igual, y cuánto te ahorras abonando a capital |
| `/resumen` | Cómo vas este mes y en qué se va la plata |
| `/consejos` | Recomendaciones con tus números (sin IA) |
| `/cat Salidas` | Corrige la categoría del último gasto y aprende la palabra |

### Cuentas, efectivo y transferencias

| Escribes | Qué pasa |
|---|---|
| `almuerzo 15 mil con nequi` / `tinto 3000 en efectivo` | El gasto sale de esa cuenta (el saldo se ajusta solo) |
| `me pagaron 1.100.000 a bancolombia` / `me mandó 40 mil mi mamá por nequi` | El ingreso entra a esa cuenta |
| `retiré 100 mil de nequi` / `consigné 50 mil en bancolombia` | Pasa plata entre la cuenta y tu efectivo |
| `pasé 100 mil de bancolombia a nequi` | Transferencia entre tus cuentas (no es gasto) |
| `le mandé 50 mil a juan por nequi y me dio efectivo` | Cambio: de Nequi a tu efectivo |
| `le mandé 50 mil a mi mamá por llave desde bancolombia` | Envío a otra persona (gasto) |
| `/saldo nequi 250000` / `/saldo` | Corrige el saldo de una cuenta / ver todas |

La primera vez que mencionas el efectivo, se crea solo. Si escribes un gasto o ingreso **sin decir la cuenta** y tienes varias, el bot te pregunta con botones (**¿De dónde salió?** · Nu · Efectivo · Nequi…): un toque y el saldo queda al día. Si prefieres que nunca pregunte, marca una cuenta como **principal** (Billetera → la cuenta → "Cuenta principal") y se usa esa.

**¿Cómo se calcula "libre"?** Si tienes cuentas registradas: lo que tienes en cuentas y efectivo, menos lo que te falta pagar este mes (cuotas y fijos sin marcar), menos lo apartado en metas. "Hoy puedes gastar" es eso dividido entre los días que faltan para tu próximo pago. Sin cuentas registradas, se usa el balance del mes (ingresos menos cuotas, fijos y gastos).

### Tarjetas y créditos

| Escribes | Qué pasa |
|---|---|
| `hice compra con tarjeta de crédito AV Villas por 120 mil` | Suma la compra a esa tarjeta y te dice el cupo disponible |
| `compré tenis con la Nu 250 mil a 6 cuotas` | Igual, diferida a 6 cuotas (sube la cuota mensual) |
| `pagué la cuota de la AV Villas con bancolombia` | Paga lo que falta de la cuota del mes, desde esa cuenta |
| `ya pagué la cuota de la Nu` | Si la pagaste en el banco y el saldo ya está al día: solo la marca como pagada (no mueve saldos) |
| `abono a capital nu 200 mil` / `/capital nu 200000` | Abono extra a capital (baja la deuda y los intereses) |
| `pagué 200 mil a la Nu` / `/abono addi 50000` | Abono a una tarjeta o crédito |
| `/tarjetas` / `/deudas` | Cupo de cada tarjeta / créditos en orden de ataque |
| `/pendientes` / `/pague gimnasio` | Lo que falta pagar este mes / marcar un fijo como pagado |

Las compras con tarjeta **no** se restan de tu plata del mes: esa plata sale cuando pagas la cuota. Desde el próximo extracto se suman solas a la cuota (una compra a 6 cuotas suma monto/6 durante 6 meses); la "cuota fija" de la tarjeta no cambia.

### Metas, topes y alertas

| Escribes | Qué pasa |
|---|---|
| `aparté 100 mil para el viaje` / `/ahorro viaje 100000` | Aporte a una meta de ahorro |
| `/metas` | Cómo vas con cada meta |
| `/tope salidas 150000` / `/topes` | Tope mensual por categoría; te aviso al llegar al 80 % |
| `/suscripciones` / `/hormiga` | Pagos que se repiten / gastos pequeños que se acumulan |
| `/retos` / `/reto domicilios` | Retos: semana sin domicilios, semana sin salidas, 7 días sin pasarte del límite, 3 días sin gastar. El bot te avisa si se rompe o si lo logras |
| `/categorias` / `/categoria Mascotas 🐶` | Ver tus categorías y crear las tuyas con emoji (`/categoria borrar Mascotas` para quitarla) |
| `/semana` | Resumen de los últimos 7 días con imagen (llega solo cada domingo) |
| `/menu` | Botones fijos abajo del chat: Hoy, Resumen, Por pagar, Metas, Tarjetas, Deshacer |

**Botones bajo cada gasto:** *Categoría*, *Cuenta* y *Deshacer*. Corriges con un toque, sin comandos.

**Notas de voz y fotos:** mándale al bot una nota de voz ("almuerzo quince mil y gasolina cuarenta") o la foto de un recibo, y Gemini la convierte en texto.

**Recordatorios:** cada mañana (7:30 a. m.) el bot te escribe si hay pagos que vencen hoy o mañana, fecha de corte de una tarjeta, o si es día de quincena (cuánto apartar y para qué). Necesita `CRON_SECRET` en Vercel. Ponles **día de pago** a tus fijos y créditos para que funcione.

### El dashboard

Abre `https://TU-APP.vercel.app`: escribe tu `DASHBOARD_PASSWORD` y luego el **código de 6 dígitos** que te llega al Telegram (vence en 5 minutos).

**Conexiones (Plan → Conexiones y seguridad)**
- **Inteligencia artificial:** cuál está activa (proveedor y modelo) y un botón para probarla.
- **Huella o Face ID (passkeys):** actívalo en cada dispositivo; la clave + código de Telegram quedan de respaldo.
- **Notificaciones de la app:** recordatorio diario, resumen del domingo y alertas. Las llaves se crean solas (no hay que configurar nada). En iPhone, con la app instalada en la pantalla de inicio.

**Préstamos a personas ("Te deben"):** escríbele al bot `le presté 30 mil a juan por nequi`: la plata sale de la cuenta pero **no cuenta como gasto**, queda en *Billetera → Te deben*. Cuando te pague: `me devolvió juan 10 mil` (puede ser por partes) y vuelve a la cuenta sin contar como ingreso. `/prestamos` o *quién me debe* para ver la lista. Si ya lo habías anotado como gasto, toca **Es préstamo** en el bot o en la ventana del gasto.

**Se actualiza solo:** con el dashboard abierto, lo que registres desde Telegram aparece en unos segundos sin recargar.

**Pegar notificaciones del banco:** copia la notificación o el SMS de Nequi, Bancolombia, Nu, Daviplata, Davivienda, AV Villas… y pégalo en el chat del bot. Lo registra solo (comercio, monto y cuenta por los últimos 4 dígitos o el banco; con tarjeta de crédito va a la tarjeta) y no registra dos veces lo mismo.

**Alertas inteligentes:** al registrar un gasto, Pilas avisa si se parece a uno de hace pocos minutos (¿duplicado?), si es mucho más alto de lo normal en esa categoría, o si una suscripción subió de precio.

**Pregúntale a Pilas:** escríbele al bot (o en la paleta Ctrl+K) preguntas como *¿cuánto gasté en gasolina este mes?* o *¿en qué se me fue la plata esta quincena?* y responde con tus cifras (usa la IA que configuraste).

**Tu año en Pilas:** el resumen del año en historias (en diciembre y enero aparece en el Resumen; siempre desde la paleta Ctrl+K).

**Seguridad del acceso**
- Clave + código por Telegram: aunque alguien sepa tu clave, sin tu Telegram no entra.
- 5 intentos fallidos (clave o código) desde una conexión → bloqueada 15 minutos. 15 fallidos en una hora desde cualquier lado → nadie entra durante 1 hora.
- Te llega un aviso por Telegram en cada inicio de sesión y en cada bloqueo.
- Desde el bot: `/sesiones` (dónde tienes sesión abierta), `/cerrarsesiones` (saca a todos) y `/desbloquear` (si te bloqueaste tú).
- La sesión dura 12 horas, o 30 días si marcas *Recordar este dispositivo*. Las cookies van firmadas y la sesión se revisa en la base en cada acción, así que `/cerrarsesiones` corta el acceso al instante.
- Opcional: `AUTH_SECRET` (32+ caracteres aleatorios) para firmar las sesiones; si no está, se deriva de tus otros secretos.

- **Resumen:** cuánto puedes gastar hoy hasta tu próximo pago (15 y 30 por defecto; cámbialo con `DIAS_DE_PAGO`), cómo va el mes contra el ritmo que te alcanza, en qué se va la plata comparado con el mes pasado, calendario de gasto por día, recomendaciones y lo que falta pagar.
- **Movimientos:** todo lo del mes (gastos, ingresos y movimientos entre cuentas), con búsqueda, filtros y descarga a Excel.
- **Billetera:** tu patrimonio en el tiempo; cuentas, débito y efectivo (con botones para mover, retirar y consignar); tarjetas de crédito con cupo, fechas de corte y pago, e intereses estimados; y préstamos con la fecha en que quedas libre.
- **Plan:** metas de ahorro, topes por categoría y gastos fijos con su día de pago.
- Arriba a la izquierda, las flechas ‹ › te dejan ver **cualquier mes anterior**.
- Se puede **instalar como app** en el celular (Chrome → menú → *Agregar a pantalla principal*).

Funciona en modo claro y oscuro: el botón del sol/luna arriba alterna entre automático, claro y oscuro. Al crear una tarjeta (débito o crédito) eliges el banco, la franquicia y el color, y la ves en vivo mientras la configuras. Tip: en el celular, abre el dashboard en Chrome → menú → *Agregar a pantalla principal* y queda como una app.

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
lib/ia.ts                  → la IA que elijas (lib/ia/: gemini, claude, openai y compatibles)
lib/proyecto.ts            → nombre del proyecto y enlaces de donación
lib/bot.ts                 → comandos y respuestas del bot
lib/datos.ts               → consultas a la base de datos y cálculo del resumen
lib/consejos.ts            → recomendaciones y plan de pago de deudas (bola de nieve)
lib/bancos.ts              → bancos y billeteras de Colombia (colores de las tarjetas)
lib/esquema.ts             → crea y actualiza las tablas solas
lib/recordatorios.ts       → el mensaje diario (app/api/cron, programado en vercel.json)
app/api/exportar/route.ts  → descarga de movimientos en CSV para Excel
components/Plan.tsx        → metas, topes y gastos fijos
components/App.tsx         → el dashboard (pestañas)
components/Creditos.tsx    → la billetera: cuentas, tarjetas y préstamos
components/graficas.tsx    → gráficas (SVG propio, sin librerías)
components/Modal.tsx       → ventanas para registrar y editar
middleware.ts              → sin sesión firmada no se ve nada (redirige a /entrar)
lib/acceso.ts              → clave + código por Telegram, bloqueos y sesiones
db/schema.sql              → tablas (referencia)
db/seed.example.sql        → datos de ejemplo (plantilla)
```

## Si algo no funciona

- **El bot no responde:** abre `https://api.telegram.org/botTU_TOKEN/getWebhookInfo` y mira `last_error_message`. En Vercel → Logs ves los errores del servidor.
- **"Falta DATABASE_URL":** conecta Neon (paso 5) y haz Redeploy.
- **El bot dice que la IA llegó a su límite:** los planes gratis (como el de Gemini) se reinician cada día. Mientras tanto, escribe los gastos con monto claro (`almuerzo 15000`) y se registran igual.

## Licencia

Pilas es **software libre** bajo la licencia **[GNU AGPL-3.0](LICENSE)** · © 2026 [DavidGarzonDev](https://github.com/DavidGarzonDev).

En pocas palabras: puedes usarla gratis, instalarla, estudiarla y modificarla. Si la modificas y la ofreces a otras personas (incluso como página web o servicio), tienes que publicar tu código con la misma licencia y dar el crédito. Así nadie puede cerrarla ni venderla como si fuera suya.
