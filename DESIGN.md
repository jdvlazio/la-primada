# DESIGN.md — Contrato normativo de diseño · La Primada

> Fuente de verdad **visual** de la app. Es a los cambios de CSS lo que `CLAUDE.md`
> es a la arquitectura. **Antes de cualquier cambio de CSS, leer este documento.**
>
> Mantenido a mano (no autogenerado). Cada decisión canónica nueva la aprueba el
> Product Owner (Juan) antes de implementarse.
>
> Identidad de La Primada: **dark teal**, **Instrument Sans**, una sola columna mobile
> (referencia 390px, sin breakpoints). Liviandad radical: **el espacio y la jerarquía
> tipográfica organizan, no las cajas.**

---

## 0 · Regla de uso (LEER PRIMERO)

> **El documento manda sobre el código. Si difieren, el código está mal.**
> Cualquier valor que no esté aquí (color, tamaño, peso, espaciado, radio) requiere
> **decisión explícita del Product Owner** antes de implementarse.

Corolarios:
- **Cero valores raw** fuera de tokens: todo color/espaciado/radio/altura va por `var(--…)`
  del `:root` de `index.html`. Un literal suelto (`padding:14px`, `#1a2c2a`, `gap:10px`)
  es un bug. Las excepciones existentes están en §5.
- No introducir colores/tamaños/pesos nuevos para datos ya tipados aquí (nombre, rol,
  monto, sección, estado). Una desviación es **excepción** y va a §5 con su razón, aprobada.
- Este documento describe el **canónico aprobado**, no el estado histórico del CSS. Hay
  **componentes duplicados de dos épocas** (caja pesada vs fila liviana); §2 declara cuál
  es el canónico y marca el otro como **LEGADO a eliminar**. Mientras una sección no exista
  aquí, **no es una decisión tomada**.

---

## 1 · Tokens del sistema

Valores resueltos, extraídos de `:root` en `index.html`. **Son la única fuente de valores.**

### Color — superficies
| Token | Valor | Rol |
|---|---|---|
| `--paper` | `#0d1716` | Fondo profundo (lienzo de la app) |
| `--paper-2` | `#13201f` | Superficie de tarjeta / paneles / inputs activos |
| `--paper-3` | `#1a2c2a` | Superficie elevada (chips de estado, indicadores) |

### Color — texto
| Token | Valor | Rol |
|---|---|---|
| `--ink` | `#e2eeec` | **Primario** — nombres, montos, títulos |
| `--ink-soft` | `#8aa3a0` | **Secundario / terciario** — rol, meta, etiquetas, sección |

### Color — líneas
| Token | Valor | Uso |
|---|---|---|
| `--line` | `#25403d` | Borde de **controles** (input, chip, botón borde). **No** para separar secciones |
| `rgba(255,255,255,.06)` | línea tenue | **Separador de filas** dentro de una lista (canónico, ver §2). Pendiente de tokenizar (§5) |

### Color — acento y semántica de estado
| Token | Valor | Rol |
|---|---|---|
| `--accent` (alias `--red`) | `#2DD4BF` | **Acento** — botón primario, foco, activo, ganancia, punto del principal |
| `--accent-ink` | `#0d1716` | Texto **sobre** el acento (nunca blanco) |
| `--red-deep` | `#14b8a6` | Teal de énfasis (hover, monto de ganancia) |
| `--pos` (alias `--green`) | `#4DD9A0` | **Pagó / positivo** — texto (check de abono) |
| `--pos-bg` | `#103028` | Pagó / positivo — fondo |
| `--alert` | `#F08C8C` | **Debe / destructivo** — texto del saldo, botón borrar |
| `--alert-bg` | `#3a1818` | Debe / alerta — fondo |
| `--amber` | `#e0b341` | Aviso / "incompleta" / "Próximamente" |

### Espaciado (escala fija) — REGLA: ceñido al contenido
**Principio (global, no negociable):** la app es **compacta y minimalista**. Márgenes, paddings y
gaps van **ceñidos al contenido**, sin aire de más. Todo espaciado sale de un **token** (cero px
sueltos de margin/padding/gap). El **alto de los controles** lo dan los tokens `--tap-*` (ver
"Alturas"), compactos (44/36). **Default de separación entre secciones = `--space-4` (20px).**
`--space-5/6` (28/40) son la **excepción**: solo para **aire deliberado** (estado vacío, login hero),
nunca como ritmo normal. Cualquier control nuevo hereda esto por los tokens — no inventar valores.
| Token | Valor | Uso |
|---|---|---|
| `--space-1` | 4px | gap mínimo (ícono↔texto, dot↔palabra) |
| `--space-2` | 8px | gap corto entre elementos contiguos |
| `--space-3` | 12px | gap medio / padding de fila |
| `--space-4` | 20px | padding de tarjeta · **separación entre secciones (default)** |
| `--space-5` | 28px | **excepción**: aire deliberado (login, padding inferior de sheet) |
| `--space-6` | 40px | **excepción**: hero / estado vacío grande. **No** como ritmo normal |
| `--space-safe` | 86px | padding inferior del contenido (deja sitio a la tabbar fija) |

### Tipografía — pesos (Instrument Sans, única familia)
| Peso | Valor | Uso |
|---|---|---|
| Regular | 400 | **secundario** (rol, meta, cover, unidad) — peso base |
| Medium | 500 | énfasis suave (poco usado) |
| Bold | 700 | **primario** (nombre, monto, título), botones |
| Display | 800 | wordmark, títulos de sheet/wizard |

Stack canónico: `font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;`
Carga: Google Fonts vía `<link>` (`wght@400;500;700`). Una sola familia para todo; la
jerarquía se logra con **peso y tamaño**, nunca cambiando de fuente.

### Radios
| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 8px | chips, badges, abonos |
| `--radius-md` | 12px | inputs, botones |
| `--radius-lg` | 20px | tarjeta genuina |
| `--radius-xl` | 28px | sheet / wizard / toast |

### Alturas mínimas de toque (PASADA DE COMPACTACIÓN)
**Regla:** los controles van **ceñidos a su contenido** — minimalista, sin aire vertical de más.
Los valores se compactaron (un input de fecha en 52px+12px de padding ocupaba demasiado). Pisos
tappables respetados: **44px** primario/input, **36px** secundario.
| Token | Valor | Elemento |
|---|---|---|
| `--tap-btn` | **46px** (antes 52) | botón primario |
| `--tap-sec` | **36px** (antes 40) | botón secundario / chip / ícono tocable |
| `--tap-row` | **48px** (antes 56) | fila de lista (cabecera de acordeón) |
| `--tap-input` | **44px** (antes 52) | input |
| `.ti` padding | `var(--space-2) var(--space-3)` (8/12, antes 12/12) | menos aire vertical en inputs |

### Layout
| Token | Valor | Uso |
|---|---|---|
| `--content-max` | 480px | ancho máximo del contenido (`.wrap`, `.sheet`), centrado |

Sin breakpoints desktop. Safe areas iOS: `viewport-fit=cover` + `env(safe-area-inset-*)`
con piso `max(env(...),20px)` (detalle en §6).

---

## 2 · Componentes canónicos

Cada componente se describe por su **clase + propiedades exactas**. Donde hay duplicado
histórico, se marca **✅ CANÓNICO** o **❌ LEGADO (eliminar)**.

### 2.1 · Fila de asistente — **el componente crítico** (✅ CANÓNICO)

Muestra una persona en la lista de una primada. Es el corazón del tab Primadas y fija el
lenguaje de **todas** las filas de la app (directorio, deudores, productos).

**Principio:** **sin caja con borde.** Separación entre filas por **línea tenue**
(`rgba(255,255,255,.06)`) o por **espacio** — nunca un recuadro. El peso visual baja al mínimo;
el dato manda, no el contenedor.

**Anatomía (cabecera del acordeón, estado cerrado):**

| Elemento | Valor canónico |
|---|---|
| **Contenedor de fila** | `display:flex; align-items:center; gap:var(--space-3); min-height:var(--tap-row)`. **Sin** `background`, **sin** `border` de caja, **sin** `border-radius` de tarjeta. Separación con la siguiente fila vía `border-bottom:1px solid rgba(255,255,255,.06)` (o sólo espacio) |
| **Caret** (`.acc-caret`) | `chevron-down`, `color:var(--ink-soft)`; cerrado `rotate(-90deg)`, abierto `rotate(0)`; transición .18s; ícono 18px |
| **Identidad** (`.acc-id`) | `flex:1; min-width:0; display:flex; align-items:center; gap:var(--space-2); flex-wrap:wrap` |
| · **Nombre** | **primario**: `color:var(--ink); font-weight:700; font-size:15px` |
| · **Rol** (Ahorrador / Invitado) | **etiqueta tenue en texto**, junto al nombre: `color:var(--ink-soft); font-weight:400; font-size:12px`. **NO** badge con borde |
| · **Principal** | **punto teal** (`.dot`, `8px`, `background:var(--accent)`) **+ la palabra "Principal"** como etiqueta tenue (`--ink-soft`, 400). **NO** badge rojo, **NO** borde en la fila |
| **Cifra-resumen** (`.acc-amt`) | total a la derecha: número **primario** `color:var(--ink); font-weight:700; font-size:14px`. Unidad/etiqueta pequeña (`i`, `font-size:11px; color:var(--ink-soft)`) |
| · **Debe** | el saldo se marca con **el color en el NÚMERO**: `color:var(--alert)`. **Nunca** borde rojo en la fila ni fondo |

**Cuerpo (`.acc-body`, sólo si abierto):** controles de consumo, cover, abonos. Entra con
`accIn` (~.18s). Su contenido sigue los componentes de §2.3–§2.6. Los divisores internos del
cuerpo usan **espacio o línea tenue**, no `dashed`.

**Markers — resumen de la regla:**
- Rol → **palabra tenue** (no badge).
- Principal → **dot teal + palabra** (no badge, no borde de fila).
- Debe → **color en el número** (no borde, no fondo).

### 2.1.L · Caja de asistente pesada (❌ LEGADO — eliminar)

Implementación actual a reemplazar por 2.1:

| Clase | Estado |
|---|---|
| `.asis` | `background:var(--paper-2); border:2px solid var(--line); border-radius:var(--radius-lg)` → **eliminar la caja**; volver fila liviana |
| `.asis.is-principal` | `border-color:var(--red)` → **eliminar**; principal = dot + palabra |
| `.asis.debe` | `border-color:var(--alert)` → **eliminar** (además **muerto**: `view.js` nunca lo aplica) |
| `badge('principal','red')` en `.acc-id` | badge rojo con borde → **reemplazar** por dot + "Principal" |
| `badge(estado,'good')` en `.acc-id` | badge con borde → **reemplazar** por etiqueta de rol tenue |
| `.asis-foot` | `border-top:1px dashed var(--line)` → **espacio o línea tenue sólida** |

> La fila liviana **`.pitem`** (directorio de personas: `background:transparent; border:none`)
> ya es el modelo correcto. `.asis` debe **converger a ese lenguaje**.

### 2.2 · Sección (✅ CANÓNICO)

Título de sección + acción en la misma línea, separada del resto por **espacio**, nunca por borde.

| Clase | Propiedades canónicas |
|---|---|
| `.sec-head` | `display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); margin-bottom:var(--space-3)` |
| `.h2` (título) | **terciario**: `font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-soft)`. Patrón de texto: sustantivo + conteo — `Asistentes (3)` |
| `.add-link` (acción texto) | `color:var(--accent); font-weight:700; font-size:14px; background:transparent; border:none; min-height:var(--tap-sec)` + ícono `plus-circle` |
| `.icon-btn` (acción ícono) | `width/height:var(--tap-sec); background:transparent; border:none; color:var(--ink-soft)`; hover → `--accent` |
| Separación entre secciones | **`--space-5`** (margin). **Nunca** `border-bottom` ni `dashed` |

**❌ LEGADO:** `.sub` (`border-top:1px dashed var(--line)`) como separador de sub-bloque →
reemplazar por espacio.

### 2.3 · Input / campo (✅ CANÓNICO)

El input **sí** lleva borde: es la affordance del control, no una caja decorativa. El borde es
**`1px solid var(--line)`** (fino — la liviandad pesa: marca el campo sin convertirlo en caja gruesa).

| Clase | Propiedades canónicas |
|---|---|
| `.ti` (texto) | `font-size:14px; min-height:var(--tap-input)` (44px, compacto); `padding:var(--space-2) var(--space-3)` (8/12, poco aire vertical); `border:1px solid var(--line); border-radius:var(--radius-md); background:var(--paper); color:var(--ink); width:100%` |
| `.ti:focus` | `border-color:var(--accent)` (foco = acento) |
| `.ti.name` | variante título: `font-weight:700; font-size:18px` |
| `.ti[type=date]` / `.ti[type=month]` | **`appearance:none; text-align:left`** — en iOS el control nativo rendea más alto que el `min-height` y centrado (parece un botón grande); esto lo ciñe al alto del `.ti` y lo alinea como campo. El picker nativo sigue abriéndose al tocar |
| `.sel` (select) | igual al `.ti` (`border:1px`) + chevron-down de Lucide (`appearance:none` + background data-URI), una sola flecha como el caret de fila |
| `.fld` (etiqueta de campo) | `font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft)` + gap al control. **Secciones de un sheet separadas por aire (`.cfg-sec`), no por divisores** |
| `.stepper` / `.step` (±) · `.mini` (botón chico) | borde **`1px solid var(--line)`** (afinado de 2px → 1px en la pasada de liviandad) |
| **Quitar inline** (`.xmini` + `trash-2`) | **ícono discreto sin caja**, `color:var(--alert)` (destructivo). **No** un botón con borde/caja roja |

### 2.4 · Botones — tres roles (✅ CANÓNICO)

**Un solo botón primario sólido por pantalla.** Todo lo demás es secundario o destructivo.

| Rol | Clase | Propiedades canónicas |
|---|---|---|
| **Primario** (sólido teal, único/pantalla) | `.btn` | `background:var(--accent); color:var(--accent-ink); min-height:var(--tap-btn); border:none; border-radius:var(--radius-md); font-weight:700; width:100%`. Hover → `--red-deep` |
| **Secundario** (texto o borde sutil) | `.btn.ghost` · `.mini` · `.add-link` · `.icon-btn` | `.btn.ghost`: `background:var(--paper-2); border:2px solid var(--line); color:var(--ink)`. `.mini`: chico, `border:2px solid var(--line)`. `.add-link`/`.icon-btn`: texto/ícono sin caja |
| **Destructivo** (rojo, escondido + confirmación) | `.mini.danger` · `.xmini` | `color:var(--alert)`; ícono `trash-2`. **Siempre** tras confirmación (`¿Borrar la primada?`). No es nunca el botón primario de la pantalla |

### 2.5 · Overlay / sheet (✅ CANÓNICO)

Pantallas secundarias (Personas, Ajustes, wizard) entran como sheet desde abajo.

| Clase | Propiedades canónicas |
|---|---|
| `.overlay` | `position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:1100; display:flex; justify-content:center; align-items:flex-end` (bottom-sheet) |
| `.sheet` | `background:var(--paper); width:100%; max-width:var(--content-max); max-height:92vh; overflow:auto; border-radius:var(--radius-xl); border:2px solid var(--line); padding-bottom:calc(var(--space-5) + max(env(safe-area-inset-bottom),20px))` |
| `.sheet.full` | `min-height:0` — **se AJUSTA AL CONTENIDO** (bottom-sheet que abraza su alto). **No** se fuerza a llenar la pantalla; si el contenido supera `max-height:92vh`, scrollea adentro. Una hoja corta (p. ej. el selector con pocas primadas) queda pegada abajo, ocupando solo lo necesario |
| `.sheet-head` | título (`.sheet-title`, 800/22px) + cerrar (`x`); `margin-bottom:var(--space-5)` |

### 2.6 · Estado vacío (✅ CANÓNICO)

| Clase | Propiedades canónicas |
|---|---|
| `.empty-soft` | **sin caja**: `text-align:center; color:var(--ink-soft); font-size:14px; padding:var(--space-5) var(--space-3)`. Variante `.big` con más aire. Texto: `Sin <cosa>` |

**❌ LEGADO:** `.empty` (`border:2px dashed var(--line); border-radius:var(--radius-lg)`) →
reemplazar por `.empty-soft`.

### 2.7 · Estado (abierta / cerrada) (✅ CANÓNICO)

Estado de una primada = **punto de color** (`.dot` / `.dot.closed`) + texto (`.estado-tag`).
**No** un badge con borde. Abierta → `--pos`; cerrada → `--ink-soft`. Mismo patrón en el
detalle (`.prm-meta`) y en el historial (`.estado-tag`).

### 2.8 · Productos y asistentes en Configurar = CLON del componente de Personas (✅ CANÓNICO)

Vive **solo** en el overlay Configurar (no en el tab Primadas). **Regla:** las filas de asistente y
de producto usan EXACTAMENTE las mismas clases que la fila de Personas (§2.9) — son el mismo
componente acordeón, no unas "cajas livianas" propias. Configurar y Personas son **indistinguibles**
en estilo de fila/campo. Antes Configurar mostraba TODO expandido (un muro de cajas con borde);
ahora es una lista de filas-línea colapsadas, idéntica a Personas.

| Clase (compartida con Personas §2.9) | Uso en Configurar |
|---|---|
| `.prow-list` / `.prow` | contenedor + fila acordeón (sin caja; separación por línea tenue `border-bottom`) |
| `.acc-head` + `.acc-caret` + `.acc-id-stack` (`.acc-id` + `.acc-sub`) | cabecera colapsada: **asistente** = nombre+rol (arriba) · rol·cover (tenue, abajo); **producto** = emoji+nombre · `Venta $X · margen $Y` (tenue) |
| `.acc-body` | al expandir: **asistente** = Rol (`.fld`+`select.sel`) + cover + Quitar (`.mini.danger`); **producto** = Costo/Venta (`.grid2`+`.fld`+`.ti`) + Quitar |
| `.prow-foot` / `.prow-new` | alta de producto nuevo, igual que "Agregar persona" |
| toggles | `data-act="toggle-cfg-asis"` / `toggle-cfg-prod` (mismo patrón que `toggle-persona`) |

**❌ ELIMINADAS** (clases pesadas propias de Configurar, ya no existen): `.prodmgmt`, `.prodrow`,
`.prodrow-name`, `.prodnew`, `.cfg-asis*`. **`.prodrow-f`/`.ti.num`/`.ti.emoji`** se conservan: las usa
el **wizard** (`.wz-prodrow`, productos en 2 líneas con costo/venta compactos de 96px, separados por aire).

La lógica de precios (costo/venta, margen) **no** cambia con esta anatomía; solo **dónde** se edita.

### 2.9 · Fila de persona — Directorio (✅ CANÓNICO)

Dos líneas, expandible inline (sin cajas anidadas). Extiende la fila de asistente (§2.1).

| Estado | Anatomía |
|---|---|
| **Cerrada** (`.prow` + `.acc-head`) | caret + identidad en stack (`.acc-id-stack`): **línea 1** = `<b>nombre</b>` + rol como etiqueta tenue (`.rol-tag`, igual que §2.1); **línea 2** (`.acc-sub`, `--ink-soft` 12px) = dato secundario (nº de primadas). Separación entre filas por línea tenue (`--line-soft`) |
| **Abierta** (`.prow.open` + `.acc-body`) | edición **en contexto**: campo Nombre (`.ti`), Rol (`.seg-nav`), Bre-B (`.ti`). No es una caja siempre abierta: se revela al tocar |
| **Alta** | al pie, botón **`+ Agregar persona`** (`.add-link`) que despliega un form inline (`.prow-new`) — no un form siempre visible |

### 2.10 · Hoja "Agregar asistente" (✅ CANÓNICO)

Acción **simple** en operación: el `+ Agregar` del tab Primadas abre un sheet (overlay `add-asis`)
con el directorio; **un toque agrega** y la hoja queda abierta para sumar varios.

| Clase | Propiedades canónicas |
|---|---|
| `.addrow` | fila tappable: `min-height:var(--tap-row)`; identidad (`.acc-id`: nombre + rol tenue) a la izquierda, `+` de acento (`.addrow-plus`) a la derecha; separación por línea tenue. Sin caja |
| pie | enlace **"¿Falta alguien? Agregar en Personas"** (`.link-inline`) → overlay Personas. **"Nueva persona" NO vive aquí** |

> **Operación vs configuración (decisión de producto):** en operación, de cada asistente solo
> importa el **consumo** (§2.1 expandida = consumo + abono). El **rol, el cover y "Quitar"** son
> configuración → viven en **Configurar primada › Asistentes** (`.cfg-asis`), no en operación.

### 2.11 · Selector de primada — barra superior del tab Primadas (✅ CANÓNICO)

**Jerarquía por frecuencia de uso:** operar es diario → manda; crear es ~mensual → se degrada.
La barra superior es un **selector** (navegación principal entre primadas), no una cabecera estática.

**El MES es una GUÍA; el NOMBRE es la identidad (reducido, sin "Primada").** La primada NUNCA se
llama como el mes — el período solo orienta (habrá muchas al año). En el selector se muestra el mes
(guía) **+** el nombre **corto** (se quita el prefijo "Primada", que es redundante; quedan los
organizadores, ej. "Juanda + Joha"). Esto distingue varias primadas del **mismo mes** (si solo se
mostrara "Junio", dos primadas de junio serían idénticas). Helper de Vista: `nombreCorto(nombre)`.

**Cerrado (`.selrow`):** una fila con `[selector (flex:1)] [⚙ Configurar] [+ Nueva]`.
- `.prm-selector` (botón tappable, `data-act="open-selector"`): **dos líneas** — **`.sel-main`** =
  **nombre corto** (`nombreCorto`, peso 800/22px, **IDENTIDAD primaria**) sobre **`.sel-sub`** = punto
  de estado + `"Mes Año"` (`Util.monthYear`, `--ink-soft`, **GUÍA secundaria**). La primada no se llama
  como el mes: el nombre manda, el mes orienta. `.sel-caret` (chevron-down) rota 180° abierto.
- **`⚙`** (`.icon-btn`, `open-config-primada`): configuración (escondida, §2.8).
- **`+`** (`.icon-btn.nueva`, ~32px, `new-primada`): abre el wizard de 3 pasos. **Secundario** — ícono
  pequeño, NO un `.btn` grande (crear no compite con operar). **Prohibido** el botón grande "Nueva primada".

**Abierto (overlay `selector-primada`, `selectorSheet`):** sheet con TODAS las primadas **agrupadas por
AÑO → MES** (reciente arriba; `Store.select.primadasPorAnio`). El **historial vive aquí**, no como lista aparte.

| Clase | Propiedades canónicas |
|---|---|
| `.sel-anio` | encabezado de año: `font-weight:800; font-size:13px; color:var(--ink-soft); letter-spacing:.06em` |
| `.sel-fila` | fila tappable (`select-primada`): `min-height:var(--tap-row)`; sin caja; separación por línea tenue. Identidad `.sel-fila-main` = punto de estado + **`<b>Mes</b> · {nombre corto}`** (mes guía + identidad, sin "Primada"); a la derecha `.sel-fila-right` = total (recaudo) + `.sel-check` (check teal) si es la activa |
| activa | `.sel-fila.on` → el mes en acento. Tocar una la activa (`seleccionarPrimada`) y **cierra** la hoja |

> **Nombre automático (decisión de producto):** al crear, `Store.select.nombreSugerido` arma
> **"Primada {N1} + {N2}"** con el **primer token** del nombre de cada organizador — N1 = principal,
> N2 = segundo organizador; 1 solo → "Primada {N1}"; 3+ → solo los dos primeros. **Editable** (✎ =
> `renombrarPrimada`, override manual). Aplica a primadas nuevas; las viejas conservan su nombre.

### 2.12 · Pago BINARIO — "Pagar" + hoja con la llave Bre-B (✅ CANÓNICO)

**No hay "Abonar" ni pagos parciales.** Cada asistencia está `pagado` o no. El que paga **se autosirve**.
- **En la ficha del asistente** (operación, `.acc-body`, `pagoBlock`): si no pagó → botón **"Pagar {monto}"**
  (`open-pagar`); si pagó → `.pay.paid` = **"✓ Pagado"** (`.pay-state`, `--pos`) + **"Deshacer"** (`set-no-pagado`).
  El **principal** no muestra pago (auto-saldado). Activo aún con la cuenta **cerrada** (INVARIANTE #4).
- **Hoja "Pagar a {Principal}"** (overlay `pagar`, `pagarSheet`, ajustada al contenido):
  | Elemento | Canónico |
  |---|---|
  | `.pagar-amount` | monto que debe, **800/34px** (lo primero que se ve) |
  | `.pagar-to` | "Transfiere por Bre-B a **{Principal}**" |
  | `.pagar-llave` | la **llave Bre-B** del principal (`pago.breB`, fallback a la vigente), monoespaciada + **"Copiar"** (`copiar-llave`). Si no hay llave: nota + enlace a Personas |
  | `.btn` "Ya pagué" | `marcar-pagado` → marca `pagado`, cierra la hoja, toast |

> **Sin comprobante en la app** (decisión de producto): el comprobante se comparte por fuera (ej. WhatsApp).
> La llave Bre-B es el dato para **recibir** (no sensible, visible para todos). QR queda para una fase
> futura (el QR oficial de Bre-B usa un payload estándar que no se puede generar solo desde la llave).

---

## 3 · Jerarquía tipográfica por roles

Toda string de dato cae en un rol con **color + peso + tamaño fijos**. La jerarquía la
sostienen el peso/tamaño/aire, no las cajas.

| Rol | Color | Peso | Tamaño | Dónde |
|---|---|---|---|---|
| **Primario** | `--ink` (#e2eeec) | 700 | 15px fila · 22px título primada · 14px monto | nombre de persona, monto/total, nombre de primada |
| **Secundario** | `--ink-soft` (#8aa3a0) | 400 | 11–13px | rol (Ahorrador/Invitado), meta (fecha, mes), cover, unidad del monto |
| **Terciario** (sección) | `--ink-soft` | 700 | 13px + `uppercase` + `letter-spacing:.1em` | títulos `.h2` (ASISTENTES, PRODUCTOS) |
| **Display** | `--ink` | 800 | 22–40px | wordmark, `.sheet-title`, `.wz-title` |

Roles **semánticos** (sobreescriben el color, no el peso/tamaño):
- **Debe / saldo pendiente** → `--alert`, en el **número** (`.owe`). Nunca borde/fondo de fila.
- **Pagó / positivo** → `--pos` (check de abono, "Pagó").
- **Ganancia / acento** → `--accent` / `--red-deep` (montos de ganancia, foco, activo).

Reglas universales:
- **Primario** siempre `--ink` / 700.
- **Secundario** siempre `--ink-soft` / 400, peso **declarado explícito** (no heredar el del browser).
- **Texto sobre el acento** → `--accent-ink` (nunca blanco).

---

## 4 · Capitalización por rol

La capitalización se decide por **ROL del texto**, no por capricho. Cuatro categorías:

| Categoría | Regla | Cuándo | Ejemplos |
|---|---|---|---|
| **MAYÚSCULA** (vía CSS `text-transform`) | TODO MAYÚSCULAS | títulos de sección (`.h2`, `.fld`), etiquetas de campo | ASISTENTES · PRODUCTOS · AHORRADOR (campo) |
| **Title Case** | Cada Palabra | nombres propios y términos del glosario, tabs, nombres de persona/primada | Resumen · Primadas · Fondo · Principal · Cover · Tesorero · Primada Juan |
| **Sentence case** | Solo la primera | acciones/botones, estados vacíos, toasts, confirmaciones, hints | Crear primada · Agregar · Sin asistentes · Primada creada · ¿Borrar la primada? |
| **minúscula** | todo minúscula | fragmentos que se concatenan en una oración | · del principal · sin principal |

Reglas de borde:
- **Etiqueta de rol del asistente** (Ahorrador / Invitado / Principal) → **Title Case**, una
  palabra. Render como **etiqueta tenue en texto** (§2.1), la string conserva su capitalización.
- **Títulos de sección** se guardan en Sentence/Title en la string; el **`uppercase` lo aplica
  el CSS** (`.h2`). No escribir la string en mayúsculas a mano.
- **Glosario** (§7) → siempre el mismo término, en Title Case cuando es nombre propio del dominio.
- **Sin emoji** en texto de estado: el estado se comunica con color/dot, no con 🟢/🔒.

---

## 5 · Excepciones documentadas

Desviaciones **intencionales** del canónico, con razón. Aprobadas por el PO.

| Componente | Desviación | Razón |
|---|---|---|
| `rgba(255,255,255,.06)` (separador de filas) | valor raw, aún sin token | Línea tenue de separación de listas. **Pendiente de tokenizar** (`--line-soft`) cuando se aplique 2.1 — aprobar nombre con el PO |
| `.chip` (picker "+ Agregar") | `border:2px solid var(--line)` | Es un **control interactivo** (chip-picker de productos), no una caja decorativa. El borde es la affordance, como en inputs |
| `.ti` / `.sel` / `.step` | `border:2px solid var(--line)` | Inputs y steppers: el borde es affordance de control, permitido (§2.3) |
| `.tabbar` / `.tab.active` | `flex:none` (hijo flex al fondo de `.app`, NO `position:fixed`), `border-top:1px solid var(--line)`, fondo `var(--paper)`, `padding-bottom:max(env(safe-area-inset-bottom),20px)`. Activo = solo color de acento (sin pill) | Anclada por estructura (el alto de `.app` = `window.innerHeight`), inmune al cold-start de iOS PWA. Ver "App shell y scroll — fix del cold-start" |
| `.toast` opacidad/blur raw | sombras y alphas a negro | Componentes flotantes (toast, sync-indicator); profundidad sobre oscuro |

**Badges con borde** (`.badge.warn/.good/.red`): **legado**. Permitidos **sólo** de forma
transitoria en avisos de sistema (`incompleta`, `Próximamente`) hasta migrarlos a etiqueta
tenue / dot. **Prohibidos** en la identidad de fila (§2.1). Decisión final pendiente del PO.

---

## 6 · Densidad, safe areas y patrones (heredado)

### Densidad y peso visual
- **Un solo botón sólido por pantalla** (la acción principal). El resto, texto/ícono sin caja.
- **Secciones separadas por ESPACIO** (`--space-5`/`--space-6`), nunca por borde/divisor.
- **Cajas con borde sólo** para inputs/controles y, transitoriamente, la tarjeta de datos
  genuina. **Nunca** para agrupar secciones, estados vacíos, ni barras de control.
- Liviano pero **claro y con vida**: no esconder acciones esenciales; la principal siempre visible.

### App shell y scroll (iOS / PWA standalone) — fix del cold-start (`.app = 100vh`) ✅ CONFIRMADO
**El alto de la app lo manda `.app { height:100vh }`, NO `100dvh` ni `window.innerHeight` ni un
`position:fixed` que dependa del viewport.** ✅ Verificado en iPhone real (la tabbar queda pegada al
borde inferior desde el cold-start, sin "saltar" ni quedar arriba). CAUSA del bug "la tabbar aparece
muy arriba al lanzar":
en una PWA standalone el viewport no está asentado en el cold-start, así que `100dvh` y el anclaje de
`position:fixed; bottom:0` caen cortos. Se probó `window.innerHeight` (vía `--app-height`) y en el
device real devolvía MENOS que la pantalla (excluía el inset inferior) → la barra quedaba arriba de
forma estable. **En standalone (sin barra de direcciones) `100vh` es el alto de pantalla completa y
es fiable desde el cold-start** (el roto es `100dvh`; `100vh` solo falla en Safari-navegador, que
aquí no aplica). (Otrofestiv no lo sufre porque es app **NATIVA Capacitor** = viewport fijo; su CSS
`position:fixed;bottom:0` basta ahí, NO en una PWA pura.)
Modelo:
1. **Viewport:** `width=device-width, initial-scale=1.0, viewport-fit=cover` (sin `maximum-scale`/`user-scalable`).
2. **`html, body { height:100% }` + `body { overflow:hidden; touch-action:pan-y; overscroll-behavior:none }`** → el body no scrollea.
3. **`.app`** = **`height:100vh; display:flex; flex-direction:column`**. Pantalla completa en standalone,
   fiable en cold-start. **Nunca `100dvh`** (se rompe al lanzar) ni `window.innerHeight` (dio corto).
4. **`.app-scroll`** = `flex:1 1 auto; min-height:0; overflow-y:auto` (único scroller).
5. **`.tabbar`** = **`flex:none`** (hijo flex al fondo de `.app`, `position:static`). Como `.app`
   tiene el alto correcto desde el cold-start, la barra queda pegada al borde físico sin `position:fixed`.
   `padding-bottom:max(env(safe-area-inset-bottom),20px)`; fondo `var(--paper)`, `border-top:1px var(--line)`.
6. **z-index de overlays:** `.overlay`=1100, `.toast`=1200, `.sync-indicator`=1300 (la tabbar ya no
   usa z-index; histórico: cuando fue `position:fixed;z-index:1000`, interceptaba los clics del pie
   del sheet — wizard "Siguiente"/"Crear" — si el overlay no iba por encima).
7. Header bajo el Island: `padding-top:env(safe-area-inset-top)` dentro de `@supports`.

> **Si vuelve a fallar en otro device:** se puede re-agregar temporalmente un diagnóstico en Ajustes
> que muestre `window.innerHeight`, `documentElement.clientHeight`, `visualViewport.height`,
> `screen.height` y el alto de `.app` — esa comparación revela cuál medida = pantalla completa. Fue
> la que confirmó que `innerHeight` daba corto y `100vh` (= alto de `.app`) era el correcto.

> **Por qué los intentos previos fallaron:** `position:fixed;bottom:0` (copia de Otrofestiv, app
> nativa) asume viewport asentado → en PWA cold-start cae corto y baja al tocar. `100dvh` se rompe en
> cold-start. `window.innerHeight` dio corto (excluía el inset). Hacks de compositor (doble-rAF) eran
> parches frágiles. El fix robusto es `.app { height:100vh }` (pantalla completa fiable en standalone)
> con la barra como hijo flex al fondo. Refs: gist *iphone-pwa-game-guide*, *frontend.fyi*, *susiekim9*.
> Refs: gist *iphone-pwa-game-guide*, *frontend.fyi*, *susiekim9* (Medium), *dev.to/maciejtrzcinski*.

### Acordeón (progressive disclosure)
Cerrado por defecto: cada ítem es una **línea-resumen**; el detalle aparece al expandir.
Multiabierto. El estado abierto/cerrado es **UI efímero** (vive en el Controller, `ui.abiertos`),
**no** en el Store. Cabecera = `<button>` con `aria-expanded`. Anatomía en §2.1.

### Iconografía
**Lucide** como SVG inline (sin CDN ni npm): paths copiados a `ICON_PATHS` en `js/view.js`.
Estilo canónico: `viewBox="0 0 24 24"; fill="none"; stroke="currentColor"; stroke-width="1.75";
linecap/linejoin:round`. El color sale del contexto (`currentColor`): teal por defecto,
`--alert` en destructivos, `--pos` en el check. Tamaños: 20px base, 18px en botón con texto,
16px `.sm`/`.xmini`. Semántica fija: `plus-circle`=agregar, `trash-2`=destruir, `x`=cerrar,
`check`=pagado, `chevron-down`=caret del acordeón.

---

## 7 · Voz y tono (heredado)

**Neutro y funcional. La interfaz etiqueta, no explica.** Las reglas del dominio las aplica
el código; **no se narran en pantalla** (regla de oro: si un texto explica una regla del
sistema, **bórralo**).

- **Acciones:** verbo en infinitivo, sin artículos (`Agregar`, `Crear primada`, `Borrar`).
- **"Agregar" lleva su objeto cuando hay ambigüedad en pantalla.** Si conviven dos "Agregar" en
  contextos distintos, cada uno nombra QUÉ agrega, con la palabra del **glosario** (no la del catálogo):
  - cabecera de Asistentes → **`Agregar`** (agrega un asistente; el contexto de la sección lo aclara).
  - dentro de la tarjeta de una persona → **`Consumo`** (registra el **consumo** de esa persona —
    término del dominio—; **nunca** "Producto", que es el ítem del catálogo, otro concepto).
- **Estados vacíos:** `Sin <cosa>` (`Sin asistentes`, `Sin productos`). Nada de "Aún no hay…".
- **Títulos de sección:** sustantivo + conteo (`Asistentes (0)`, `Productos (4)`).
- **Toasts:** confirmación corta en pasado/sustantivo (`Primada creada`, `Abono registrado`).
- **Confirmaciones:** pregunta de una idea (`¿Borrar la primada?`), sin explicar consecuencias.
- **Una idea por texto.** Sin emoji decorativo en estado.

**Glosario (una palabra por concepto, igual en toda la app):** Primada · Principal ·
Organizador · Co-organizador · Cover · Consumo · Ganancia · Fondo · Debe · Pagó · Asistente ·
Persona · Producto · **Tesorero** (único término para quien recibe la ganancia).

---

## 8 · Relación con CLAUDE.md

- `CLAUDE.md` → contrato de **arquitectura** (capas MVC, modelo de datos, proceso).
- `DESIGN.md` (este) → contrato **visual** (tokens, anatomía de componentes, jerarquía,
  capitalización).

Ambos son fuente de verdad. Ante un cambio **visual**, manda este documento; ante uno
**estructural**, manda `CLAUDE.md`.
