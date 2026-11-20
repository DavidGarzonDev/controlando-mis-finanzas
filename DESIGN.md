# Diseño — Pilas

**Idea:** una libreta de cuentas colombiana. Papel, tinta azul de esfero para lo tuyo y tinta roja para lo que se pasa. Lo primero que ves responde una sola pregunta: *¿cuánto puedo gastar hoy?*

## Color (tokens en `app/globals.css`, claro y oscuro con `light-dark()`)

| Rol | Uso |
|---|---|
| `--azul` | Acción principal, el medidor del día, la línea de lo gastado |
| `--rojo` | Te pasaste: medidor, alertas, deuda que va primero |
| `--verde` / `--ambar` | Bien / atención (siempre con icono y texto, nunca solo color) |
| `--s1…--s7`, `--s-otros` | Una por categoría, en orden fijo (paleta validada para daltonismo) |
| `--q0…--q5` | Calendario: un solo tono de claro a oscuro |
| `--co-amarillo/azul/rojo` | Solo la franja y el sello de la bandera |

Tarjetas de la billetera: colores aproximados de cada banco (`lib/bancos.ts`), o el color que elija el usuario. Los logos de los bancos **no se guardan en el repositorio**: se cargan en el navegador desde el sitio de cada banco, con las iniciales como respaldo.

## Logo

La billetera con la bandera y el recibo (`public/logo-*.png`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`). Va en el encabezado, la pestaña del navegador y el ícono al instalar la app.

## Tipografía

**Manrope** (variable, empaquetada con la app vía `@fontsource-variable/manrope`; no depende de Google Fonts). Cifras con `tabular-nums`. Escala corta: 0.76 / 0.86 / 1 / 1.2 rem; el número del día va entre 2.75 y 4.25 rem.

## Entrada

Pantalla en azul noche con luces que se mueven despacio, una cuadrícula tenue y una tarjeta flotando. Caja de vidrio con la clave y luego seis casillas para el código de Telegram (se envía solo al completar los 6 números).

## Patrones

- **Filas de libreta:** concepto · puntos · valor (`.fila` + `.puntos`).
- **Bloques:** papel con radio 20px y sombras suaves en capas (sin bordes marcados); fondo con un brillo de colores (`.aurora`). En oscuro, azul noche.
- **Resumen tipo bento:** la cifra del día en grande (degradado azul, o rojo si te pasaste) y cuatro fichas: Libre, Gastado (con mini curva y ↑↓ contra el mes pasado), Racha (los últimos 7 días) y Próximo pago.
- **Paleta rápida (Ctrl+K):** escribir como en el bot (`almuerzo 15 mil con nu`) o saltar a cualquier sección o acción.
- **Vacíos:** ícono en burbuja y una frase amable que dice qué hacer.
- **Ventanas:** `<dialog>` nativo, se cierra tocando afuera o con Esc; en el celular sale desde abajo.
- **Barra lateral:** azul noche con grano fino en claro y oscuro (estilo fintech). La pestaña activa brilla.
- **Transición entre pantallas:** la barra lateral queda quieta; el contenido se desliza hacia el lado al que vas con un leve desenfoque.
- **Celular:** barra flotante abajo con el botón “+” en el centro. **Escritorio:** barra lateral fija (logo, buscador, secciones, Registrar).

## Movimiento

Un momento principal por vista: el medidor se llena, la línea del mes se dibuja (con un punto que late en el día de hoy), la dona de categorías se arma, un brillo recorre las barras de progreso, las cifras cuentan hasta su valor y las filas entran escalonadas. Las tarjetas se inclinan con el dedo o el mouse. Todo se apaga con `prefers-reduced-motion`.
