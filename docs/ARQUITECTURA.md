# La Primada — Documento de Arquitectura

> Contrato de **arquitectura** de la app (capas, flujo de datos, invariantes, persistencia).
> Es el hermano técnico de `DESIGN.md` (contrato visual). Extraído de `CLAUDE.md` y del
> código real (`js/*.js`, `supabase/schema.sql`). El detalle de dominio/producto vive en
> `CLAUDE.md`; el modelo de datos en detalle en `docs/SCHEMA.md`.

---

## 1 · Qué es La Primada

App de una **natillera familiar**. Hoy se construye el **núcleo de eventos**: las reuniones
mensuales (**primadas**) generan **ganancia** para un **fondo**, que se reparte entre los
**ahorradores que asistieron**. No hay "natilleras" ni año-contenedor: la raíz es la app
(directorio de personas + lista de primadas); el año es solo una **etiqueta** derivada del
`mesContable` de cada primada.

**Stack (no negociable):** Vanilla JS, **sin** framework/bundler/npm en producción.
Multi-archivo servido tal cual por **GitHub Pages**. **Solo mobile** (referencia 390px,
sin breakpoints). Moneda/locale `es-CO`. Fuentes y (futuro) SDK de Supabase entran por **CDN**.

---

## 2 · Estructura de archivos

```
index.html         ← shell HTML + CSS embebido + <script src> de cada módulo (en orden) + topbar dinámica
js/config.js       ← CONFIG: constantes y valores por defecto (esquema v6)
js/util.js         ← Util: utilidades puras sin estado (uid, esc, peso, fechas)
js/api.js          ← Api: adaptador de persistencia (aísla Supabase / localStorage)
js/auth.js         ← Auth: login por código OTP (Supabase Auth; activo con backendEnabled=true)
js/store.js        ← Store (MODELO): estado, migraciones, selectores, acciones, invariantes
js/view.js         ← View (VISTA): render puro estado→DOM
js/controller.js   ← Controller: eventos por delegación → Store.actions + bootstrap
sw.js              ← Service Worker (network-first; CACHE_VERSION auto-sellado en cada commit)
manifest.json      ← PWA (standalone, portrait, theme oscuro teal)
supabase/schema.sql← Esquema Supabase (híbrido relacional + JSONB) + RLS
tests/run.js       ← runner de modelo/migración (node)
tests/api.js       ← runner del adaptador (node)
tests/e2e.js       ← runner MVC e2e (jsdom, clics reales)
tests/*.spec.js    ← suite Playwright (Chromium real): smoke + visual-audit
playwright.config.js
scripts/stamp-sw.js← sella CACHE_VERSION (sw.js) y ?v= (index.html) en cada commit
```

**Orden de carga de los `<script>` (estricto):** `config → util → api → auth → store → view → controller`.
Cada uno expone su símbolo en `window` (browser) y `module.exports` (Node/tests) vía el patrón
`(function (root) { … })(typeof window !== 'undefined' ? window : globalThis)`.

---

## 3 · Arquitectura MVC (regla #1)

El JS vive en módulos separados; **respetar la separación es la regla central**.

| Capa | Archivo | Responsabilidad |
|---|---|---|
| **CONFIG** | `config.js` | Constantes y defaults (cover, productos, locale, flags de backend). Sin estado ni lógica. |
| **Util** | `util.js` | Funciones puras: `uid(prefix)`, `esc(html)`, `peso(n)` (formato `es-CO`), fechas. Sin estado. |
| **Store (MODELO)** | `store.js` | **Único dueño del estado.** Único lugar donde el estado muta, vía *acciones*. Expone `select` (lectura/derivados) y `actions` (mutaciones que **hacen cumplir los invariantes**). |
| **View (VISTA)** | `view.js` | Funciones puras estado→DOM. **No** muta estado ni persiste. Re-renderiza la sección completa en cada cambio. |
| **Controller** | `controller.js` | Escucha eventos (delegación en document; topbar dinámica + overlay) y llama `Store.actions`. **No** dibuja ni persiste. Hace el **bootstrap**. |
| **Api** | `api.js` | Adaptador de persistencia: aísla Supabase y el espejo localStorage del Store. |
| **Auth** | `auth.js` | Login por código OTP (passwordless). Activo con `CONFIG.backendEnabled=true`. |

**Flujo único e inviolable:**
```
evento (DOM) → Controller → Store.action (muta + invariantes) → commit (persiste) → notifica → View.render
```
La Vista se **suscribe** al Store (`Store.subscribe`) y re-renderiza la sección completa en cada
cambio (deliberado: simplicidad sobre micro-optimización).

### Excepción `commitQuiet` (fluidez de inputs)
Las ediciones de **texto en vivo** (`renombrarPrimada`, `setFecha`, `setMesContable`,
`renombrarPersona`, `setBreBPersona`, `setCover`, `setPreciosProducto`) persisten **sin notificar**
(`commitQuiet`), así **no** disparan re-render — el re-render completo reconstruiría el `<input>`
en plena escritura y rompería foco/cursor. Todo cambio **estructural** (consumos ±, roles, abonos,
alta/baja, navegación) usa `commit` normal (persiste **y** re-renderiza).
**Regla:** edición de texto en input → `commitQuiet`; cualquier cambio estructural → `commit`.

---

## 4 · Estado en runtime (UI efímero vs dominio)

| Dónde vive | Qué | Persiste |
|---|---|---|
| **Store** (`AppState`) | dominio: `settings`, `personas[]`, `primadas[]`, `activePrimadaId` | **Sí** (Api) |
| **Controller** (`ui`) | efímero de UI: `ui.view` (home|detalle), `ui.overlay`, `ui.wizard`, `ui.abiertos` (Set de acordeones abiertos), `ui.addAsis` | **No** |

La Vista es **pura sobre `(estado, ui)`**. El acordeón de asistentes (abierto/cerrado) es UI
efímero (`ui.abiertos`), no dominio: no se persiste.

---

## 5 · Persistencia — adaptador `api.js`

El Store **nunca** habla con Supabase ni con localStorage directo: pasa por `Api`. Dos modos,
elegidos en `Api.init()`:

| Modo | Cuándo | Comportamiento |
|---|---|---|
| `'supabase'` | hay client (SDK por CDN, o inyectado en tests) | Lee/escribe Supabase; espejo de lectura en localStorage. |
| `'local'` | sin client (Node/jsdom, u offline, o `backendEnabled=false`) | Solo localStorage (clave `CONFIG.storageKey='laPrimada'`). |

**API del adaptador:**
- `init(opts)` → decide el modo; devuelve `'supabase'` o `'local'`.
- `load()` (async) → hidrata el `AppState` (reusa el normalizador del Store).
- `commit(state, target)` → upsert **granular** por entidad: `target = {kind:'primada'|'persona'|'settings', id}`.
- Serializadores modelo v6 (camelCase) ↔ filas Supabase (snake_case): `personaToRow`/`rowToPersona`,
  `primadaToRow`/`rowToPrimada`, `settingsToRow`, `fromRows`.
- Espejo de lectura: `cacheWrite`/`cacheRead` (localStorage) para arranque en frío / offline.

**Reglas de persistencia (CLAUDE.md):**
- La **fuente de verdad** es Supabase (cuando el backend está on). **Caché offline = solo LECTURA**;
  nunca se escribe lógica de dominio a localStorage (solo el espejo).
- **Render optimista:** las acciones mutan en memoria → render inmediato → upsert async en background;
  si falla, el usuario lo ve (indicador de sync con error).
- Granularidad **por fila**: editar la primada A no pisa la B ni el directorio.

### Interruptor de backend
`CONFIG.backendEnabled` (hoy **`true`**): Supabase ON + login por **código OTP** (gate INVERTIDO: la app carga en
LECTURA con solo el link/anon; el login salta al ESCRIBIR). En `false`, la app cae a 100% localStorage sin auth gate
(modo del Node/jsdom de los tests). Flag REVERSIBLE, no borra nada. `url` y `anonKey` son **públicas por diseño**
(van en el bundle, como las fuentes); RLS es la frontera real. **NUNCA** la `service_role key`.

---

## 6 · Migraciones y normalizador

- **Todo cambio de forma del estado = subir `schemaVersion` + caso en `Store.migrate()` + tests primero.**
- `migrate()` detecta la versión y converge a **v6** (idempotente, estable en ids). Cubre v1→…→v6 (v5 pago binario, v6 consumos-como-filas).
- El **normalizador es tolerante**: datos parciales/corruptos se rellenan con defaults seguros;
  datos nulos → `defaultState()`. **Nunca romper al cargar.**
- Detalle del modelo y de cada salto de versión: `docs/SCHEMA.md`.

---

## 7 · Invariantes (los blinda el Store en las acciones)

1. **Inmutabilidad histórica:** cambiar el `estado` vigente de una persona **nunca** altera el
   `estadoEnEseMomento` ya congelado en asistencias pasadas. `setEstadoPersona` solo toca `Persona.estado`.
2. **Principal siempre ahorrador:** asignar `principal` exige `estadoEnEseMomento === 'ahorrador'`;
   si no, la acción **lanza error**.
3. **A lo sumo un `rol:'principal'`** por primada, coherente con `organizadorPrincipalId`.
4. **"Cerrada" congela la cuenta** (consumos, cover, productos, roles) **pero sigue aceptando abonos**.

Estos invariantes son **propiedad del Store**: ninguna vista ni controlador los reimplementa.

---

## 8 · Selectores y acciones del Store

**`select` (derivados puros):** `coverDe`, `consumoDe`, `totalAsistencia`, `abonadoDe`, `saldoDe`
(principal = 0), `margenProducto`, `ventaProductos`, `costoNetoTotal`, `coverCobrado`, `margenTotal`,
`ganancia`, `asistenciasAhorradoras`, `parteIgual`, `sobranteFondo`, `repartoPorPersona`, `recuperaDe`,
`informePrincipal`, `deudores`, `recaudado`, `primadaIncompleta`, `nombreSugerido`, `anioContable`,
+ directorio (`persona`, `ahorradores`, …).

**`actions` (mutan + invariantes):** personas (`addPersona`, `setEstadoPersona`, `renombrarPersona`,
`setBreBPersona`); settings (`setCover`, `upsertDefaultProducto`, `removeDefaultProducto`); ciclo de
primada (`createPrimada`, `seleccionarPrimada`, `renombrarPrimada`, `setFecha`, `setMesContable`,
`cerrarPrimada`, `reabrirPrimada`, `borrarPrimada`); productos de la primada (`addProducto`,
`setPreciosProducto`, `setAportadoPor`, `removeProducto`); asistencias (`addAsistencia`,
`removeAsistencia`, `setRol`, `toggleCoverExonerado`, `changeItem`); abonos (`registrarAbono`,
`removerAbono`); infra (`replaceState`).

---

## 9 · Navegación — LISTA→DETALLE (estilo Tricount), SIN tab bar

> Refactor de IA: se ELIMINÓ el tab bar y el selector-overlay. Detalle del contrato en `CLAUDE.md` ›
> **Navegación (DECIDIDA) — LISTA→DETALLE** y `DESIGN.md` §2.8.1/§2.11/§2.11.1.

- **`ui.view ∈ {'home','detalle'}`** (reemplaza al viejo `ui.tab`). `render()` bifurca por `ui.view`;
  la **topbar es dinámica** por vista. **Back stack** con `history.pushState`/`popstate` (el back del
  sistema en el detalle vuelve al home, no sale de la PWA).
- **HOME** = lista de primadas (pantalla de inicio): hero de la activa + historial (Próximas/Pasadas).
  Topbar: **"+" Nueva primada** (único punto de creación) · **⚙ Ajustes** (pantalla plana) · **👤 Cuenta**.
  **"···" por primada** → Reabrir/Eliminar.
- **DETALLE** = operación: topbar **← Inicio · nombre · 🔗 · ···** ; cuerpo = **Lista viva** + **panel de
  Balance** (chip ▲/▼). Presencia y offline viven aquí.
- **Ajustes globales** = pantalla PLANA (`ajustesSheet`, sin tabs), acordeones colapsables. **··· del detalle**
  = `configPrimadaSheet`. (El gear de 4 tabs `overlaySheet` se eliminó.)
- Toda feature nueva debe caber en esta IA (home ↔ detalle); si no cabe → **pausar y consultar**.

---

## 10 · PWA y propagación de caché

- **Service Worker `sw.js` — network-first** (red primero, caché de respaldo offline). No intercepta
  CDN/Supabase. Para documento/scripts del propio origen pide con `cache:'no-store'` (evita JS viejo
  en iOS WKWebView). En `activate`: **solo** borra cachés viejos + `clients.claim()`. **NO** hace
  `clients.navigate()` — lo hacía y causaba recarga en pleno arranque (`GET / net::ERR_ABORTED` + doble
  booteo → botones muertos al primer ingreso tras deploy). La actualización la garantizan network-first
  no-store + chequeo de `version.json` + `controllerchange` (no-iOS).
- **Cache-busting:** `?v=<sello>` en cada `<script src>`, sincronizado con `CACHE_VERSION` del SW.
- **Auto-sellado:** el git hook `pre-commit` corre `scripts/stamp-sw.js`, que sella `CACHE_VERSION`
  (sw.js) y `?v=` (index.html) con `fecha-hash` y re-estagea ambos → cada commit invalida el caché viejo.
  ⚠️ El hook vive en `.git/hooks/` (no se versiona): tras un clon, recrearlo o correr el script a mano.
- En **tests** Playwright el SW se **bloquea** (`serviceWorkers:'block'`): su navigate recargaría la
  página a mitad del bootstrap. El SW es otra preocupación, no lo que auditan los tests.

---

## 11 · Backend Supabase (CONFIRMADO; implementación en sesión dedicada)

Esquema **Opción C (híbrido relacional + JSONB)** — detalle en `docs/SCHEMA.md` y `supabase/schema.sql`:
- `personas` **relacional** (directorio mutable; sede de la INVARIANTE #1).
- `primadas` con **columnas indexables** (`fecha`, `mes_contable`, `estado`, `organizador_principal_id`)
  **+ `data jsonb`** para los snapshots congelados (`pago`, `cover`, `productos[]`, `asistencias[]`).
- `settings` singleton (`jsonb`); `profiles` (`user_id → role`).
- **IDs de texto** actuales (`'per…'`, `'prm…'`) se conservan como PK `text` (sin migrar a uuid).

**Auth:** código OTP por email (passwordless), **sin registro** — el admin **siembra** los emails.
**Roles/RLS:** `SELECT` para todos los autenticados; escritura de **datos de primadas** para todos;
**settings y `personas`** con control **adicional del admin** (`is_admin()`). **Transparencia total**
(todos ven todo). `breB` es público (llave para **recibir** pagos, no es dato sensible).

**Qué cambia / qué NO al encender el backend:** **NO** cambian `select`, `actions`, `migrate()`, ni la
forma del `AppState` en memoria (MVC intacto). **SÍ** cambia solo la capa de persistencia del Store
(`load`/`commit` vía `api.js`); el bootstrap del Controller suma el **auth gate** + carga async.

---

## 12 · Pruebas

Dos capas, complementarias:

| Comando | Qué corre | Cubre |
|---|---|---|
| `npm test` | `tests/run.js` + `tests/api.js` + `tests/e2e.js` (node/jsdom) | modelo, migración v1→v4, invariantes, adaptador, flujo MVC por clics (jsdom) |
| `npm run test:e2e` | `tests/*.spec.js` (Playwright, Chromium real, viewport 390×844) | smoke (carga, 3 tabs, wizard, crear primada) + auditoría visual contra `DESIGN.md` |

**Antes de cada commit:** `node --check` sobre cada `js/*.js`; tests de migración + reglas; e2e jsdom.
La suite Playwright corre **serial** (`workers:1`): el webServer (`python3 -m http.server 4178`) es
monohilo y alinea con la regla del proyecto (secuencial, no paralelo).

---

## 13 · Relación con los otros contratos

- `CLAUDE.md` → dominio + producto + proceso (la fuente primaria; este doc lo resume técnicamente).
- `DESIGN.md` → contrato **visual** (tokens, componentes canónicos, jerarquía).
- `docs/SCHEMA.md` → modelo de datos v4 + esquema Supabase en detalle.
- Ante un cambio **estructural**, manda `CLAUDE.md`; **visual**, manda `DESIGN.md`.
