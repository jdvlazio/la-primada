# La Primada — Guía del proyecto (CLAUDE.md)

**La Primada** es el conjunto: la app entera. Es una **natillera familiar** donde, por ahora,
construimos el **núcleo de eventos**: las reuniones mensuales (las **primadas**) generan
ganancias para un **fondo**, que se reparte entre los **ahorradores que asistieron** a cada evento.
El módulo de ahorro/tesorería se aplaza, pero el modelo ya lo acomoda sin reformas traumáticas.
Hospedada en GitHub Pages: https://jdvlazio.github.io/la-primada/

> No hay "natilleras" ni un año-contenedor. La raíz es la app: un directorio de personas y la
> lista de primadas. El año es solo una **etiqueta** derivada del **mes contable** de cada primada.

> 📐 **Constitución visual → [`DESIGN.md`](DESIGN.md).** Documento hermano de este `CLAUDE.md`: así como aquí vive el
> **dominio + arquitectura**, en `DESIGN.md` vive el **sistema visual**. **Léelo al arrancar, igual que este archivo.**
> Hoy define **solo tipografía** (Instrument Sans); paleta, espaciado, componentes y patrones se sumarán en pasadas
> futuras. Toda decisión visual sale de ahí — **nada de fuentes/estilos hardcodeados sueltos** en el código.

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
recaudadoTeorico   = Σ total de todas las asistencias         // = Σ costoNeto + gananciaPrimada (identidad)
recuperaPrincipal  = Σ costoNeto × unidades de los productos que él frontó (aportadoPor)
entregaTesorero    = gananciaPrimada
pagadoTerceros     = Σ total de las asistencias NO principal que marcaron `pagado` (BINARIO, no parcial)
autoAbonoPrincipal = total del principal                      // su parte EN MANO: no se debe a sí mismo
recaudadoReal      = pagadoTerceros + autoAbonoPrincipal
saldoPendiente     = recaudadoTeorico − recaudadoReal         // = Σ saldos de los terceros (deuda real)
```
- **El principal cuenta como auto-abonado:** su total entra a `recaudadoReal` como abono automático, de modo
  que **`saldoPendiente` refleja solo la deuda de terceros** (la palanca de "quién debe"). Esto **mantiene las dos
  identidades**: `recaudadoReal + saldoPendiente = recaudadoTeorico` **y** `recaudadoTeorico = Σ costoNeto + ganancia`
  (no se toca el teórico). *No* se resta el principal del teórico — eso rompería la segunda identidad.
- **Pago BINARIO (decisión de producto, v5):** cada asistencia está **`pagado` o no** — NO hay abonos parciales.
  El que paga **se autosirve**: en su ficha (tab Primadas) toca **"Pagar"** → hoja con la **llave Bre-B del
  principal** + el monto → **"Ya pagué"** marca `pagado`. **Sin comprobante en la app** (se comparte por fuera).
  Saber **quién debe cuánto** sigue siendo protagonista. (El historial de abonos parciales se eliminó.)

## Stack y restricciones (no negociables)
- **Vanilla JS**, sin librerías de frontend (no React/Vue). Sin build, sin bundler, sin npm en producción.
- **Multi-archivo servido tal cual por GitHub Pages.** `index.html` es solo shell + CSS embebido +
  `<script src>` de cada módulo. Pages sirve esto sin ningún cambio de configuración. **El deploy del frontend NO cambia.**
- Fuentes desde CDN de Google (Instrument Sans). CSS embebido en `index.html`.
- **SOLO mobile (390px de referencia).** Sin estilos ni adaptaciones desktop. **Sin breakpoints.** El ancho máximo
  es `--content-max` (480px). La app vive en una única columna mobile (ver `DESIGN.md` › Espaciado y layout).
- **Persistencia: migración CONFIRMADA de localStorage → Supabase** (backend en la nube). Ver
  **"Arquitectura de backend — Supabase (CONFIRMADA)"**. El SDK de Supabase entra **por CDN**
  (no npm en producción), igual que las fuentes. *(Implementación en sesión dedicada; hoy aún corre sobre localStorage.)*
- Moneda y formato: pesos colombianos, locale `es-CO`.

## Arquitectura de backend — Supabase (CONFIRMADA)
> **CONFIRMADA (producto + técnica).** No "en revisión": estas son las decisiones definitivas.
> 🚧 **La implementación de Supabase arranca en sesión dedicada — no mezclar con otros cambios.**
> Hasta entonces el código sigue corriendo sobre localStorage; esta sección es el plano a ejecutar.

**Por qué.** Los datos deben **persistir entre dispositivos y navegadores**; localStorage no alcanza. **Arrancamos limpio
en Supabase — NO se migra localStorage** (los datos de prueba no tienen valor real).

**Stack.** **Supabase** (PostgreSQL + Auth + RLS), tier gratis. **SDK por CDN** (no npm en producción), igual que las fuentes.
**GitHub Pages sigue sirviendo el frontend sin cambios.** Free tier durmiente es **aceptable**: La Primada se usa intensamente
alrededor de cada primada mensual, no a diario.

**Autenticación — magic link, sin registro.**
- Supabase Auth con **magic link por email (passwordless)**. **Nadie se registra:** el **admin siembra los emails** de los
  ahorradores. Al entrar, Supabase manda un link al correo → clic → adentro. **No hay formulario de registro.**
- **Login OPT-IN (no gate):** la app **entra directo y es usable**; el login se abre **desde el ícono de perfil**
  (hoja cerrable, con X), no bloquea al arrancar. **Datos LOCALES hasta que haya sesión** (el client Supabase se crea
  igual, para el magic link); al iniciar sesión, `Api.setMode('supabase')` y se recargan los datos. Al volver del link
  (`onChange`) se cierra la hoja y se recarga. *(Fase de prueba; el endurecimiento — admin sembrado, cierre de signups,
  y/o gate obligatorio — se decide después.)*

**Roles y permisos.**
- **admin** = email designado, **sembrado a mano** en Supabase. **Todos los demás** = acceso **completo de lectura y escritura**
  de los datos de primadas. **Transparencia total — todos ven todo** (confianza familiar).
- **RLS = frontera real de seguridad** (no el frontend):
  - `SELECT`: **todos** los autenticados.
  - `INSERT / UPDATE / DELETE` de **datos de primadas**: **todos** los autenticados.
  - **settings globales y `personas`** (directorio): control **adicional del admin**.
- **`breB` visible para todos:** es la llave para **RECIBIR** pagos (pensada para compartirse), **no es dato sensible**.
- La `anon key` pública en el bundle es **por diseño** (como las fuentes); **NUNCA** exponer la `service_role key`. RLS protege.

**Esquema — Opción C (híbrido relacional + JSONB).**
- `personas` **relacional** (directorio mutable, referenciado por muchas primadas; sede de la INVARIANTE #1).
- `primadas` con **columnas indexables** (`fecha`, `mes_contable`, `estado`, `organizador_principal_id`) **+ `data jsonb`**
  para los **snapshots congelados** (`pago`, `cover`, `productos[]`, `asistencias[]`).
- `settings` singleton (`jsonb`), `profiles` (`user_id → role`, `role:'admin'|'miembro'`; `is_admin()` = SECURITY DEFINER).
- **`consumos` relacional (v6, NO en el jsonb):** `{ id text PK, primada_id text FK→primadas, persona_id text FK→personas,
  producto_id text, cantidad int default 1, apuntado_por uuid default auth.uid(), created_at timestamptz }`. 1 fila = 1 pedido
  (append-only) → concurrencia sin lost-update. `replica identity full` (para realtime de la Fase B).
- **IDs de texto actuales se conservan** (PK `text`, p. ej. `'per…'`, `'prm…'`, `'cns…'`) — **sin migrar a uuid** → cero cambios al modelo.
- Granularidad **por fila**: editar la primada A no pisa la B ni el directorio; los consumos son filas independientes.

> **🟢 FASE A IMPLEMENTADA (sesión Supabase):** tabla `consumos` + modelo v6 (consumos-como-filas, `migrate()` v5→v6) +
> **gate INVERTIDO** (la app carga en LECTURA con solo el link; el login salta al intentar ESCRIBIR) + RLS verificado.
> **RLS real (verificado):** `SELECT` abierto a **anon** en `personas`/`primadas`/`settings`/`consumos`; escritura de primadas/consumos
> a **autenticados**; `settings`/`personas` UPDATE/DELETE solo **admin** (`is_admin()`); `consumos` no inserta si la primada está
> **cerrada** (subquery en la policy). **Primer editor sembrado:** `jdvlazio@gmail.com` (admin).
>
> **🟢 FASE B IMPLEMENTADA (sync en vivo):** `consumos` en la publicación `supabase_realtime` (replica identity full). Patrón
> **snapshot + incremental**: `Api.subscribeConsumos(primadaId, {onChange, onSubscribed})` (Postgres Changes sobre consumos) +
> `Api.fetchConsumos` (snapshot). El controller mantiene UNA suscripción a la primada ACTIVA; al (re)conectar re-snapshota
> (reconcilia). `Store.actions.applyRemoteConsumo` (idempotente por id → ignora el eco propio) y `replaceConsumos` (snapshot);
> NO hacen upsert (origen remoto). **GOTCHA verificado:** con RLS, el evento **DELETE de Postgres Changes trae SOLO la PK** (sin
> `primada_id`, aunque replica identity sea full) → el DELETE se entrega **por id sin filtrar por primada** (ids únicos globales;
> `applyRemoteConsumo` lo quita solo si está en la primada activa). INSERT/UPDATE traen la fila completa → filtrados por `primada_id`
> en el cliente (los filtros server-side de Realtime no aplican fiable a DELETE). **Verificado en vivo (2 clientes vs Supabase real):**
> INSERT $0→$1.000 y DELETE $1.000→$0 sin recargar. Pendiente: **Fase C** (cola offline + presence + botón de auditoría).

**Store — qué cambia y qué NO.**
- **NO cambian:** `select` (derivados), `actions` (mutaciones + invariantes), `migrate()` (normalizador tolerante), ni la forma
  del `AppState` en memoria. El **MVC se respeta**: el Store sigue siendo el **único dueño del estado**, síncrono para la Vista.
- **SÍ cambia:** `load()`/`persist()` (localStorage) se reemplazan por un **adaptador `js/api.js`** que **aísla todo Supabase**
  (igual que antes `persist()` escondía localStorage; el Store nunca habla con el SDK directo).
  - `load()` se vuelve **async**: hidrata el `AppState` desde Supabase (reusa el normalizador) → primer render tras el auth gate.
  - **`commit(target)`** recibe un **descriptor `{kind:'primada'|'persona'|'settings', id}`** para **upserts granulares** por entidad.
  - **`commitQuiet`** (edición de texto en vivo) pasa a **debounced** para no escribir por tecla.
- **Render optimista:** las acciones **mutan en memoria → render inmediato** y disparan el **upsert async en background**.
  Si el upsert **falla, el usuario lo ve** (manejo de error visible: toast / reintento). *El cómo es del implementador.*
- **Caché offline = solo LECTURA:** localStorage espeja el último estado para **ver datos sin conexión** y arranque en frío.
  **La fuente de verdad es Supabase. Nunca se escribe lógica de dominio a localStorage** (solo el espejo de lectura).
- **EXCEPCIÓN documentada — cola de tránsito de ESCRITURA (Fase C):** además del espejo de lectura, existe una **cola
  persistente** (`localStorage` clave `laPrimada_cola`, SEPARADA del estado de dominio) con las **escrituras pendientes**
  cuando no hay red. NO es estado de dominio: es **tránsito** (operaciones Supabase autocontenidas) que se vacía al
  reconectar (evento `online`) y se descarta si el backend la rechaza definitivamente (RLS/validación). Vive **dentro de
  `js/api.js`** (el Store no la conoce; solo recibe el estado `{pendientes,error}` vía `Api.onQueueChange` para el indicador).
  Esto resuelve "una primada es una fiesta con red mala": el que apunta no reintenta a mano (render optimista + sync al volver).
- **View pura intacta** (sin cambios). **Controller** solo cambia el **bootstrap** (auth gate + carga async).

## Estructura de archivos
```
index.html         ← shell HTML + CSS embebido + <script src> de cada módulo (en orden)
js/config.js       ← CONFIG (constantes y valores por defecto)
js/util.js         ← Util (uid, esc, peso, fechas) — sin estado
js/store.js        ← Store (MODELO: estado, migraciones, selectores, acciones, invariantes, persistencia)
js/view.js         ← View (VISTA: render puro estado→DOM)            [PASO 1: mínimo · tabs en PASO 2]
js/controller.js   ← Controller (eventos por delegación → Store.actions) + bootstrap [PASO 1: mínimo]
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
- **Excepción `commitQuiet` (fluidez de inputs):** las ediciones de **texto en vivo** (`renombrarPrimada`, `setFecha`,
  `setMesContable`, `renombrarPersona`, `setBreBPersona`, `setPreciosProducto`) persisten **sin notificar** (`commitQuiet`),
  por lo que **no** disparan re-render. Motivo: el re-render completo reconstruiría el `<input>` en plena escritura y
  rompería foco y cursor; el campo ya muestra lo tecleado y el próximo render estructural reflejará lo derivado.
  (**`setCover` es la excepción a la excepción:** usa `commit` normal porque debe re-renderizar para reflejar el cover
  vigente en los totales de las primadas abiertas; su input es `type=number` y dispara `change` en blur, así que el
  re-render no rompe foco.)
  Todo lo demás (consumos ±, roles, abonos, alta/baja, navegación) usa `commit` normal (persiste **y** re-renderiza).
  Regla: una acción nueva de **edición de texto en un input** usa `commitQuiet`; cualquier cambio **estructural** usa `commit`.

## Navegación (DECIDIDA) — 2 tabs inferiores + engranaje
- **Barra de tabs inferior (fija):**
  - **Primadas** — lista de eventos: la **activa arriba**, las **pasadas debajo** (el **historial vive aquí**, no es un tab aparte).
    Es el **corazón** de la app. Aquí: crear/seleccionar primada, organizadores y principal,
    asistencias, consumos (±), cover automático por tipo con exoneración, resumen de ganancia + informe del principal.
    Tiene **dos CARAS** conmutables (seg-nav, NO tabs): **Consumos** (operar) y **Balance** (ver la plata). El **Balance
    dejó de ser un tab** — es una cara de la primada activa (ver `DESIGN.md` §2.11.1). La cara por defecto sale del
    **estado**: abierta → Consumos; **cerrada → Balance** (documento final, solo-lectura). El Balance son dos tarjetas con
    **cifra héroe siempre visible** + desglose en acorde: **Ganancia** (resultado del grupo, "Provisional" en abierta) y
    **Recaudo** (proceso de cobro; ABIERTA = "Por cobrar" en ámbar, CERRADA = "Entregado" en teal). State-aware por `p.estado`.
  - **Fondo** — tesorería futura, estado **"Próximamente"**.
- **DOS capas de configuración, fronteras claras** (principio: *una sola intención por pantalla; muestra la
  excepción, no la regla*). Ver `DESIGN.md` §2.8 / §2.8.1:
  - **Gear de la PRIMADA** (ícono `settings-2` en el selector) → `configPrimadaSheet` = **DOS tabs operativos**
    sobre el evento activo: **Asistentes** (participación: lista compacta agrupada por estado, cover en el
    encabezado una vez, `Sin cover` solo en la excepción; alta/baja; **rol fijo al crear** salvo el fix
    "Hacer principal" si está incompleta) y **Productos** (precios, clon de Personas). **Nada más** (sin
    identidad, sin acciones administrativas). seg-nav con `data-ctab` (NO `data-tab`: colisiona con la tabbar).
  - **Gear GLOBAL (⚙ en el encabezado) — TRES tabs (NO 2):**
    - **Personas** — directorio (alta, cambio de estado invitado↔ahorrador, `breB`). También al agregar un asistente.
    - **Primadas** — capa administrativa del calendario/historial: **"Nueva primada"** (ÚNICO punto de creación →
      lanza el wizard de 3 pasos) + lista de TODAS (Activa/Pasadas) con **Eliminar** y **Reabrir** (cerradas).
      Aquí viven las acciones que salieron de Configurar. **El "+" de la cabecera del selector se ELIMINÓ.**
    - **Ajustes** — cover vigente, versión, legal, cuenta.
  - **Identidad de la primada** (nombre/fecha/mes) se fija al **crear** (wizard). No hay edición posterior de
    mes/fecha (un error → borrar y recrear, caso rarísimo y aceptable).
- Toda feature nueva debe caber en esta navegación. Si no cabe → **pausar y consultar** (no inventar un tercer tab).

## Modelo de datos (esquema v6 — DEFINITIVO)
```
AppState  { schemaVersion:6, settings{cover{ahorrador,invitado}, defaultProducts[]},
            personas[], primadas[], activePrimadaId }
Persona   { id, nombre, estado:'ahorrador'|'invitado', breB:string|null }
Primada   { id, nombre, fecha:'YYYY-MM-DD', mesContable:'YYYY-MM',
            organizadorPrincipalId:personaId|null, pago{ breB:string|null },
            cover{ahorrador,invitado}, productos[], asistencias[], consumos[], estado:'abierta'|'cerrada' }
Producto  { id, nombre, emoji, costoNeto, precioVenta, aportadoPor:personaId|null }   // default aportadoPor = principal
Asistencia{ personaId, estadoEnEseMomento:'ahorrador'|'invitado', rol:'principal'|'organizador'|'asistente',
            coverExonerado:bool, pagado:bool }   // pagado = saldó su total (binario). SIN items (v6).
Consumo   { id, personaId, productoId, cantidad:1, apuntadoPor, createdAt }   // 1 fila = 1 pedido (v6, append-only)
```
- **CONSUMOS COMO FILAS (v6, decisión Supabase #1):** cada pedido es una **fila** (no un contador `items{}`).
  La cantidad de un producto para una asistencia = **Σ filas** de `(personaId, productoId)`. **+1 = INSERT** una fila;
  **−1 = DELETE** la fila más reciente. Resuelve el **lost-update** (dos +1 simultáneos = dos INSERT, no se pisan).
  Tabla `consumos` **relacional aparte** (NO en el jsonb de la primada). `apuntadoPor` = sesión que lo registró
  (auditoría). **Las fórmulas (ganancia, cover, informe) NO cambian:** solo la forma del dato; los selectores cuentan
  desde `consumos`. Selectores nuevos: `resumenConsumoDe` (vista por defecto sumada) y `detalleConsumoDe` (auditoría).
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
4. **"Cerrada" congela la edición de la cuenta** (consumos, cover, productos, roles) **pero SIGUE aceptando pagos**
   (`setPagado`): la cuenta del evento se cierra; los pagos siguen llegando después.

## Selectores y acciones del Store
- **`select` (derivados puros):** `coverDe`, `consumoDe`, `totalAsistencia`, `saldoDe` (binario: principal/pagado = 0),
  `margenProducto`, `ventaProductos`, `costoNetoTotal`, `coverCobrado`, `margenTotal`, `ganancia`,
  `asistenciasAhorradoras`, `parteIgual`, `sobranteFondo`, `repartoPorPersona`, `recuperaDe`, `informePrincipal`,
  `deudores`, `recaudado`, `primadaIncompleta`, `nombreSugerido`, `anioContable`, `primadasPorAnio`, + directorio (`persona`, `ahorradores`, …).
- **`actions` (mutan + invariantes):** personas (`addPersona`, `setEstadoPersona`, `renombrarPersona`, `setBreBPersona`);
  settings (`setCover`, `upsertDefaultProducto`, `removeDefaultProducto`); ciclo de primada (`createPrimada`,
  `seleccionarPrimada`, `renombrarPrimada`, `setFecha`, `setMesContable`, `cerrarPrimada`, `reabrirPrimada`, `borrarPrimada`);
  productos de la primada (`addProducto`, `setPreciosProducto`, `setAportadoPor`, `removeProducto`);
  asistencias (`addAsistencia`, `removeAsistencia`, `setRol`, `toggleCoverExonerado`, `changeItem`);
  pago binario (`setPagado`); infra (`replaceState`).

## Reglas de datos y migraciones (evitan cambios traumáticos)
- **Todo cambio de forma del estado = subir `schemaVersion` + caso en `Store.migrate()` + tests primero.**
- Datos corruptos o nulos → `defaultState()`. Nunca romper al cargar.
- El **normalizador es tolerante**: rellena campos faltantes con defaults seguros, de modo que datos parciales (incluido
  cualquier borrador previo) suben limpio.

### Migración v1 → … → v5 (implementada)
`migrate()` detecta la versión y converge a **v5** (normalizador tolerante).
- **Salto v4 → v5 (pago binario):** `Asistencia.abonos[]` → **`pagado:bool`**. El normalizador deriva
  `pagado = (Σ abonos ≥ total)` (si los abonos cubrían el total → pagado); el principal queda `true`.
  Se **elimina** el historial de abonos parciales (decisión de producto). Idempotente: si ya viene `pagado`, se respeta.

Casos clave del salto a v4 (siguen vigentes dentro del normalizador):
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
2. Si es **feature nueva** → verificar que cabe en la IA de 2 tabs (+ caras de Primadas); si no, **pausar y consultar**.
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
- El deployable es `index.html` + `js/*.js` + `manifest.json` + `sw.js` + `icons/`. GitHub Pages (rama `main`, root) publica solo.
- Tras push, Pages actualiza en ~1 min. Si no se ve el cambio, es caché: forzar recarga o `?v=N` en los `<script src>`.
- Token de deploy es del usuario; pedirlo solo cuando se necesite y nunca guardarlo en el repo.

### PWA (instalable, mobile)
- `manifest.json` (Primadapp, standalone, portrait, theme `#0d1716`, acento `#2DD4BF`) + íconos `icons/` (192, 512, maskable).
- **Service Worker `sw.js` — network-first** (red primero; caché de respaldo offline). No intercepta CDN/Supabase (van directo a la red).
  - ⚠️ **El `activate` NO hace `clients.navigate()`** (lo hacía: recargaba la página en pleno arranque → `GET / net::ERR_ABORTED`
    + doble booteo → **botones muertos al primer ingreso tras un deploy**, peor en iOS; evidencia en el trazado de red).
    La actualización ya está garantizada sin esa recarga por: network-first no-store (código fresco siempre) + chequeo de
    `version.json` (recarga si el build corriendo es viejo) + `controllerchange` (no-iOS). `activate` solo limpia cachés + `claim`.
- **`CACHE_VERSION` auto-versionado:** el hook git `pre-commit` corre `node scripts/stamp-sw.js`, que sella `CACHE_VERSION`
  con `fecha-hash` y re-stagea `sw.js`. Así **cada commit invalida el caché viejo** y el celular ve la versión nueva sin borrar caché.
  ⚠️ El hook vive en `.git/hooks/` (no se versiona): tras un clon nuevo, recrearlo o correr `node scripts/stamp-sw.js` antes de commitear.
- **Propagación de versión (modelo Otrofestiv):** `version.json` + `<meta name="build">` sellados cada deploy; la app compara
  el build INCRUSTADO (no `localStorage`, que podía "mentir") contra `version.json` no-store al abrir/volver de background → reload
  duro si difiere. ⚙ **Ajustes muestra el build vigente** para confirmar a ojo qué versión corre en el celular.
- **Anclaje de la tabbar en iOS PWA (RESUELTO — ver `DESIGN.md` › "App shell y scroll"):** la barra inferior aparecía "muy
  arriba" al lanzar. CAUSA: en PWA standalone el viewport no está asentado en el cold-start → `100dvh`, `position:fixed;bottom:0`
  y hasta `window.innerHeight` dan un alto CORTO. FIX: **`.app { height:100vh }`** (pantalla completa fiable en standalone; el
  roto es `100dvh`), columna flex con la tabbar como **hijo flex al fondo** (no `position:fixed`). Otrofestiv no lo sufre por ser
  app **nativa Capacitor** (viewport fijo); su CSS no basta en PWA pura. **Verificado en iPhone real.**

## Roadmap
- [x] Paso 0: arquitectura MVC + migraciones, verificada con tests.
- [x] Paso 1: dominio Primadas (crear/listar/seleccionar/renombrar/borrar) + migración v2→v3.
- [x] Paso 2: **modelo v4 definitivo** — capa de datos (config/util/store), migración v1→v4 tolerante,
      selectores + acciones + invariantes, todo con tests. *(UI pendiente.)*
- [x] **PASO 1:** split del `index.html` a shell + `<script src>` (config→util→store→view→controller) + `view.js`/`controller.js`
      mínimos cableados al modelo v4 (migra localStorage al abrir). Sin tabs todavía.
- [x] **PASO 2:** UI Tab **Primadas** (corazón): crear/seleccionar primada, organizadores/principal, asistencias, consumos (±),
      cover automático por tipo con exoneración, resumen de ganancia + informe del principal. Verificado en navegador real
      (Chrome) + e2e con jsdom (clics reales). Personas/Ajustes mínimos tras el engranaje como prerrequisito.
- [x] Historial **dentro del tab Primadas** (no es tab aparte): la activa arriba, las pasadas debajo (lista con
      nombre, fecha, recaudo y ganancia, ordenadas por fecha); tap abre cualquiera. Abrir una vieja muestra sus
      **snapshots congelados** (cover y precios de cuando se creó), no se recalcula con valores de hoy.
      Verificado en navegador real. Abonos y "quién debe" ya integrados en el detalle.
- [x] Directorio de personas en UI (pantalla propia tras el engranaje): alta, edición de nombre, cambio de estado
      ahorrador↔invitado (vigente, sin reescribir snapshots), llave `breB`, y nº de primadas donde aparece.
      Verificado en navegador real (INVARIANTE #1: misma persona, dos primadas, dos snapshots distintos).
- [x] **HECHO (sesión dedicada) — Backend Supabase** (localStorage → nube; OTP por código, RLS, híbrido, arranque limpio).
      **Fase A HECHA:** modelo v6 (consumos-como-filas) + RLS (ver anon / editar autenticado / admin en settings·personas /
      cerrada solo-lectura, verificado) + gate invertido + editor sembrado (jdvlazio admin).
      **Fase B HECHA:** sync en vivo (Postgres Changes + snapshot/incremental + reconexión), verificado contra Supabase real
      (INSERT/DELETE en vivo entre clientes; DELETE entregado por id por el gotcha de RLS).
      **Fase C HECHA:** (C1) cola de reintento OFFLINE persistente (tránsito, separada del dominio; flush al reconectar;
      descarta rechazos definitivos); (C2) botón ⓘ de AUDITORÍA (detalle por evento: hora + quién apuntó, bajo demanda);
      (C3) PRESENCE ("X está apuntando", auto-coordinación). **Migración Supabase COMPLETA.**
      Auth por **CÓDIGO OTP** (no solo magic link): plantilla de email con `{{ .Token }}` + `signInWithOtp` sin `emailRedirectTo`.
- [ ] Tab "Próximamente" (placeholder). *(Resumen y Fondo ya muestran placeholder en PASO 2.)*
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
- **Cover "fijo" = un único valor vigente** (ahorrador/invitado), **editable hacia adelante**; sugerido inicial
  **$15.000 / $10.000**. El cover de una asistencia (`coverDe`) se **DERIVA según el estado**: primada **ABIERTA →
  usa el cover VIGENTE** (`settings.cover`, en vivo) → editar el cover en Ajustes refleja los totales de **todas las
  abiertas al instante**, sin depender de re-sellar/persistir un snapshot por primada (robusto ante recargas);
  primada **CERRADA → usa su snapshot CONGELADO** (`primada.cover`, historia, INVARIANTE #4). El **snapshot se sella
  al CERRAR** (`cerrarPrimada` copia el cover vigente). `setCover` solo guarda `settings` + re-render (no toca primadas).
- **"Cerrada"** congela la cuenta del evento pero **sigue aceptando abonos**.
- **CICLO DE VIDA SIMPLIFICADO — `estado:'abierta' | 'cerrada'` (el `'programada'` se ELIMINÓ):** una primada
  siempre se crea **abierta**. No hay un estado separado "agendada": una primada recién creada sin consumos y una
  "programada" son lo mismo funcionalmente. **La distinción que importa al usuario (¿ya tiene actividad?) se MUESTRA
  visualmente, no se modela** — el **dot del estado se DERIVA de actividad real** (`view.js dotClase(p)`):
  - **sin consumos** → `.dot.idle` **ámbar** (creada/organizada, sin actividad aún = "pendiente", escalera de color §1).
  - **con consumos** → `.dot.open` **verde** (en operación). **cerrada** → `.dot.closed` **gris**.
  - **PUNTO ÚNICO DE CREACIÓN:** el wizard de 3 pasos, lanzado SOLO desde **gear global › Primadas › "Nueva primada"**.
    Se eliminaron: el "+" de la cabecera del selector, "Programar próxima", la hoja `programarSheet`, `createProgramada`,
    `abrirPrimada`, `primadasProgramadas`, `programadaCara` y todo el flujo `prog-*`/`open-programar`. El **selector**
    queda con 2 secciones: **Activa** · **Pasadas** (ya no hay "Próximas"). Estado vacío (0 primadas) orienta al gear.
  - **MIGRACIÓN (tolerancia hacia atrás):** `normEstadoPrimada` mapea cualquier `'programada'` histórica → `'abierta'`.
    Como `Store.load()` aplica `migrate()` también a los datos de Supabase, esto **auto-convierte** las filas viejas en
    **cada lectura**, y el normalizador **AUTOSANA** (rellena `productos` por defecto + `fecha` de hoy si estaba `''`),
    igual que hacía `abrirPrimada`. La app no depende del SQL para funcionar. **SQL de limpieza (corrido aparte):**
    `UPDATE primadas SET estado='abierta' WHERE estado='programada'` (solo la columna; el jsonb se autosana al leer/escribir).
  - **Persistencia de `fecha` (sigue vigente):** la columna DATE `fecha` es `NOT NULL`; una fila con `fecha:''` recibe un
    **placeholder = `mesContable + '-01'`** en la columna y la fecha real en `data.fecha` (defensivo; ya casi no aplica
    porque el normalizador da `fecha` de hoy a las que no tienen).
- **Tesorería** (ahorro, préstamos, actividades extra) es **módulo futuro**; va como tab **"Próximamente"**.
- **Backend Supabase (CONFIRMADO, implementación en sesión dedicada):** datos en la nube para persistir entre dispositivos.
  **Auth magic link sin registro** (el admin siembra los emails). **Transparencia total — todos ven todo y todos editan**
  los datos de primadas; el **admin** controla además **settings globales y `personas`** (vía **RLS**). **`breB` no es sensible**
  (llave para recibir pagos). **Arranque limpio** (no se migra localStorage). **Caché offline solo lectura** (verdad = Supabase).
  **Render optimista** con error visible si el upsert falla. GitHub Pages sigue; **modelo v4 y MVC intactos** — solo cambia la
  capa de persistencia del Store (`load`/`persist` → adaptador `js/api.js`; `commit(target)` para upserts granulares).

## Cómo trabajamos
- Las **decisiones de producto/arquitectura** se toman fuera de código (chat PM) y se reflejan aquí.
- El **trabajo de código** lo hace Claude Code: implementa el roadmap respetando esta guía, corre pruebas y commitea.
- Ante una decisión de producto ambigua, **preguntar** antes de inventar; no cambiar el alcance por cuenta propia.
- **Secuencial en operaciones sensibles, no en paralelo.** Para cualquier paso que toque **git** (commits, reset,
  reordenar historial) o **edición encadenada de un mismo archivo**, ejecutar **un paso a la vez** y verificar el
  resultado antes del siguiente. El trabajo en paralelo aquí ya causó historial duplicado que hubo que reescribir y
  un bug que se coló entre ediciones (la Vista dejó de recibir `ui` y el acordeón no abría). Lento y ordenado > rápido y a reparar.
- **Nunca confiar en un preview reusado sin recarga limpia.** El servidor de Preview reutiliza el proceso y puede servir
  el **bundle viejo**, dando verificaciones falsas. Antes de verificar en navegador: forzar recarga / reiniciar el server,
  y confirmar que el código nuevo está cargado (p. ej. una señal del DOM que solo exista con el cambio) **antes** de dar fe del resultado.

## Resumen copiable (regla de comunicación)
El usuario trabaja con Claude Code por **Remote Control en el celular**, donde no se puede seleccionar y copiar
el texto largo de las respuestas. Por eso, **SIEMPRE** termina cada respuesta con un bloque de resumen dentro de un
**único bloque de código** (```), que el usuario pueda copiar de un toque para pegarlo en el chat de PM. El resumen
debe ser **autocontenido** e incluir:
- **Qué hiciste** (cambios concretos: archivos, acciones).
- **Resultado de la verificación** (tests, números clave, lo que se confirmó en el navegador).
- **Estado del repo** (qué está commiteado, en qué rama, qué queda sin commitear).
- **Qué sigue** / qué decisión o aprobación se necesita del usuario.

Mantén el resumen **conciso pero completo**: es lo único que el PM va a ver, así que no dejes por fuera nada que
necesite para decidir. El detalle largo va arriba como siempre, pero **el bloque copiable al final es obligatorio**.
