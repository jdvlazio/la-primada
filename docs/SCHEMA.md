# La Primada — Modelo de datos (esquema v6) y backend

> Forma del estado en memoria (`AppState` **v6**) y su mapeo al backend **Supabase**. Extraído del código real
> (`js/store.js`, `js/config.js`, `js/api.js`) y de `supabase/schema.sql`. La arquitectura de capas vive en
> `docs/ARQUITECTURA.md`; el dominio/producto en `CLAUDE.md`.
>
> **v6 = pago BINARIO + consumos como FILAS.** Dos decisiones de la migración a Supabase, sobre v4:
> v5 reemplazó `Asistencia.abonos[]` por **`pagado:bool`**; v6 reemplazó `Asistencia.items{}` por una colección
> de **`consumos[]`** (1 fila = 1 pedido), con tabla relacional propia para resolver el lost-update en concurrencia.

---

## 1 · AppState (v6 — DEFINITIVO)

```
AppState  { schemaVersion:6,
            settings{ cover{ahorrador,invitado}, defaultProducts[] },
            personas[], primadas[], activePrimadaId }

Persona   { id, nombre, estado:'ahorrador'|'invitado', breB:string|null }

Primada   { id, nombre, fecha:'YYYY-MM-DD', mesContable:'YYYY-MM',
            organizadorPrincipalId:personaId|null,
            pago{ breB:string|null },
            cover{ahorrador,invitado}, productos[], asistencias[], consumos[],
            estado:'abierta'|'cerrada' }

Producto  { id, nombre, emoji, costoNeto, precioVenta, aportadoPor:personaId|null }
            // default aportadoPor = principal (anfitrión)

Asistencia{ personaId, estadoEnEseMomento:'ahorrador'|'invitado',
            rol:'principal'|'organizador'|'asistente',
            coverExonerado:bool, pagado:bool }      // pagado = saldó su total (BINARIO). SIN items (v6).

Consumo   { id, personaId, productoId, cantidad:1, apuntadoPor, createdAt }
            // 1 fila = 1 pedido (v6, append-only). La cantidad de un producto = Σ filas (personaId, productoId).
```

> **Nota de UI:** el organizador principal se LLAMA "**Anfitrión**" en pantalla; el término de dominio/código sigue
> siendo `principal` (`rol:'principal'`, `organizadorPrincipalId`, `esPrincipal`, …) — solo cambió el texto mostrado.

### Reglas de forma (claves)
- **`personas[]` es el directorio raíz**, persiste para siempre. Una persona pasa de invitado↔ahorrador cambiando
  solo `estado` (vigente). **No se borra su historia.**
- **`estadoEnEseMomento` es un SNAPSHOT inmutable** del estado que la persona tenía al asistir (igual que los
  precios). Si la persona cambia de estado después, **la historia NO se reescribe** (INVARIANTE #1).
- **Organizadores = `rol` dentro de la asistencia.** El `principal` es la asistencia con `rol:'principal'`;
  `organizadorPrincipalId` es el **puntero de integridad**. "Sin cover" se **deriva** del `rol` (o de `coverExonerado`).
- **`fecha` con día** (`YYYY-MM-DD`) + **`mesContable`** independiente (`YYYY-MM`): una primada puede contar para un
  mes contable distinto al de su fecha (la del 31-may cuenta como junio). El **año-etiqueta** sale de `mesContable`.
- **Snapshot por primada:** al crearla se copian **cover**, **productos** (con sus dos precios) y la **llave `breB`**
  del principal. Editar lo global o la persona **NO** reescribe primadas ya creadas.
- **Dos precios por producto:** `costoNeto` (lo frontea `aportadoPor`) y `precioVenta` (lo paga el asistente).
  **margen = precioVenta − costoNeto** → ganancia del fondo. Una rifa es un producto con `costoNeto` bajo o **0**.
- **CONSUMOS COMO FILAS (v6):** la cantidad de un producto para una asistencia = **Σ filas** `(personaId, productoId)`.
  **+1 = INSERT** una fila; **−1 = DELETE** la fila más reciente. Resuelve el lost-update (dos +1 simultáneos = dos
  INSERT, no se pisan). `apuntadoPor` = sesión que lo registró (auditoría). **Las fórmulas NO cambian:** solo la
  forma del dato; los selectores cuentan desde `consumos`.

### Reglas de negocio (núcleo de eventos)
```
gananciaPrimada = Σ cover cobrado + Σ (precioVenta − costoNeto) × unidades   // de TODAS las asistencias
nAhorradoras    = nº de asistencias con estadoEnEseMomento === 'ahorrador'
parteIgual      = floor(gananciaPrimada / nAhorradoras)                       // piso, sin centavos
sobranteFondo   = gananciaPrimada − parteIgual × nAhorradoras                 // lo indivisible queda en el fondo
totalAsistencia = cover (si rol 'asistente' y no exonerado) + Σ(precioVenta × consumos)
saldoDe(a)      = (esPrincipal || a.pagado) ? 0 : totalAsistencia(a)          // pago BINARIO
```
El reparto va **solo** a las asistencias ahorradoras de ese momento; el principal entra siempre (saldo = 0,
auto-saldado). **Invitados generan ganancia pero no la reciben.**

### Informe del anfitrión (identidades que sostiene el modelo)
```
recaudadoTeorico   = Σ total de todas las asistencias            // = Σ costoNeto + gananciaPrimada (identidad)
recuperaPrincipal  = Σ costoNeto × unidades de los productos que él frontó (aportadoPor)
entregaTesorero    = gananciaPrimada
pagadoTerceros     = Σ total de las asistencias NO principal que marcaron `pagado` (BINARIO)
autoAbonoPrincipal = total del principal                         // su parte EN MANO: no se debe a sí mismo
recaudadoReal      = pagadoTerceros + autoAbonoPrincipal
saldoPendiente     = recaudadoTeorico − recaudadoReal            // = Σ saldos de terceros (deuda real)
```
Dos identidades que el modelo mantiene: **`recaudadoReal + saldoPendiente = recaudadoTeorico`** y
**`recaudadoTeorico = Σ costoNeto + ganancia`**. (El **panel de Balance** muestra solo lo accionable —
Bre-B · Recupera · Entrega · "Debe"; el auto-abono vive en el modelo, no en pantalla. Ver `DESIGN.md` §2.11.1.a.)

---

## 2 · Invariantes que el modelo blinda

1. **Inmutabilidad histórica:** `setEstadoPersona` solo toca `Persona.estado`; nunca el `estadoEnEseMomento`
   congelado en asistencias pasadas.
2. **Principal siempre ahorrador:** asignar `principal` exige `estadoEnEseMomento==='ahorrador'`, o la acción lanza error.
3. **A lo sumo un `rol:'principal'`** por primada, coherente con `organizadorPrincipalId`.
4. **"Cerrada" congela la EDICIÓN de la cuenta** (consumos, cover, productos, roles) **pero SIGUE aceptando pagos**
   (`setPagado`): la cuenta del evento se cierra; los pagos siguen llegando después. (En Supabase, una policy impide
   `INSERT` en `consumos` si la primada está cerrada.)

---

## 3 · Defaults de instalación (`CONFIG`, `js/config.js`)

```
storageKey      : 'laPrimada'
schemaVersion   : 6
locale          : 'es-CO'
backendEnabled  : true                                    // true → Supabase + login OTP; false → 100% localStorage
supabase        : { url, anonKey }                        // PÚBLICAS por diseño (RLS protege; NUNCA service_role)
defaultCover    : { ahorrador: 15000, invitado: 10000 }   // solo instalación nueva; NO reescribe snapshots
defaultProducts : [ Costeñita 🍺 2500/3500, Brownie 🍫 6000/9000,
                    Rollo de canela 🌀 6000/9000, Boleta de rifa 🎟️ 0/5000 ]
emojiKeywords   : [...]                                    // autosugerencia de emoji por palabra del nombre
```

---

## 4 · Migraciones v1 → … → v6

`Store.migrate()` detecta la versión y converge a **v6** (idempotente, estable en ids). Datos corruptos/nulos →
`defaultState()`; el normalizador es **tolerante** (rellena faltantes con defaults seguros). Como `Store.load()`
aplica `migrate()` también a los datos de Supabase, **auto-convierte filas viejas en cada lectura** (la app no
depende de correr SQL para funcionar).

| Salto | Qué cambia |
|---|---|
| **v1 / v2 → v4** | v1 (arreglo pelado) y v2 (`{products, people}`) se envuelven como una primada con **cover 0** y pasan por el camino de v3→v4 |
| **v3 → v4** | Directorio `personas[]` desde nombres distintos (última aparición por fecha gana). Asistencias enlazadas por `personaId` con `estadoEnEseMomento` snapshot, todas `rol:'asistente'`. Productos: `precioVenta=price` viejo, `costoNeto=precioVenta` → **margen 0** (no se inventan costos retroactivos). `organizadorPrincipalId=null` (primada **incompleta**, la UI pide asignar anfitrión). `fecha 'YYYY-MM'→'YYYY-MM-01'`; `cover` preservado |
| **v4 → v5 (pago binario)** | `Asistencia.abonos[]` → **`pagado:bool`**. El normalizador deriva `pagado = (Σ abonos ≥ total)`; el principal queda `true`. Se **elimina** el historial de abonos parciales. Idempotente |
| **v5 → v6 (consumos-filas)** | `ensureV6`: si la primada trae `consumos[]` los normaliza; si trae `items{}` los **DERIVA a filas** (k unidades → k filas con `Util.uid('cns')`, `apuntadoPor:null`, `createdAt:null`) y **borra `items`**. La historia migrada queda sin timestamp/autor (`null`) |
| **`'programada'` → `'abierta'`** | `normEstadoPrimada` mapea cualquier `estado:'programada'` histórico → `'abierta'` (el ciclo de vida se simplificó a `abierta`/`cerrada`; el dot deriva de actividad real). Autosana `productos` por defecto + `fecha` de hoy si faltaban |

> **Regla de proceso:** todo cambio de forma del estado = subir `schemaVersion` + caso en `migrate()` + **tests primero**.

---

## 5 · Esquema Supabase (Opción C: híbrido relacional + JSONB)

IDs de texto del modelo (`'per…'`, `'prm…'`, `'cns…'`) se conservan como **PK `text`** (sin migrar a uuid → cero
cambios al modelo). Columnas indexables para filtrar + `data jsonb` para los snapshots congelados.

### Tablas (5)

| Tabla | Columnas indexables | `data jsonb` | Nota |
|---|---|---|---|
| `profiles` | `user_id` (PK → `auth.users`), `email`, `role` ∈ {admin,miembro} | — | rol por usuario; `is_admin()` = SECURITY DEFINER (evita recursión de RLS). Admin sembrado a mano |
| `settings` | `id='singleton'` (PK, check) | `{ cover{ahorrador,invitado}, defaultProducts[] }` | singleton global |
| `personas` | `id` (PK text), `nombre`, `estado` ∈ {ahorrador,invitado}, `breb` | — | directorio relacional; sede de la INVARIANTE #1 |
| `primadas` | `id` (PK text), `nombre`, `fecha date`, `mes_contable text`, `organizador_principal_id` (→ personas), `estado` ∈ {abierta,cerrada} | `{ pago{breB}, cover{…}, productos[], asistencias[] }` | snapshots congelados en jsonb. La columna DATE `fecha` es `NOT NULL` (placeholder `mes_contable-01` si vacía) |
| `consumos` | `id` (PK text), `primada_id` (FK→primadas), `persona_id` (FK→personas), `producto_id text`, `cantidad int default 1`, `apuntado_por uuid default auth.uid()`, `created_at timestamptz` | — | **relacional, NO en el jsonb** (v6). 1 fila = 1 pedido (append-only) → concurrencia sin lost-update. `replica identity full` (para realtime, Fase B) |

**Índices:** `primadas(fecha desc)`, `primadas(mes_contable)`, `primadas(estado)`. **Granularidad por fila:** editar
la primada A no pisa la B ni el directorio; los consumos son filas independientes.

### Mapeo modelo ↔ filas (`js/api.js`)
camelCase (modelo v6) ↔ snake_case (Supabase). Los snapshots van al `jsonb` **tal cual la forma del modelo** (sin aplanar):

| Modelo (camelCase) | Fila (snake_case) |
|---|---|
| `Persona.breB` | `personas.breb` |
| `Primada.mesContable` / `.organizadorPrincipalId` | `primadas.mes_contable` / `.organizador_principal_id` |
| `Primada.{pago,cover,productos,asistencias}` | `primadas.data` (jsonb) |
| `Consumo.{personaId,productoId,apuntadoPor,createdAt}` | `consumos.{persona_id,producto_id,apuntado_por,created_at}` (tabla aparte) |
| `settings.{cover,defaultProducts}` | `settings.data` (jsonb), `id='singleton'` |

> ⚠️ **`supabase/schema.sql` + `EXEC-LOG.md` son la BASE (4 tablas: profiles/settings/personas/primadas, SELECT solo
> `authenticated`).** Los **deltas de v6** — tabla `consumos`, **SELECT abierto a `anon`** (gate invertido), policy que
> bloquea `INSERT` de consumo en primada cerrada, y `consumos` en la publicación `supabase_realtime` — se aplicaron en
> la **sesión dedicada de Supabase** (ver `CLAUDE.md` › Backend Fase A/B/C, verificado contra Supabase real). El archivo
> `schema.sql` está **pendiente de actualizar** a ese estado.

---

## 6 · Seguridad — RLS (frontera real, estado VIGENTE)

RLS es la frontera de seguridad (no el frontend). **Gate INVERTIDO:** la app carga en **LECTURA con solo el link**
(SELECT anon); el login (OTP por código) salta al intentar **ESCRIBIR**.

| Tabla | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `primadas` | **anon** + autenticados | autenticados | autenticados (escritura completa) |
| `consumos` | **anon** + autenticados | autenticados **si la primada NO está cerrada** (subquery en la policy) | autenticados |
| `personas` | **anon** + autenticados | autenticados (en plena primada cualquiera agrega) | **solo admin** (`is_admin()`) |
| `settings` | **anon** + autenticados | — | **solo admin** |
| `profiles` | autenticados (transparencia de roles) | — | **solo admin** |

**Principios:** transparencia total (todos ven todo); el **admin** controla además directorio y settings global.
`breB` es **público** (llave para **recibir** pagos; no es dato sensible). La `anon key` en el bundle es **por diseño**;
**NUNCA** exponer la `service_role key` — RLS protege. **Primer editor sembrado:** `jdvlazio@gmail.com` (admin).

**Auth — código OTP (passwordless), sin registro:** Supabase Auth con **código por email** (plantilla con `{{ .Token }}`,
`signInWithOtp` sin `emailRedirectTo`). Nadie se registra: el admin **siembra** los emails. Login **OPT-IN**: la app entra
directo y es usable; el login se abre al escribir (o desde el ícono de Cuenta).

**Realtime (Fase B, ACTIVO):** `consumos` en la publicación `supabase_realtime` (replica identity full). Patrón
**snapshot + incremental**: `Api.subscribeConsumos(primadaId,…)` (Postgres Changes) + `Api.fetchConsumos` (snapshot);
el controller mantiene UNA suscripción a la primada activa y re-snapshota al reconectar. **GOTCHA verificado:** con RLS,
el evento DELETE de Postgres Changes trae **solo la PK** → se entrega por id (ids únicos globales); INSERT/UPDATE traen
la fila completa → filtrados por `primada_id` en el cliente.

---

## 7 · Arranque y caché

- **Arranque limpio:** se arrancó en Supabase; **no se migró localStorage** (los datos de prueba no tenían valor real).
- **Caché offline = solo LECTURA:** localStorage espeja el último estado (`cacheWrite`/`cacheRead`) para ver datos sin
  conexión y arranque en frío. La **fuente de verdad es Supabase**; nunca se escribe lógica de dominio a localStorage.
- **Render optimista:** las acciones mutan en memoria → render inmediato → upsert async en background; si falla, el
  usuario lo ve (indicador de sync con error).
- **Cola de tránsito de ESCRITURA (Fase C):** además del espejo de lectura, una **cola persistente** (`localStorage`
  clave `laPrimada_cola`, SEPARADA del estado de dominio) guarda las escrituras pendientes sin red; se vacía al
  reconectar (evento `online`) y se descarta si el backend la rechaza definitivamente (RLS/validación). Vive dentro de
  `js/api.js` (el Store no la conoce; recibe `{pendientes,error}` vía `Api.onQueueChange` para el indicador).
