# La Primada — Guía del proyecto (CLAUDE.md)

App para llevar la cuenta de las **primadas**: encuentros mensuales de primos.
Cada primada pertenece a una familia, tiene asistentes (con consumos y cover) y
se guarda mes a mes. Hospedada en GitHub Pages: https://jdvlazio.github.io/la-primada/

## Stack y restricciones (no negociables)
- **Un solo archivo `index.html`** en la raíz. Sin build, sin bundler, sin npm en producción.
- Es lo que GitHub Pages sirve y lo que se itera desde el celular. No partir en múltiples archivos.
- Fuentes desde CDN de Google (Bricolage Grotesque + Space Mono). CSS y JS embebidos.
- Moneda y formato: pesos colombianos, locale `es-CO`.
- Sin librerías de frontend (no React/Vue). Vanilla JS.

## Arquitectura MVC (regla central)
El JS está dividido en cuatro bloques, en este orden. **Respetar la separación es la regla #1.**
- `CONFIG` — constantes y valores por defecto (productos, cover, locale).
- `Store` (MODELO) — **único dueño del estado**. Único lugar donde el estado muta, vía *acciones*.
  Expone `select` (lectura/derivados) y `actions` (mutaciones). Persiste en localStorage.
- `View` (VISTA) — funciones puras estado→DOM. **No** muta estado ni toca persistencia.
- `Controller` — escucha eventos (delegación) y llama `Store.actions`. **No** dibuja ni persiste.
- Flujo único e inviolable: **evento → acción → commit (guarda) → notifica → render**.
- La Vista se suscribe a Store y **re-renderiza la lista completa** en cada cambio.
  Es deliberado (la UI siempre refleja el estado). Si en el futuro hace falta, optimizar a
  updates dirigidos — pero no antes de que el tamaño real lo justifique.

## Modelo de datos (esquema v3)
```
AppState  { schemaVersion, settings{cover{ahorrador,invitado}, defaultProducts[]}, primadas[], activePrimadaId }
Primada   { id, familia, fecha('YYYY-MM'), cover{ahorrador,invitado}, productos[], asistentes[], estado('abierta'|'cerrada') }
Asistente { id, nombre, tipo('ahorrador'|'invitado'), coverExonerado(bool), items{productoId: cantidad} }
Producto  { id, name, emoji, price }
```
- Total asistente = `cover (si no exonerado) + Σ(consumos)`. Total primada = Σ asistentes.

## Reglas de datos y migraciones (evitan cambios traumáticos)
- **Snapshot de precios:** al crear una primada se copian cover y productos desde `settings`.
  Editar los valores globales NO reescribe primadas pasadas. La historia es inmutable.
- **Toda cambio de forma del estado = subir `schemaVersion` + agregar caso en `Store.migrate()`.**
  Nunca cambiar la forma de los datos sin su migración. `migrate()` ya maneja v1→v2→v3.
- Datos corruptos o nulos → `defaultState()`. Nunca romper al cargar.

## Convenciones
- Comentarios y nombres de dominio en español (familia, asistente, primada, cover).
- IDs vía `Util.uid(prefix)`. Escapar texto de usuario con `Util.esc()` antes de inyectar HTML.
- Acciones nuevas van en `Store.actions`; selectores/derivados en `Store.select`. Nada de lógica en la Vista.

## Pruebas (correr antes de dar por terminado un cambio)
- Sintaxis: extraer el `<script>` y `node --check`.
- Cambios de modelo/migración: test en Node alimentando datos v1/v2/v3 y verificando totales.
- Flujo MVC: test e2e con `jsdom` manejando la app por clics reales (caja negra),
  re-consultando nodos tras cada render (la Vista redibuja, los refs viejos quedan obsoletos).
- Mantener los tests en `tests/` y correrlos antes de cada commit.

## Despliegue
- El deployable es `index.html` en la raíz. GitHub Pages (rama `main`, root) publica solo.
- Tras push, Pages actualiza en ~1 min. Si no se ve el cambio, es caché: forzar recarga o `?v=N`.
- Token de deploy es del usuario; pedirlo solo cuando se necesite y nunca guardarlo en el repo.

## Roadmap
- [x] Paso 0: arquitectura MVC + migraciones, verificada con tests.
- [x] Paso 1: dominio Primadas (crear/listar/seleccionar/renombrar/borrar) + migración v2→v3.
- [ ] Paso 2: montos reales del cover + selector de tipo (ahorrador/invitado) + toggle exonerar en la tarjeta.
- [ ] Paso 3: resumen por primada (recaudo cover, total consumos, conteo ahorradores/invitados).
- [ ] Paso 4: editar productos y cover sobre la marcha (acciones addProduct/updateProduct/removeProduct ya existen en Store).
- [ ] Paso 5: cerrar/reabrir primada (estado), bloqueo de edición.
- [ ] Futuro: directorio de primos reutilizable + estadísticas mensuales (requiere migración nueva).

## Decisiones de producto ya tomadas
- Cover **fijo** para todas las primadas (vive en `settings`, una sola fuente; se copia a cada primada al crearse).
- Cover se cobra **por tipo** (ahorrador/invitado), con opción de **exonerar** a asistentes puntuales.
- Asistentes viven **dentro de cada primada** (aún no hay directorio global de primos).

## Cómo trabajamos
- Las **decisiones de producto/arquitectura** se toman fuera de código (chat PM) y se reflejan aquí.
- El **trabajo de código** lo hace Claude Code: implementa el roadmap respetando esta guía, corre pruebas y commitea.
- Ante una decisión de producto ambigua, **preguntar** antes de inventar; no cambiar el alcance por cuenta propia.
