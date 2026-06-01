# La Primada — Constitución visual (DESIGN.md)

Este archivo es la **constitución visual** del proyecto: el equivalente del `CLAUDE.md` (dominio + arquitectura),
pero para lo visual. Toda decisión de apariencia sale de aquí.

> **Estado:** este documento crece **una decisión a la vez**. Hoy define **Tipografía**, **Color**,
> **Iconografía**, **Espaciado y layout**, **Patrones** (acordeón) y **Voz y tono**. Faltan (pasadas posteriores):
> más **componentes**. Mientras una sección no exista aquí, **no es una decisión tomada**.

## Tipografía

**Fuente principal: Instrument Sans.** Una sola familia para **toda la interfaz** — títulos, cuerpo, nombres y números.
No hay fuente secundaria.

### De dónde se carga
Desde el **CDN de Google Fonts**, con un `<link>` en `index.html` (igual que las fuentes anteriores). Definición canónica:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;700&display=swap" rel="stylesheet">
```

### Escala de pesos
Una escala simple; usar solo estos tres:

| Peso | Valor | Uso típico |
|------|-------|------------|
| Regular | **400** | cuerpo, texto general, metadatos |
| Medium  | **500** | énfasis suave, etiquetas, números destacados |
| Bold    | **700** | títulos, nombres, montos, botones |

> Si más adelante hace falta otro peso (p. ej. 600), se agrega **aquí primero** y luego al `<link>` y al CSS — nunca al revés.

### Stack CSS canónico
La familia se referencia siempre así (con fallbacks del sistema por si el CDN no carga):

```css
font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

### Reglas (tipografía)
- **La tipografía sale SIEMPRE de esta definición.** Nada de familias hardcodeadas sueltas en el código.
- Una sola familia (**Instrument Sans**) para todo: la jerarquía se logra con **peso y tamaño**, no cambiando de fuente.
- Cambiar la tipografía = editar **este documento primero**, y luego reflejarlo en `index.html`.

## Color

**Dark-first, paleta verde-azul (teal) sobre oscuro.** La app es oscura por defecto; no hay tema claro por ahora.
Toda referencia de color en el CSS pasa por estas variables (`:root` en `index.html`); **nada de hex/rgba sueltos** en reglas.

### Tokens (fuente de verdad)

| Token (CSS var) | Valor | Rol |
|-----------------|-------|-----|
| `--paper`   | `#0d1716` | **Fondo profundo** (lienzo de la app) |
| `--paper-2` | `#13201f` | **Superficie de tarjeta** / paneles |
| `--paper-3` | `#1a2c2a` | Superficie elevada (derivado) |
| `--ink`     | `#e2eeec` | **Tinta principal** (texto) |
| `--ink-soft`| `#8aa3a0` | Texto secundario / atenuado (derivado) |
| `--line`    | `#25403d` | Bordes / divisores (derivado) |
| `--accent`  | `#2DD4BF` | **Acento principal** (botones, foco, activos, ganancia) |
| `--accent-ink` | `#0d1716` | **Texto sobre el acento** = el fondo profundo (**nunca blanco**) |
| `--pos`     | `#4DD9A0` | "Pagó / positivo" — texto |
| `--pos-bg`  | `#103028` | "Pagó / positivo" — fondo |
| `--alert`   | `#F08C8C` | "Debe / alerta" — texto |
| `--alert-bg`| `#3a1818` | "Debe / alerta" — fondo |
| `--shadow`  | sombras a negro | Profundidad sobre oscuro |

**Alias de compatibilidad** (nombres heredados del CSS que apuntan a la paleta semántica, para no reescribir cada regla):
`--red` → `--accent` (`#2DD4BF`); `--red-deep` → `#14b8a6` (teal de énfasis/hover); `--green` → `--pos` (`#4DD9A0`);
`--amber` → `#e0b341` (avisos/warn).

### Reglas (color)
- **Dark-first:** el fondo es `--paper` (oscuro); las superficies suben con `--paper-2`/`--paper-3`.
- **Texto sobre el acento** usa `--accent-ink` (el fondo profundo), **nunca blanco** — el teal es claro y el blanco no contrasta.
- **Semántica de saldos:** "pagó/positivo" usa el par `--pos` / `--pos-bg`; "debe/alerta" usa `--alert` / `--alert-bg`.
  Un saldo en deuda **siempre** se ve en `--alert`; nunca en el acento (no confundir deuda con algo positivo).
- **Nada de color hardcodeado suelto.** Todo color en el CSS referencia estas variables. Agregar/cambiar un color =
  editar **este documento primero** y luego `:root` en `index.html`.
- Los tintes translúcidos de estados (badges, hovers) se derivan de estos tonos; al sumar componentes se formalizan aquí.

## Espaciado y layout

**Principio: liviandad y minimalismo.** Densidad **baja**, aire **generoso**. Una cosa a la vez, con espacio para
respirar. La app es **solo mobile** (referencia **390px**, iPhone estándar); **no hay adaptación desktop ni breakpoints**.

### Escala de espaciado (tokens CSS)
Una escala fija; **todo valor de espaciado sale de aquí**. Nada de números sueltos en el CSS.

| Token | Valor | Uso |
|-------|-------|-----|
| `--space-1` | `4px`  | gaps mínimos (ícono↔texto, badge interno) |
| `--space-2` | `8px`  | gap corto entre elementos contiguos |
| `--space-3` | `12px` | gap medio (filas, controles) |
| `--space-4` | `20px` | **padding estándar de tarjetas** (todos los lados) |
| `--space-5` | `28px` | **separación entre secciones** de una misma pantalla |
| `--space-6` | `40px` | margen mayor entre bloques |
| `--space-safe` | `86px` | **padding inferior** del contenido (deja espacio a la tabbar fija) |

### Alturas mínimas de toque (tokens CSS)
Mobile-first, **pulgar cómodo**. Todo elemento interactivo respeta su mínimo (vía `min-height`):

| Token | Valor | Elemento |
|-------|-------|----------|
| `--tap-btn`   | `52px` | Botón principal |
| `--tap-sec`   | `40px` | Botón secundario / chip |
| `--tap-row`   | `56px` | Fila de lista |
| `--tap-input` | `52px` | Input |

### Radios de borde (tokens CSS)
| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | `8px`  | chips, badges |
| `--radius-md` | `12px` | inputs, botones |
| `--radius-lg` | `20px` | tarjetas |
| `--radius-xl` | `28px` | modales, wizard |

### Layout
- **Ancho máximo de contenido: `--content-max` (`480px`), centrado.** **Sin** breakpoints desktop — la app vive
  en una columna mobile.
- **Padding interno de tarjeta:** `--space-4` (20px) en **todos** los lados.
- **Gap entre secciones** de la misma pantalla: `--space-5` (28px).

| Token | Valor | Uso |
|-------|-------|-----|
| `--content-max` | `480px` | ancho máximo del contenido (`.wrap`, sheets), centrado |

### Reglas
- **Todo valor de espaciado sale de estas variables.** Nunca valores sueltos en el CSS (ni `padding:14px`, ni `gap:10px`).
- **Botones principales ocupan el ancho completo** del contenedor en mobile.
- **Altura mínima de toque respetada** en todos los elementos interactivos (botones, chips, filas, inputs).
- Densidad baja: cuando dudes entre apretar o airear, **airea**. Una acción/idea principal por bloque.
- Agregar/cambiar un token = editar **este documento primero**, y luego reflejarlo en `:root` de `index.html`.

> **Estado:** estos tokens **ya están aplicados** en el `:root` de `index.html` (espaciado, radios, alturas de toque
> y `--content-max`), con todos los valores de espaciado del CSS referenciando las variables.

## Patrones

### Acordeón (progressive disclosure)
Patrón **reutilizable** para listas largas donde cada ítem tiene un resumen y un detalle accionable.
Su primer uso es la **tarjeta de asistente** del tab Primadas (una primada puede tener 15–17 personas).

**Principio:** **cerrado por defecto**. En reposo cada ítem es **una línea-resumen** legible de un vistazo; el
**detalle y los controles** aparecen solo al **expandir**. Así una lista larga se lee sin un muro de controles.

**Anatomía**
- **Cabecera (`.acc-head`)** — es el disparador (todo el renglón es tappable). Contiene:
  - **caret** (`.acc-caret`, rota 90° al abrir, transición suave),
  - **identidad** (nombre + badges),
  - **cifra-resumen** a la derecha (`.acc-amt`): el dato que importa cerrado (total; y si **debe**, el saldo en `--alert`).
- **Cuerpo (`.acc-body`)** — solo se renderiza si el ítem está abierto; entra con una animación corta (`accIn`, ~180 ms).

**Comportamiento**
- **Multiabierto:** varios ítems pueden estar abiertos a la vez (útil para registrar a varias personas seguidas).
- El estado abierto/cerrado es **UI efímero**, vive en el **Controller** (`ui.abiertos = Set`), **NO** en el Store
  (no es dominio, no se persiste). La Vista es pura sobre `(estado, ui)`.
- **a11y:** la cabecera es un `<button>` con `aria-expanded`.

**Cuándo usarlo:** listas de entidades con resumen + detalle (asistentes; a futuro, deudores o aportantes).
**Cuándo NO:** contenido que siempre debe estar visible, o listas de 2–3 ítems donde plegar estorba.

**Progressive disclosure anidado (consumo).** Dentro de la tarjeta abierta, el consumo aplica el mismo principio:
se muestran **solo los productos consumidos** (cantidad > 0) con su stepper; un **chip-picker "+ Agregar"** revela el
catálogo de esa primada para sumar lo que falte; bajar a 0 lo retira. Vacío → mensaje ("Aún no ha consumido nada"),
nunca un bloque en blanco.

## Iconografía

**Librería: [Lucide](https://lucide.dev) (licencia ISC), como SVG inline.** **Sin CDN ni paquete npm:** se copian
**solo los `<path>`/`<line>`/`<circle>` de cada ícono** a un mapa de constantes en `js/view.js` (`ICON_PATHS`), y un
helper `icon(name, cls?)` arma el `<svg>`. Para el header, que es markup estático, el SVG va inline en `index.html`
con los mismos atributos. Es la misma filosofía que las fuentes: dependencia externa adoptada, pero servida por
nosotros sin librería en runtime.

### Estilo canónico (todos los íconos)
- **`viewBox="0 0 24 24"`**, **`fill="none"`**, **`stroke="currentColor"`**, **`stroke-width="1.75"`**,
  `stroke-linecap="round"`, `stroke-linejoin="round"`.
- **`stroke = currentColor`** → el ícono **hereda el color del botón**: **teal `#2DD4BF`** por defecto (botones de header,
  acciones), **`--alert`** en botones destructivos (`.mini.danger`), **`--pos`** para el check de "pagado". **Nunca `fill`.**
- Tamaño base **20×20** (clase `.icon`); **18px** dentro de botones con texto (`.mini`, `.btn`); **16px** para `.xmini`
  y la variante `.icon.sm`. Coherente con los botones existentes (44px de caja en el header).

### Íconos en uso y su regla
| Ícono Lucide | Dónde | Regla de uso |
|--------------|-------|--------------|
| `settings-2` | botón ⚙ del header | Personas y Ajustes (engranaje). |
| `user` / `log-in` / `log-out` | botón de cuenta (header, a la derecha del settings) | **Refleja el estado de auth:** `user` = placeholder (backend off); `log-in` = backend on sin sesión; `log-out` = autenticado. |
| `plus-circle` | "Nueva primada", "Asistente", "Producto", "Agregar" (persona/consumo) | **Toda acción de AGREGAR/crear.** |
| `trash-2` | "Borrar" primada, "Quitar" asistencia, quitar producto/abono | **Toda acción DESTRUCTIVA.** Va en botón `.danger` (color `--alert`). |
| `x` | cerrar chip-picker, cerrar overlay | **Cerrar/descartar** un panel (no destructivo). |
| `check` | ítem de abono registrado | **Pagado/positivo** (color `--pos`). |
| `chevron-down` | caret del acordeón (asistencias, productos del evento) | Cerrado = rotado −90° (apunta a la derecha); abierto = 0° (apunta abajo). |

### Reglas
- **Agregar un ícono nuevo:** copiar sus paths de lucide.dev a `ICON_PATHS`, **respetando el estilo canónico**
  (stroke `currentColor`, sin fill, 1.75). Documentarlo en la tabla de arriba con su regla de uso.
- **Semántica consistente:** `plus-circle` = agregar, `trash-2` = destruir, `x` = cerrar. No mezclar (`x` no se usa
  para borrar datos; `trash-2` no se usa para cerrar paneles).
- **El color sale del contexto** (`currentColor`), no se hardcodea en el SVG: así un mismo ícono sirve en teal o en alert
  según el botón que lo contiene.

## Voz y tono

**Neutro y funcional.** La interfaz **etiqueta, no explica**. Las reglas del sistema las aplica el código; no se narran
en pantalla. Texto mínimo, una idea por elemento.

### Las tres reglas
1. **Etiquetar, no explicar.** La interfaz **nombra**; no enseña. Lo que el sistema garantiza (el principal es ahorrador,
   los organizadores no pagan cover, etc.) lo aplica el código — **no se cuenta en pantalla**.
2. **Tono neutro y funcional.** Acciones en **infinitivo** (Agregar, Crear, Cerrar, Borrar). Estados en **forma corta y
   neutra** (Sin asistentes, Sin productos). Segunda persona **solo si hace falta**. Nada de frases que enseñan.
3. **Una idea por texto.** Si un texto une dos ideas con coma, **pártelo o bórralo**.

### Glosario (una palabra por concepto, igual en toda la app)
**Primada · Principal · Organizador · Co-organizador · Cover · Consumo · Ganancia · Fondo · Debe · Pagó · Asistente ·
Persona · Producto · Tesorero.**
Usar siempre el mismo término; no mezclar sinónimos (p. ej. "asistencia" en UI → **Asistente**; "comprador/aportante" → según el rol).

### Patrones
- **Botones de acción:** verbo en infinitivo, sin artículos (`Agregar`, `Crear primada`, `Borrar`). El ícono acompaña, no sustituye.
- **Estados vacíos:** `Sin <cosa>` (`Sin asistentes`, `Sin productos`, `Sin ahorradores`). Nada de "Aún no hay…".
- **Títulos de sección:** el sustantivo + conteo entre paréntesis (`Asistentes (0)`, `Productos (4)`). Sin adjetivos ni contexto.
- **Toasts:** confirmación corta en pasado o sustantivo (`Primada creada`, `Abono registrado`, `Persona agregada`). Una línea.
- **Confirmaciones (destructivas):** pregunta corta de una idea (`¿Borrar la primada?`). Sin explicar consecuencias en la pregunta.
- **Placeholders:** ejemplo o nombre del campo (`tu@correo.com`, `Nombre`). No instrucciones.
- **Números:** el dígito ya es visual; no narrar el total ("paso 2 de 3" → el stepper visual basta).
- **Sin emoji decorativo en texto de estado** (los estados usan color/badge, no 🟢/🔒 en copy nuevo).

### Antiejemplos → corrección (muestra del criterio)
| Antes | Después |
|-------|---------|
| `ORGANIZADOR PRINCIPAL (AHORRADOR)` | `Principal` |
| `CO-ORGANIZADORES (OPCIONAL)` + párrafo | `Co-organizadores` |
| `Aún no hay asistencias. Agrega personas del directorio.` | `Sin asistentes` |
| `ASISTENCIAS (0)` | `Asistentes (0)` |
| `PRODUCTOS DEL EVENTO (4)` | `Productos (4)` |
| `No hay ahorradores en el directorio. Crea uno desde el engranaje ⚙ › Personas.` | `Sin ahorradores. Agregar en Personas.` |
| `Entran como organizadores: sin cover, consumen normal. Su margen sí va al fondo.` | *(borrar — es regla del sistema)* |

> **Regla de oro:** ante un texto que explica una regla del dominio, **bórralo** — el código ya la hace cumplir.
