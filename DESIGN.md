# Diseño — Mis Finanzas

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

Tarjetas de la billetera: colores aproximados de cada banco (`lib/bancos.ts`) con un sello de iniciales. **No se usan logos de bancos** (son marcas registradas).

## Tipografía

Fuente del sistema. Cifras con `tabular-nums`. Escala corta: 0.76 / 0.86 / 1 / 1.2 rem; el número del día va entre 2.75 y 4.25 rem.

## Patrones

- **Filas de libreta:** concepto · puntos · valor (`.fila` + `.puntos`).
- **Bloques:** papel con borde fino, radio 16px, sin sombras apiladas.
- **Ventanas:** `<dialog>` nativo, se cierra tocando afuera o con Esc; en el celular sale desde abajo.
- **Celular:** pestañas abajo y botón “+” redondo; en escritorio, dos columnas.

## Movimiento

Un momento principal por vista: el medidor se llena, la línea del mes se dibuja, las cifras cuentan hasta su valor y las filas entran escalonadas. Las tarjetas se inclinan con el dedo o el mouse. Todo se apaga con `prefers-reduced-motion`.
