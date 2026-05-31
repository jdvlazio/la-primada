# La Primada — Guía del proyecto (CLAUDE.md)

**La Primada** es el conjunto: la app entera. Es una **natillera familiar** donde, por ahora,
construimos el **núcleo de eventos**: las reuniones mensuales (las **primadas**) generan
ganancias para un **fondo**, que se reparte entre los **ahorradores que asistieron** a cada evento.
El módulo de ahorro/tesorería se aplaza, pero el modelo ya lo acomoda sin reformas traumáticas.
Hospedada en GitHub Pages: https://jdvlazio.github.io/la-primada/

> No hay "natilleras" ni un año-contenedor. La raíz es la app: un directorio de personas y la
> lista de primadas. El año es solo una **etiqueta** derivada del **mes contable** de cada primada.

## Dominio
**Personas (directorio en la raíz, persisten para siempre).**
- `personas[]` con `estado: 'ahorrador' | 'invitado'` (estado **vigente**, puede cambiar con el tiempo).
- Una persona pasa de **invitado → ahorrador** (o viceversa) cambiando solo su `estado`. **No se borra su historia.**
- Cada persona guarda su llave de pago **`breB`** (Bre-B / QR); se usa cuando es organizador principal.

**Primadas (reuniones mensuales = eventos de rentabilidad).**
- Las organizan **uno o más ahorradores**, a veces con sus parejas (que pueden ser invitados).
  **Todos los organizadores van sin cover y consumen normal** (su margen sí entra al fondo).
- Hay un **organizador principal** (rol `principal`): recibe los pagos (pone su llave `breB`),
  **recupera de su bolsillo el costo neto** de los productos que frontó, y **entrega solo la ganancia al Tesorero**.
  El principal **siempre es ahorrador** (invariante).
- Los **productos varían por evento**. Una **rifa o juego** es un producto normal con `costoNeto` bajo o **0**
  (la venta es casi toda ganancia).
- Cada producto tiene **dos precios**: `costoNeto` (lo que costó, lo frontea su `aportadoPor`) y
  `precioVenta` (lo que paga el asistente). **margen = `precioVenta − costoNeto`** → ganancia del fondo.

**Ahorro / Tesorería (módulo FUTURO, aún no se construye).**
- Aportes mensuales variables, retiros, préstamos, inversiones, y **actividades extra** (ej. venta de calendarios)
  son ingresos al fondo **fuera de los eventos**. Irá como tab **"Próximamente"**. No tiene entidades todavía.

### Reglas de negocio (núcleo de eventos)
```
gananciaPrimada = Σ cover cobrado + Σ (precioVenta − costoNeto) × unidades   // de TODAS las asistencias
nAhorradoras    = nº de asistencias con estadoEnEseMomento === 'ahorrador'
parteIgual      = floor(gananciaPrimada / nAhorradoras)                       // piso: nada de centavos
sobranteFondo   = gananciaPrimada − parteIgual × nAhorradoras                 // lo indivisible queda en el fondo
```
- El reparto va **solo** a las asistencias **ahorradoras en ese momento**. El **principal entra siempre**
  (es ahorrador); un **co-organizador entra solo si es ahorrador**. **Invitados generan ganancia pero no la reciben.**
- **Lo indivisible NO se redondea a nadie:** queda en el fondo.
- Total que paga un asistente = `cover (si aplica) + Σ(precioVenta × consumos)`. El **principal** se considera
  **auto-saldado** (tiene la plata en mano): su saldo es 0, no es deudor.
- **Cover-free** = es organizador **O** tiene `coverExonerado` (override manual: cortesía / niños).

### Informe del organizador principal (lo calcula la app)
```
recaudadoTeorico = Σ total de todas las asistencias           // = Σ costoNeto + gananciaPrimada (identidad)
recuperaPrincipal = Σ costoNeto × unidades de los productos que él frontó (aportadoPor)
entregaTesorero  = gananciaPrimada
recaudadoReal    = Σ abonos registrados
saldoPendiente   = recaudadoTeorico − recaudadoReal
```
- Los asistentes pagan **después**, al principal, y pueden **abonar de a poco** (historial `abonos[]`).
  Saber **quién debe cuánto** es protagonista de la UI más adelante.

## Stack y restricciones (no negociables)
- **Vanilla JS**, sin librerías de frontend (no React/Vue). Sin build, sin bundler, sin npm en producción.
- **Multi-archivo servido tal cual por GitHub Pages.** `index.html` es solo shell + CSS embebido +
  `<script src>` de cada módulo. Pages sirve esto sin ningún cambio de configuración.
- Fuentes desde CDN de Google (Bricolage Grotesque + Space Mono). CSS embebido en `index.html`.
- Moneda y formato: pesos colombianos, locale `es-CO`.

## Estructura de archivos
```
index.html         ← shell HTML + CSS embebido + <script src> de cada módulo (en orden)
js/config.js       ← CONFIG (constantes y valores por defecto)
js/util.js         ← Util (uid, esc, peso, fechas) — sin estado
js/store.js        ← Store (MODELO: estado, migraciones, selectores, acciones, invariantes, persistencia)
js/view.js         ← View (VISTA: render puro estado→DOM)            [PENDIENTE: paso de UI]
js/controller.js   ← Controller (eventos por delegación → Store.actions) [PENDIENTE: paso de UI]
tests/run.js       ← runner de pruebas (npm test / node tests/run.js)
package.json       ← solo para npm test; jsdom como devDependency (no entra a producción)
```
Orden de carga de los `<script>`: **config → util → store → view → controller**.

## Arquitectura MVC (regla central)
El JS vive en módulos separados. **Respetar la separación es la regla #1.**
- `CONFIG` (`js/config.js`) — constantes y valores por defecto (productos con dos precios, cover sugerido, locale).
- `Util` (`js/util.js`) — utilidades puras sin estado (ids, escape, formato de pesos y fechas).
- `Store` (`js/store.js`, MODELO) — **único dueño del estado**. Único lugar donde el estado muta, vía *acciones*.
  Expone `select` (lectura/derivados) y `actions` (mutaciones, que **hacen cumplir los invariantes**). Persiste en localStorage.
- `View` (`js/view.js`, VISTA) — funciones puras estado→DOM. **No** muta estado ni toca persistencia.
- `Controller` (`js/controller.js`) — escucha eventos (delegación) y llama `Store.actions`. **No** dibuja ni persiste.
- Flujo único e inviolable: **evento → acción → commit (guarda) → notifica → render**.
- La Vista se suscribe a Store y **re-renderiza la sección completa** en cada cambio (deliberado).

## Arquitectura de información — 3 tabs (la UI no se construye aún)
- **Tab 1 · Primada** — el evento activo: organizadores, asistencias, consumos, cover + **resumen de ganancia + informe del principal**.
- **Tab 2 · Historial** — primadas pasadas con sus totales, ganancias y deudas.
- **Tab 3 · Ahorro ("Próximamente")** — tesorería futura.
- Toda feature nueva debe caber en esta IA de 3 tabs. Si no cabe → **pausar y consultar** (no inventar un cuarto tab).

## Modelo de datos (esquema v4 — DEFINITIVO)
```
AppState  { schemaVersion:4, settings{cover{ahorrador,invitado}, defaultProducts[]},
            personas[], primadas[], activePrimadaId }
Persona   { id, nombre, estado:'ahorrador'|'invitado', breB:string|null }
Primada   { id, nombre, fecha:'YYYY-MM-DD', mesContable:'YYYY-MM',
            organizadorPrincipalId:personaId|null, pago{ breB:string|null },
            cover{ahorrador,invitado}, productos[], asistencias[], estado:'abierta'|'cerrada' }
Producto  { id, nombre, emoji, costoNeto, precioVenta, aportadoPor:personaId|null }   // default aportadoPor = principal
Asistencia{ personaId, estadoEnEseMomento:'ahorrador'|'invitado', rol:'principal'|'organizador'|'asistente',
            coverExonerado:bool, items{productoId:cantidad}, abonos[]{id,monto,fecha} }
```
- **Organizadores = `rol` dentro de la asistencia** (asisten y consumen). El `principal` es la asistencia con `rol:'principal'`;
  `organizadorPrincipalId` es el puntero de integridad. **"Sin cover" se deriva del `rol`** (o de `coverExonerado`).
- **`estadoEnEseMomento` es un SNAPSHOT inmutable** del estado que la persona tenía al asistir — igual que los precios.
  Si la persona cambia de estado después, **la historia NO se reescribe**.
- **`fecha` con día** (`YYYY-MM-DD`) + **`mesContable`** independiente (`YYYY-MM`): una primada puede contar para un
  mes contable distinto al de su fecha (ej. la del 31 de mayo cuenta como junio). El **año-etiqueta** sale de `mesContable`.
- **Snapshot por primada:** al crearla se copian **cover** y **productos** (con sus dos precios) y la **llave `breB`** del principal.
  Editar lo global o la persona **NO** reescribe primadas ya creadas — solo aplica a las futuras.
- **Total asistencia** = `cover (si rol 'asistente' y no exonerado) + Σ(precioVenta × consumos)`. **Total primada** = Σ asistencias.

### Invariantes que blindan las acciones
1. **Inmutabilidad histórica (corazón del modelo):** cambiar el `estado` vigente de una persona **NUNCA** altera el
   `estadoEnEseMomento` ya congelado en asistencias pasadas. `setEstadoPersona` solo toca `Persona.estado`.
2. **Principal siempre ahorrador:** asignar `principal` (al crear o vía `setRol`) exige `estadoEnEseMomento === 'ahorrador'`;
   si no, la acción **lanza error**.
3. **A lo sumo un `rol:'principal'`** por primada, coherente con `organizadorPrincipalId`.
4. **"Cerrada" congela la edición de la cuenta** (consumos, cover, productos, roles) **pero SIGUE aceptando abonos**:
   la cuenta del evento se cierra; los pagos siguen llegando después.

## Selectores y acciones del Store
- **`select` (derivados puros):** `coverDe`, `consumoDe`, `totalAsistencia`, `abonadoDe`, `saldoDe` (principal = 0),
  `margenProducto`, `ventaProductos`, `costoNetoTotal`, `coverCobrado`, `margenTotal`, `ganancia`,
  `asistenciasAhorradoras`, `parteIgual`, `sobranteFondo`, `repartoPorPersona`, `recuperaDe`, `informePrincipal`,
  `deudores`, `recaudado`, `primadaIncompleta`, `nombreSugerido`, `anioContable`, + directorio (`persona`, `ahorradores`, …).
- **`actions` (mutan + invariantes):** personas (`addPersona`, `setEstadoPersona`, `renombrarPersona`, `setBreBPersona`);
  settings (`setCover`, `upsertDefaultProducto`, `removeDefaultProducto`); ciclo de primada (`createPrimada`,
  `seleccionarPrimada`, `renombrarPrimada`, `setFecha`, `setMesContable`, `cerrarPrimada`, `reabrirPrimada`, `borrarPrimada`);
  productos de la primada (`addProducto`, `setPreciosProducto`, `setAportadoPor`, `removeProducto`);
  asistencias (`addAsistencia`, `removeAsistencia`, `setRol`, `toggleCoverExonerado`, `changeItem`);
  abonos (`registrarAbono`, `removerAbono`); infra (`replaceState`).

## Reglas de datos y migraciones (evitan cambios traumáticos)
- **Todo cambio de forma del estado = subir `schemaVersion` + caso en `Store.migrate()` + tests primero.**
- Datos corruptos o nulos → `defaultState()`. Nunca romper al cargar.
- El **normalizador es tolerante**: rellena campos faltantes con defaults seguros, de modo que datos parciales (incluido
  cualquier borrador previo) suben limpio.

### Migración v1 → v2 → v3 → v4 (implementada)
`migrate()` detecta la versión y converge a v4. Casos clave del salto a v4:
- v3 tenía `primadas[]` con `asistentes[]{ tipo, nombre, items }` y `Producto.price` (un solo precio).
- **Directorio `personas[]`:** se crea de los **nombres distintos** de los asistentes; `estado` = el tipo que traían,
  **última aparición (por fecha) gana**. `breB` arranca `null`.
- **Asistencias:** se enlazan por `personaId` y guardan `estadoEnEseMomento` = el tipo de **esa** asistencia (snapshot).
  Todas entran como `rol:'asistente'`, `abonos:[]`.
- **Productos:** `precioVenta = price` viejo; `costoNeto = precioVenta` (**margen 0**). **No se inventan costos ni ganancias retroactivas.**
- **Primadas migradas quedan "incompletas":** `organizadorPrincipalId = null` (no se sabe quién organizó). La UI pedirá asignar principal.
  **No se auto-asigna.** Los selectores/informe **toleran `null`** sin romper.
- **`fecha`:** `'YYYY-MM'` viejo → `'YYYY-MM-01'`; `mesContable` = ese mes. **`cover`** se preserva tal cual (no se reescribe historia).
- v1 (arreglo pelado) y v2 (`{products, people}`) se envuelven como una primada con **cover 0** (no había cover) y pasan por el mismo camino.
- Se **conserva** `activePrimadaId`. La migración es **idempotente** y **estable en ids**.

## Convenciones
- Comentarios y nombres de dominio en español (persona, asistencia, primada, organizador, cover, abono, fondo, Tesorero).
- IDs vía `Util.uid(prefix)`. Escapar texto de usuario con `Util.esc()` antes de inyectar HTML.
- Acciones nuevas van en `Store.actions`; selectores/derivados en `Store.select`. Nada de lógica en la Vista.
- **Un solo término en toda la app para quien recibe la ganancia: "Tesorero".**

## Protocolo de cambio (cumplirlo SIEMPRE antes de cada commit)
1. Si el cambio afecta el **esquema de datos** → subir `schemaVersion` + escribir migración + **tests primero**.
2. Si es **feature nueva** → verificar que cabe en la IA de 3 tabs; si no, **pausar y consultar**.
3. Si es **UI** → el `Store.action` y `Store.select` correspondientes deben **existir y estar testeados** antes de que la Vista los use.
4. Ante cualquier **decisión de producto ambigua** → **preguntar, no inventar**.
5. Antes de cada commit: `node --check` (cada `js/*.js`), tests de migración + reglas, test e2e con `jsdom` (cuando exista UI).
6. Tests viven en `tests/`. El script de prueba se llama `npm test` ó `node tests/run.js`.

## Pruebas (correr antes de dar por terminado un cambio)
- Sintaxis: `node --check` sobre cada módulo en `js/`.
- Modelo/migración: alimentar datos v1/v2/v3 → v4 y verificar **forma, totales, ganancias y reparto**.
- **Invariante de inmutabilidad histórica:** test explícito de que cambiar el estado vigente no toca snapshots pasados.
- Flujo MVC (cuando haya UI): test e2e con `jsdom` por clics reales, re-consultando nodos tras cada render.

## Despliegue
- El deployable es `index.html` + `js/*.js`. GitHub Pages (rama `main`, root) publica solo.
- Tras push, Pages actualiza en ~1 min. Si no se ve el cambio, es caché: forzar recarga o `?v=N` en los `<script src>`.
- Token de deploy es del usuario; pedirlo solo cuando se necesite y nunca guardarlo en el repo.

## Roadmap
- [x] Paso 0: arquitectura MVC + migraciones, verificada con tests.
- [x] Paso 1: dominio Primadas (crear/listar/seleccionar/renombrar/borrar) + migración v2→v3.
- [x] Paso 2: **modelo v4 definitivo** — capa de datos (config/util/store), migración v1→v4 tolerante,
      selectores + acciones + invariantes, todo con tests. *(UI pendiente.)*
- [ ] Split a multi-archivo del `index.html` (shell + `<script src>`) y cableado a los módulos.
- [ ] UI Tab Primada: organizadores/principal, asistencias, consumos, cover, resumen de ganancia + informe del principal.
- [ ] UI Tab Historial: primadas pasadas con totales, ganancias y deudas; registro de abonos.
- [ ] Directorio de personas en UI: alta, cambio de estado, `breB`.
- [ ] Tab "Próximamente" (placeholder).
- [ ] **Futuro:** módulo de **Ahorro/Tesorería** (aportes mensuales, retiros, préstamos, inversiones, actividades extra).
- [ ] **Futuro:** cierre de año / liquidación por persona (aún NO; el año es solo etiqueta).
- [ ] **Futuro:** **costo fijo de rifa/premio.** Hoy la rifa se modela como producto con `costoNeto = 0` (ganancia bruta);
      el descuento del premio (costo fijo, no por unidad) lo manejará el módulo de tesorería futuro.

## Decisiones de producto ya tomadas
- **La Primada = la app entera.** No hay natilleras ni contenedor anual; el año es etiqueta derivada de `mesContable`.
- Las reuniones mensuales son **primadas**; el nombre se **autosugiere de los organizadores** pero es **editable**.
- **Directorio de personas** en la raíz; cambian de estado sin perder historia. La **asistencia** congela `estadoEnEseMomento`.
- Ganancia = **cover + margen**, repartida en **partes iguales** entre **asistencias ahorradoras**; **lo indivisible queda en el fondo**.
- **Organizadores y principal:** sin cover, consumen normal, su margen va al fondo. El **principal siempre es ahorrador**,
  recibe los pagos (llave `breB`), **recupera su costo neto** y **entrega solo la ganancia al Tesorero** (saldo del principal = 0).
- **`coverExonerado`** existe como override manual (cortesía/niños), además del cover-free por rol.
- **`aportadoPor`** por producto (default = principal) permite que un co-organizador frontee productos.
- **Cover "fijo" = un único valor vigente** (ahorrador/invitado) que aplica a todas las primadas, **editable hacia adelante**;
  sugerido inicial **$15.000 / $10.000** (solo default de instalación nueva — **no se reescribe** el snapshot de primadas viejas).
- **"Cerrada"** congela la cuenta del evento pero **sigue aceptando abonos**.
- **Tesorería** (ahorro, préstamos, actividades extra) es **módulo futuro**; va como tab **"Próximamente"**.

## Cómo trabajamos
- Las **decisiones de producto/arquitectura** se toman fuera de código (chat PM) y se reflejan aquí.
- El **trabajo de código** lo hace Claude Code: implementa el roadmap respetando esta guía, corre pruebas y commitea.
- Ante una decisión de producto ambigua, **preguntar** antes de inventar; no cambiar el alcance por cuenta propia.
