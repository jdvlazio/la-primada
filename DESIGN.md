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
- **Menos es más — no repetir entre niveles.** Si un dato ya está disponible **un nivel abajo**
  (acordeón, lista, desglose), **no se repite arriba** como conteo ni resumen. El elemento de arriba
  (héroe, cabecera) comunica el **número/dato clave**; el detalle (quiénes, cuánto cada uno) **vive
  dentro**. Aplica también entre piezas del mismo bloque: el microcopy y el teaser **no repiten** un
  dato ya visible en el héroe (ver §2.11.1.a).

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
| `--pos` (alias `--green`) | `#4DD9A0` | **Pagó / éxito puntual** — texto (check de pago, toast saldado) |
| `--pos-bg` | `#103028` | Pagó / positivo — fondo |
| `--amber` | `#e0b341` | **Pendiente / en proceso** — por cobrar, los que deben, abierta sin actividad (`.dot.idle`), incompleta, "Próximamente" |
| `--alert` | `#F08C8C` | **Destructivo / error** — botón borrar, error de sync. **NO** para deuda (eso es ámbar) |
| `--alert-bg` | `#3a1818` | Destructivo / error — fondo |

#### Semántica de estado — escalera de 4 registros (✅ CANÓNICO)

**Regla:** cada color de estado es **un registro emocional, no una decoración**. Antes de pintar un dato,
ubicá en cuál de los cuatro cae. No mezclar registros (el error histórico: la deuda saltaba entre ámbar y
salmón). El **copy** debe coincidir con el registro del color (ver "Voz y tono", §7).

| Registro | Token | Significado | Lo usa | Tono del copy |
|---|---|---|---|---|
| **Resuelto / definitivo** | `--accent` (teal) | cerrado, primario, valor logrado | Ganancia, "Entregado", activo, principal, acción primaria, **monto ya pagado** (`.pagado`) | afirmativo, en pasado/presente |
| **Éxito puntual** | `--pos` (verde) | confirmación de una acción que acaba de salir bien | check de pago, toast "✓ saldado" | celebratorio, breve |
| **Pendiente / en proceso** | `--amber` (ámbar) | algo abierto que **falta resolver** — **normal y esperado**, NI error NI urgencia | **Por cobrar** (héroe), **los que deben** (`.pend`), **abierta sin actividad** (`.dot.idle`), **incompleta / "Próximamente"** (`.badge.warn`) | **neutral y prospectivo** ("Por cobrar", "Falta principal") — **nunca** alarmista |
| **Destructivo / error** | `--alert` (salmón) | acción irreversible o fallo real — **STOP** | Borrar (`.mini.danger`, `.danger-sub`), error de sync (`.sync-indicator.err`) | de advertencia, confirmación explícita |

**Por qué la deuda es ÁMBAR y no salmón** (decisión ratificada): cobrar es un **proceso normal en curso**, no un
error ni una emergencia. Pintar "los que deben" en salmón leería como alarma/culpa; en ámbar lee como
"pendiente de cerrar", coherente con el héroe **"Por cobrar"**. El salmón se **reserva** para lo que el usuario
no puede deshacer (borrar) o lo que está roto (sync). El `--alert` **no** colorea montos de deuda.

> ⚠️ **Anti-patrón (corregido):** existía un `.owe{color:var(--alert)}` (saldo deudor en salmón) que quedó como
> **CSS muerto** al mover la deuda a ámbar — eliminado. Si vuelve a hacer falta un "número de deuda", va en ámbar (`.pend`).

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

> **Dos variantes de fila** (mismo lenguaje, distinta interacción): el **acordeón** (`.acc-head` + caret +
> `.acc-body`) lo usan el **Directorio** (§2.9) y **Configurar › Productos** (§2.8). El **tab Consumos** usa la
> **Lista viva** (§2.1.2) — sin caret, sin `.acc-body`.

### 2.1.2 · Tab Consumos — LISTA VIVA (Modelo 3) (✅ CANÓNICO)

**Por qué.** Apuntar un consumo es la acción **más frecuente** durante una primada (fiesta, gente llegando).
El acordeón costaba 3-4 taps (abrir → "+ Consumo" → chip → "+"). La lista viva lo baja a **2 taps la primera vez,
1 las siguientes** — sin sacar de contexto al resto de la lista.

**Interacción:** cada asistente es una **fila siempre visible** (nombre + total), **sin caret**. Tap en la fila =
**activar** (`activar-asis`, `ui.activaPid`, **UNA sola activa**; tap otra colapsa la anterior). Al activarse, sus
productos aparecen **inline** como chips + el bloque de **pago** debajo.

| Elemento | Canónico |
|---|---|
| **Fila** (`.asis-fila`) | flex, `min-height:var(--tap-row)`, **sin caret**; tap = `activar-asis`. Activa: `.asis-fila.on` (fondo `--paper-2`) |
| **Identidad** (`.asis-fila-id`) | igual que §2.1 (nombre primario, rol tenue, dot+palabra del principal). **SALDADA**: `.saldado` → **nombre en teal** (`--accent`) + check (`.asis-check`) — refuerzo del registro "resuelto" (§1) |
| **Total** (`.acc-amt`) | a la derecha, siempre visible; se actualiza EN VIVO al apuntar |
| **Reveal** (`.asis-reveal`) | solo en la activa: chips (arriba, apuntar = frecuente) + pago (footer, saldar = menos frecuente). Entra con `accIn` |
| **Chip CONSUMIDO** (`.chip.has`) | stepper compacto `[− 🍺×N +]`, borde **teal**: **`+` explícito a la derecha** (`.chip-add`, en **teal** = gesto universal de agregar, resalta) = **+1**; cuerpo `emoji ×N` (`.chip-plus`) TAMBIÉN suma (target grande, menos fricción); `−` chico subordinado a la izquierda (`.chip-minus`, gris) = **−1**. Todos `item-plus`/`item-minus` |
| **Chip DISPONIBLE** (`.chip`) | emoji + nombre + precio; tap = **+1** (0→1, pasa a consumido). Mismo `item-plus` (ya no hay "add-item" ni picker aparte) |
| **Cerrada** | chips de **solo lectura** (`.chip.has.ro`, sin +/−); pago SIGUE activo (INVARIANTE #4) |
| **Auditoría** (ⓘ) | `toggle-auditoria` dentro del reveal (igual que antes) |

**Orden:** por mayor consumo (`asistenciasPorConsumo`, DESC). **Decisión:** se **acepta el re-orden en vivo** — al
+1 la persona puede subir de posición (sin congelar). Rol/cover/quitar siguen siendo **Configuración** (§2.8), no viven aquí.

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

### 2.8 · Configurar el evento activo = Asistentes · Productos (✅ CANÓNICO)

**UN SOLO punto de configuración** (principio: *minimalismo — un solo engranaje en pantalla*). El segundo
engranaje (`settings-2` en el selector) se **ELIMINÓ**: la config del evento activo vive **dentro del gear
global › Primadas** (§2.8.1), embebida arriba del calendario vía `configPrimadaBody`. El selector queda 100%
navegación (nombre + compartir). El gear abre **context-aware**: con una primada activa, aterriza en **Primadas**
→ configurar la activa queda en ~1 tap.
- **Cuerpo de config** (`configPrimadaBody`): **dos tabs operativos** sobre el **evento activo** — **Asistentes**
  (participación) · **Productos** (precios). **Nada más.** Sin identidad (nombre/fecha/mes), sin acciones
  administrativas. seg-nav interno (`data-act="config-tab"` + `data-ctab`; ⚠️ NO `data-tab` — colisiona con la
  tabbar inferior, §2.11). `ui.configTab` = pestaña activa (default `asistentes`).

**Tab ASISTENTES — lista COMPACTA agrupada (NO acordeón).** Principio **"muestra la excepción, no la regla":**
el cover común al grupo va UNA vez en el encabezado; la fila solo marca lo que DIFIERE.
- Grupos por `estadoEnEseMomento`: `Ahorradores · Cover $X` / `Invitados · Cover $X` (`.grp-head` = título +
  `coverDe` del grupo, una cifra). Fila `.asis-compact` = `● Nombre [✕]`. El **principal** lleva `dot.prin` (teal);
  el resto `dot.neutral` (gris).
- **Excepción `Sin cover`** (`.sin-cover`, chip tenue) SOLO si `coverDe(p,a) === 0` con cover de grupo > 0 — cubre
  de forma coherente al **exonerado** Y a **organizadores/principal** (cover-free por rol). No se edita aquí.
- **Rol = solo al crear** (wizard/programar). El ÚNICO caso editable es el **fix mínimo**: si la primada está
  **incompleta** (sin principal), aparece un aviso (`.cfg-aviso` + `badge('falta principal','warn')`) y un botón
  **"Hacer principal"** (`.hacer-prin`, `data-act="hacer-principal"`) en cada fila de **ahorrador** (INVARIANTE #2).
- `[✕]` = `remove-asistencia` (quita de la primada, no del directorio; confirmación). `+ Agregar asistente`
  (`.add-link`, `open-add-asis`). **Cerrada**: lista visible, acciones deshabilitadas.

**Exoneración = se decide al AGREGAR** (`addAsisSheet`): cada fila ofrece add normal **o** **"Sin cover"**
(`.cortesia`, `add-asistencia-cortesia` → agrega + exonera). La lista compacta solo la MUESTRA. *(Quitar la
cortesía a alguien ya agregado: hoy = quitar y re-agregar; deuda técnica menor.)*

**Tab PRODUCTOS — CLON del componente de Personas (§2.9), SIN cambios.** Las filas de producto usan EXACTAMENTE
las mismas clases que la fila de Personas — mismo componente acordeón.

| Clase (compartida con Personas §2.9) | Uso en el tab Productos |
|---|---|
| `.prow-list` / `.prow` | contenedor + fila acordeón (sin caja; separación por línea tenue `border-bottom`) |
| `.acc-head` + `.acc-caret` + `.acc-id-stack` (`.acc-id` + `.acc-sub`) | cabecera colapsada: emoji+nombre · `Venta $X · margen $Y` (tenue) |
| `.acc-body` | al expandir: Costo/Venta (`.grid2`+`.fld`+`.ti`) + Quitar (`.mini.danger`) |
| `.prow-foot` / `.prow-new` | alta de producto nuevo, igual que "Agregar persona" |
| toggle | `data-act="toggle-cfg-prod"` (mismo patrón que `toggle-persona`) |

**❌ ELIMINADAS** (el acordeón de asistente de Configurar ya no existe): `toggle-cfg-asis`, `asistenteConfigRow`,
`coverLinea`, `rolSelect` (el `select.sel` de rol desapareció). La lógica de precios y de cover **no** cambia;
solo **dónde** se editan (rol → creación; exoneración → Agregar; identidad → creación).

### 2.8.1 · Gear GLOBAL = ÚNICA configuración, CUATRO tabs (✅ CANÓNICO)

`overlaySheet` con seg-nav full-width (`.cols4`, `.sm`) **Primada | Calendario | Personas | Ajustes**
(`data-act="overlay-tab"` + `data-overlay`). **Un solo engranaje en pantalla** (el `settings-2` del selector se
eliminó). **Cada tab = UNA intención, alcances SEPARADOS** (antes "Primadas" mezclaba config del evento +
calendario en un scroll → mala IA). El gear abre **context-aware** (`#gearBtn`): con primada activa → **Primada**
(configurar, ~1 tap); sin activa → **Calendario** (crear).
- **Primada** (`primadaConfigTab`) — config del EVENTO ACTIVO, encabezada por `.cfg-primada-name` (el nombre de la
  activa): seg-nav interno **Asistentes | Productos** (`configPrimadaBody`, §2.8). **Solo config**, sin calendario.
- **Calendario** (`calendarioBody`) — **"Nueva primada"** (ÚNICO punto de creación; `.add-link`, `new-primada` →
  wizard SOBRE el gear; al crear/cancelar, wizard y gear se cierran) + lista de TODAS agrupada (**Activa** ·
  **Pasadas** gris; el dot deriva de actividad, `dotClase`). Cada fila `.padm-fila` (NO navega, EDITA): nombre +
  meta + **Reabrir** (cerradas) y **Eliminar** (`borrar-primada`, confirmación; `data-activa` = advertencia fuerte).
- **Personas** (§2.9) — directorio compacto + editar enfocado. **Ajustes** — cover vigente, versión, legal, cuenta.

El **selector** (§2.11) sigue siendo navegación pura (solo cambiar de primada).

### 2.9 · Directorio Personas — LISTA COMPACTA + editar ENFOCADO (✅ CANÓNICO)

**Por qué.** El directorio puede ser largo; un muro de acordeones inline (editar fila por fila) se hace tedioso.
Patrón **lista → detalle**: la lista queda escaneable y editar es un drill-in de UNA persona (no inputs por fila).

| Estado | Anatomía |
|---|---|
| **Lista** (`.persona-list` + `.persona-fila`) | agrupada por estado (`.grp-head` = "Ahorradores"/"Invitados" + conteo, igual que la lista compacta de Asistentes §2.8). Cada fila = una línea: `<b>nombre</b>` + nº de primadas (`.persona-fila-meta`, tenue) + chevron de drill-in (`chevron-right`). Tap = `editar-persona`. Sin caja, sin editor inline |
| **Detalle enfocado** (`personaEditView`) | back **`‹ Personas`** (`.back-link`, `cerrar-persona-edit`) + campos: Nombre (`.ti`, `rename-persona`), Estado (`.seg-nav.sm`, `set-estado-persona`), Bre-B (`.ti`, `breb-persona`), y nº de primadas. Conserva TODO lo ajustable; solo cambia la presentación |
| **Alta** | al pie de la lista, botón **`+ Agregar persona`** (`.add-link`) que despliega un form inline (`.prow-new`) |

> El acordeón inline anterior (`.prow` + `.acc-head` en Personas) se **ELIMINÓ**. Las clases `.prow`/`.acc-*`
> siguen vivas en **Configurar › Productos** (§2.8), no en Personas.

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
- **(SIN engranaje de config.)** El `settings-2` del selector se **ELIMINÓ**: la config del evento activo vive
  en el gear global › Primadas (§2.8/§2.8.1) — **un solo engranaje en pantalla**. El selector es solo navegación
  (+ Compartir informe cuando hay datos).
- **(SIN `+` de crear.)** El "+" de la cabecera se **ELIMINÓ**: crear es una decisión administrativa y vive en el
  **ÚNICO punto** = gear global › Primadas › **"Nueva primada"** (§2.8.1). La cabecera del selector es solo navegación.

**Abierto (overlay `selector-primada`, `selectorSheet`):** sheet con **DOS secciones en orden** (cada una con
encabezado `.sel-anio`): **Activa** · **Pasadas**. El **historial vive aquí**, no como lista aparte. **El selector es
NAVEGACIÓN PURA** — elegir con cuál primada trabajar. **NO crea nada** (crear vive en el gear, §2.8.1).

| Sección | Contenido |
|---|---|
| **Activa** | la primada seleccionada (`activePrimada`), una fila `.sel-fila` con su `.sel-check`. El dot deriva de actividad (`dotClase`: ámbar sin consumos, verde con consumos, gris cerrada) |
| **Pasadas** | `primadasPorAnio()` (todo el historial salvo la activa), agrupado por año (`.sel-subanio` = sub-encabezado tenue) |

| Clase | Propiedades canónicas |
|---|---|
| `.sel-anio` | encabezado de SECCIÓN (Activa/Pasadas): `font-weight:800; font-size:13px; color:var(--ink-soft); letter-spacing:.06em` |
| `.sel-subanio` | sub-encabezado de AÑO bajo Pasadas: `font-size:12px; font-weight:700; color:var(--ink-soft); opacity:.75` |
| `.sel-fila` | fila tappable (`select-primada`): `min-height:var(--tap-row)`; sin caja; separación por línea tenue. Identidad `.sel-fila-main` = punto de estado (`dotClase`) + **`<b>Mes</b> · {nombre corto}`** (mes guía + identidad, sin "Primada"); a la derecha `.sel-fila-right` = total (recaudo) + `.sel-check` (check teal) si es la activa |
| activa | `.sel-fila.on` → el mes en acento. Tocar una la activa (`seleccionarPrimada`) y **cierra** la hoja |

> **Ciclo de vida (`abierta → cerrada`, sin `programada`):** una primada se crea **abierta**. Su `dot` deriva de
> **actividad real** (`dotClase`): **ámbar `.dot.idle`** sin consumos (creada, sin actividad), **verde `.dot.open`**
> con consumos, **gris `.dot.closed`** cerrada. No hay "cara programada" ni estado intermedio: el tab Primadas siempre
> muestra Consumos/Balance. **Estado vacío** (0 primadas) = "Tu primera primada" + texto que orienta al gear (sin botón
> inline; el único punto de creación es el gear, §2.8.1).

> **Nombre automático (decisión de producto):** al crear, `Store.select.nombreSugerido` arma
> **"Primada {N1} + {N2}"** con el **primer token** del nombre de cada organizador — N1 = principal,
> N2 = segundo organizador; 1 solo → "Primada {N1}"; 3+ → solo los dos primeros. **Editable** (✎ =
> `renombrarPrimada`, override manual). Aplica a primadas nuevas; las viejas conservan su nombre.

### 2.11.1 · Conmutador de CARA — Consumos | Balance (✅ CANÓNICO)

**El Balance ya NO es un tab.** La tabbar inferior tiene **2 tabs** (Primadas · Fondo). "Ver la plata"
(reparto del fondo + informe del principal) y "operar" (consumos) son **dos CARAS de la misma primada
activa**, no destinos de navegación global. Se conmutan con un **seg-nav centrado** (`.cara-switch`)
que vive **bajo el selector** (§2.11), encima de la cara que pinta. Patrón Tricount: separar "ver" de
"operar" sin sacar al usuario del contexto de la primada.

| Elemento | Canónico |
|---|---|
| `.cara-switch` | wrapper `display:flex; justify-content:center; margin:var(--space-3) 0 var(--space-4)` — centra el seg-nav y lo separa de la cara |
| `.seg-nav` › `.seg` | el segmented control estándar (§2.9, mismo que ahorrador\|invitado): **"Consumos"** (`data-cara="operacion"`) \| **"Balance"** (`data-cara="balance"`). El activo lleva `.seg.on` |
| acción | `data-act="set-cara"` — **navegación, NO escritura** (no pasa por el gate de login; un viewer sin sesión conmuta y VE el Balance) |

**Cara por defecto = ESTADO de la primada** (`fijarCaraPorEstado` en el Controller): una **abierta** abre
en **Consumos** (operar es lo diario); una **cerrada** abre en **Balance** (su documento final). Se fija al
**seleccionar / crear / cargar / cerrar / reabrir**. Una cerrada conserva el switch presente y la cara
**Consumos accesible en solo-lectura** (los steppers quedan deshabilitados por INVARIANTE #4, no se ocultan).
El **cálculo no cambia** (ganancia/cover/saldos idénticos): es el mismo `reparto` + `informe`, solo se movió
de un tab a una cara. La identidad (nombre/mes/estado) ya la muestra el selector → la cara Balance **no
repite cabecera** (se eliminó `.resumen-head`).

#### 2.11.1.a · La cara BALANCE — cifra HÉROE + derivación + state-aware (✅ CANÓNICO)

El Balance son **dos cards** (`balancePrimada` → `reparto` + `informe`), cada una con un **número HÉROE
SIEMPRE visible** (la cifra que importa, fuera del acorde) y un **acorde con la derivación** (cómo se
calculó). El número clave nunca se esconde tras un acorde colapsado; el desglose sí.

**Dos conceptos distintos — GANANCIA (resultado) vs. RECAUDO (proceso):**
- **Ganancia** (`reparto`) = el **resultado** colectivo del evento: cuánto se generó para el fondo y cómo se
  reparte entre los ahorradores. Es una cifra que **puede cambiar mientras la primada está abierta** (los
  consumos siguen entrando) → por eso lleva la nota **"Provisional"** en abierta. Es plata del **grupo**.
- **Recaudo** (`informe`) = el **proceso de cobro** del evento (la pregunta del tesorero: *"¿cómo va el
  recaudo?"*). **No** es una persona ni un rol: por eso la tarjeta se llama **"Recaudo"**, sin nombre. El
  recaudo es el **estado REAL del cobro**, no una estimación → **nunca** lleva "provisional".

| Elemento | Canónico |
|---|---|
| `.bal-hero` | bloque superior de la card: `.bal-label` (etiqueta + `.dot` de estado) sobre `.bal-amount` (cifra grande, `font-weight:800; font-size:34px`, iguala al wordmark — sin tokens nuevos) y `.bal-note` opcional |
| `.bal-amount.por-cobrar` / `.bal-amount.entregado` | tono **state-aware** del héroe del Recaudo: **ámbar** (`--amber`, proceso en curso — **NUNCA `--alert`**: el pendiente no es alarma ni deuda de nadie) vs **teal** (`--accent`, definitivo). Reusa tokens existentes |
| `.bal-toggle` | la fila acorde (`.acc-head` + `data-act="toggle-balance"`, `data-sec="reparto"\|"informe"`), separada del héroe por `border-top`. El desglose (`.acc-body`) sigue **toggleable** (`ui.balance` = Set de secciones abiertas), **colapsado por defecto** |

- **`reparto` — Ganancia (card oscura):** héroe = **Ganancia** (resultado del grupo). Teaser colapsado:
  **"Entrega $X a N Ahorradores"** (verbo claro; "parte igual" era jerga interna). Derivación: cover, margen,
  ahorradores, parte igual, sobrante, lista por persona.
- **`informe` — Recaudo (card clara):** héroe **state-aware POR ESTADO** (no por urgencia):
  - **ABIERTA** → héroe = lo que **falta cobrar** (`saldoPendiente`), tono **ámbar** (`.por-cobrar`). El
    concepto "por cobrar" lo da el **tono**. Teaser = **"Entrega $X al Tesorero"** — solo el **otro** número
    (lo que se compromete al Tesorero); **no** repite el `saldoPendiente` que ya muestra el héroe. **Sin
    microcopy** (`.bal-note` omitido): el conteo "de N personas" confundía (parecía que faltaba alguien) y
    **quién** debe ya vive un nivel abajo, en la lista del acordeón → "menos es más" (§0).
  - **CERRADA** → héroe = lo **entregado** al Tesorero (`entregaTesorero`), tono **teal** (`.entregado`).
    Teaser en pasado: **"Entregó $X al Tesorero"**. Sin microcopy (el teaser ya lo dice todo).
  - Derivación (acorde): Bre-B, recaudo teórico, recupera, recaudado real (terceros/principal), por cobrar, lista de deudores ("Debe", en `.owe`: el "quién debe" sí es protagonista, **y vive aquí, no arriba**).

> **REGLA del microcopy (`.bal-note`) Y del teaser — no repetir el héroe** (caso particular de "menos es más",
> §0). Ni el microcopy ni el teaser **repiten un dato ya visible en el héroe** (su concepto ni su número), ni
> **resumen lo que ya está un nivel abajo** (la lista del acordeón). Su función es **añadir lo que el héroe no
> muestra** (microcopy: una condición global — p. ej. "Provisional"; teaser: el **otro** número del bloque).
> **Si no hay nada que añadir, se omite.** Ejemplos: el teaser de Recaudo abierta es "Entrega $X al Tesorero"
> (el otro número), sin repetir el `saldoPendiente` que ya es el héroe; el héroe de Recaudo **no** lleva conteo
> "de N personas" (quién debe vive en la lista). En Ganancia abierta la nota "Provisional — se confirma al
> cerrar" sí cumple: añade una **condición** (la cifra puede cambiar), no repite "Ganancia".

**State-aware por `p.estado`** (pura vista; `p.estado` ya llega a `reparto`/`informe`):
- **ABIERTA** = en vivo → Ganancia lleva nota **"Provisional"** (puede cambiar); Recaudo en **ámbar "Por cobrar"**; `.dot` verde.
- **CERRADA** = documento final → **sin** "provisional"; Recaudo en **teal "Entregado"** (pasado); `.dot.closed` (gris). Reutiliza el `.dot`/`.dot.closed` del selector, sin componentes nuevos.

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

### 2.12.1 · Feedback del pago — confirmación visible + progreso legible (✅ CANÓNICO)

> **Principio.** *Las acciones exitosas merecen confirmación visible; el progreso acumulado debe ser legible
> sin contar ausencias — en la app y en los documentos que genera.* El pago es el momento de mayor valor
> emocional: cuando alguien salda, el saldo **no debe desaparecer en silencio**. Quien cobra necesita saber que
> quedó bien, y leer cuánto se avanzó **sin tener que notar quién falta**.

Cuatro señales, todas **presentación pura** (los cálculos no cambian; `saldoDe`, `deudores`, `informePrincipal` intactos):

| Señal | Dónde | Canónico |
|---|---|---|
| **Toast positivo** | al marcar `pagado` que deja saldo 0 | `View.toast('✓ {Nombre} saldado', 'ok')` → `.toast.ok` (`--pos-bg`/`--pos`, tono celebratorio, tokens existentes) |
| **Check en la tarjeta** | cara Consumos, `asistenciaCard` | persona con `saldoDe === 0 && total > 0` lleva `.asis-check` (ícono `check`, teal) junto al `<b>` del nombre. Discreto; la tarjeta sigue completa. Saldo>0 no cambia |
| **Lista de cobro completa** | Recaudo (Balance), acorde "Debe" | **nadie desaparece**: PENDIENTES (`saldo>0`) arriba con monto que falta en **ámbar** (`.kv b.pend`); SALDADAS (terceros `pagado`, `saldo 0`) al **final**, `.kv.saldada` = check teal + nombre **gris** (`--ink-soft`) + **el monto que pagó** (su total) en **teal** (`.kv b.pagado`, `--accent` = saldado, NO ámbar). El **valor nunca desaparece**: se lee cuánto debe / cuánto aportó cada quien. Jerarquía pendiente→saldado |
| **Check en el PNG** | `informeTemplateHTML` | pendientes (saldo>0) primero; saldadas (saldo 0) al **final** con `✓` (`.informe-check`, teal) delante del nombre. El total sigue teal. El documento refleja el estado COMPLETO del cobro |

- El check usa el mismo criterio en app y PNG: `saldoDe === 0 && total > 0` (incluye al **principal**, auto-saldado).
- La lista del Recaudo **excluye al principal** (`personaId !== prinId`): es la palanca de "quién debe / quién pagó" de **terceros**.

### 2.13 · Input de producto — emoji + nombre (✅ CANÓNICO)

**Una sola anatomía** para capturar un producto, **idéntica** en *Configurar › Productos* (el alta) y en el
*Wizard Paso 2*. La produce el helper `prodIdInput()` (`view.js`); nunca se maquetan estos dos inputs sueltos.

- **Estructura:** `.prod-id` = fila flex con **caja de emoji CHICA y fija** (`.ti.emoji`, `flex:0 0 52px`,
  centrada, 20px) + **campo de nombre DOMINANTE** (`.ti.prod-name`, `flex:1`). El nombre manda; el emoji es un
  acento. Tocar el emoji enfoca el campo → el teclado del sistema permite elegir/cambiar emoji.
- **Autosugerencia (editable):** al teclear el **nombre**, el emoji se autorrellena por palabra clave
  (`Util.emojiSugerido` ← `CONFIG.emojiKeywords`), **cada vez** que cambia el nombre. El input lleva
  `data-auto`: `'1'` = sigue autosugiriéndose; `'0'` = **fijado a mano**. **`manual` es EXPLÍCITO**, NO se
  deriva de si hay emoji: un emoji de catálogo o ya sugerido sigue siendo `auto` (la sugerencia sigue al
  nombre). **Solo tocar el campo de emoji** lo pasa a `manual`; en el wizard ese flag (`prod.emojiManual`)
  se persiste en el modelo para sobrevivir al re-render. Si el nombre no matchea ninguna palabra, el emoji
  actual se conserva (no se borra).
- **Sin re-render:** la autosugerencia escribe **directo** el `value` del emoji hermano (listener `input` del
  controller) — **no** dispara render (no pierde foco), igual de seguro que `commitQuiet`. `wzSync`/`add-producto`
  leen ese `value` del DOM al confirmar.
- **Costo/venta debajo** (`.prod-new-bot` / `.wz-prodrow-bot`): etiqueta apilada `.prodrow-f` + `.ti.num`,
  separación por **aire** (sin cajas anidadas; el Paso 3 es el referente de ligereza).

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
| **Title Case** | Cada Palabra | nombres propios y términos del glosario, tabs, nombres de persona/primada | Balance · Primadas · Fondo · Principal · Cover · Tesorero · Primada Juan |
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
| `.informe-*` (informe compartible PNG) | superficie **CLARA** con literales (`#fff`, `#0d1716`, `#e3e8e7`, …) | **Captura-only**: vive offscreen (`.informe-host`) solo para rasterizarse a imagen vía html2canvas; **no es UI de la app**. El tema es oscuro y no hay token de superficie clara → literales aprobados. Acento/ámbar sí salen de tokens (`--accent`/`--amber`). Fuente Instrument Sans + cola de emoji (`Apple Color Emoji`…) para color en el canvas. Trigger `data-act="compartir-informe"` (ícono `share-2`) en la cabecera, visible si hay consumo/cover. Comparte vía `navigator.share({files})`; fallback = descarga del PNG |

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
- **El copy coincide con el REGISTRO del color** (escalera de estado, §1). Lo **ámbar** (pendiente / en
  proceso) se nombra **neutral y prospectivo** — `Por cobrar`, `Falta principal`,
  `Próximamente` — **nunca** alarmista (`¡Deuda!`, `¡Atrasado!`). El lenguaje de **alarma/stop** se reserva
  para lo **salmón** (destructivo/error: `¿Borrar la primada?`). Un dato pendiente no se dramatiza: se etiqueta.
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
