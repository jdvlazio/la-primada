/* ============================================================
   MODELO — Store (único dueño del estado) · esquema v4 DEFINITIVO
   Se carga tras CONFIG y Util.
   ------------------------------------------------------------
   AppState  { schemaVersion:5, settings{cover,defaultProducts}, personas[], primadas[], activePrimadaId }
   Persona   { id, nombre, estado:'ahorrador'|'invitado', breB }
   Primada   { id, nombre, fecha:'YYYY-MM-DD', mesContable:'YYYY-MM', organizadorPrincipalId,
               pago{breB}, cover{ahorrador,invitado}, productos[], asistencias[], estado }
   Producto  { id, nombre, emoji, costoNeto, precioVenta, aportadoPor }
   Asistencia{ personaId, estadoEnEseMomento, rol:'principal'|'organizador'|'asistente',
               coverExonerado, items{prodId:cant}, pagado:bool }   // pagado = saldó su total (binario)
   ------------------------------------------------------------
   Flujo: evento → acción → commit (guarda) → notifica → render.
   Las ACCIONES hacen cumplir los invariantes (ver CLAUDE.md).
   ============================================================ */
(function (root) {
  'use strict';

  const CONFIG = root.CONFIG || (typeof require !== 'undefined' ? require('./config.js').CONFIG : {});
  const Util   = root.Util   || (typeof require !== 'undefined' ? require('./util.js').Util   : {});
  const Api    = root.Api    || (typeof require !== 'undefined' ? require('./api.js').Api     : null);

  let state = null;
  const listeners = [];
  const syncListeners = [];     // observadores del estado de sincronización (para el indicador "sin sincronizar")

  /* ---------- Estado por defecto ---------- */
  function defaultState() {
    return {
      schemaVersion: CONFIG.schemaVersion,
      settings: { cover: { ...CONFIG.defaultCover }, defaultProducts: CONFIG.defaultProducts.map(p => ({ ...p })) },
      personas: [],
      primadas: [],
      activePrimadaId: null,
    };
  }

  // Catálogo base (con costoNeto real) para settings; catálogo "histórico" sin costos (margen 0) para envolver datos viejos.
  function catalogoBase()      { return CONFIG.defaultProducts.map(p => ({ ...p })); }
  function catalogoHistorico() { return CONFIG.defaultProducts.map(p => ({ id: p.id, nombre: p.nombre, emoji: p.emoji, precioVenta: p.precioVenta })); }

  /* ---------- Normalizadores (tolerantes) ---------- */
  function normEstado(t) { return t === 'invitado' ? 'invitado' : 'ahorrador'; }
  function normRol(r)    { return (r === 'principal' || r === 'organizador') ? r : 'asistente'; }
  function normCover(c)  { return { ahorrador: Number((c || {}).ahorrador) || 0, invitado: Number((c || {}).invitado) || 0 }; }
  function normFecha(f) {
    const s = String(f || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}$/.test(s)) return s + '-01';
    return Util.currentDate();
  }
  function normProducts(arr) {
    return (arr || []).map(p => {
      const precioVenta = Number(p.precioVenta != null ? p.precioVenta : p.price) || 0;
      // costoNeto: usa el que venga (incl. costoReal de borradores); si no, = precioVenta (margen 0, sin inventar costos).
      const costoNetoRaw = (p.costoNeto != null) ? p.costoNeto : (p.costoReal != null ? p.costoReal : precioVenta);
      return {
        id: p.id || Util.uid('prod'),
        nombre: String(p.nombre || p.name || 'Ítem').slice(0, 40),
        emoji: p.emoji || '•',
        costoNeto: Number(costoNetoRaw) || 0,
        precioVenta,
        aportadoPor: p.aportadoPor || null,
      };
    });
  }
  function normItems(productos, raw) {
    const items = {};
    productos.forEach(prod => { items[prod.id] = Math.max(0, parseInt((raw || {})[prod.id]) || 0); });
    return items;
  }
  /* ---------- Migración: cualquier dato viejo → v5 ---------- */
  function migrate(raw) {
    if (raw == null) return defaultState();

    // Ya tiene forma v4 (personas[] + primadas[]) → normalizar tolerante (sube también borradores parciales)
    if (typeof raw === 'object' && Array.isArray(raw.personas) && Array.isArray(raw.primadas)) {
      return normV4(raw);
    }
    // v3: primadas[] con asistentes{tipo,nombre} y Producto.price
    if (typeof raw === 'object' && Array.isArray(raw.primadas)) {
      return migrateV3toV4(raw);
    }
    // v1 (arreglo pelado) / v2 ({products, people}) → envolver como una primada (cover 0, no había) y migrar como v3
    let products = catalogoHistorico(), people = [];
    if (Array.isArray(raw)) {
      people = raw;
    } else if (typeof raw === 'object') {
      if (Array.isArray(raw.products) && raw.products.length) products = raw.products;
      if (Array.isArray(raw.people)) people = raw.people;
    }
    const pseudoV3 = {
      settings: { defaultProducts: products },
      primadas: [{
        nombre: 'Primada actual',
        fecha: Util.currentMonth(),
        cover: { ahorrador: 0, invitado: 0 },        // v1/v2 no cobraban cover: no inventamos cargos
        productos: products,
        asistentes: people.map(pe => ({ nombre: pe.name || pe.nombre, tipo: pe.tipo, items: pe.items })),
        estado: 'abierta',
      }],
      activePrimadaId: null,
    };
    return migrateV3toV4(pseudoV3);
  }

  // v3 → v4: levanta el directorio de personas desde los asistentes y congela el snapshot por asistencia.
  function migrateV3toV4(raw) {
    const s = defaultState();
    // Cover VIGENTE: se preserva si venía; si no, queda el sugerido (solo afecta el valor actual, no la historia).
    s.settings.cover = (raw.settings && raw.settings.cover) ? normCover(raw.settings.cover) : { ...CONFIG.defaultCover };
    s.settings.defaultProducts = normProducts(
      (raw.settings && raw.settings.defaultProducts && raw.settings.defaultProducts.length)
        ? raw.settings.defaultProducts : catalogoBase()
    );

    const primadasRaw = raw.primadas || [];

    // --- Pase 1: directorio de personas. Última aparición (por fecha) gana el estado VIGENTE. ---
    const byNombre = new Map();
    primadasRaw.map((p, i) => ({ p, i }))
      .sort((a, b) => { const fa = String(a.p.fecha || ''), fb = String(b.p.fecha || ''); return fa < fb ? -1 : fa > fb ? 1 : a.i - b.i; })
      .forEach(({ p }) => {
        (p.asistentes || []).forEach(a => {
          const nombre = String(a.nombre || a.name || 'Primo').slice(0, 40);
          const estado = normEstado(a.tipo);
          let per = byNombre.get(nombre);
          if (!per) { per = { id: Util.uid('per'), nombre, estado, breB: null }; byNombre.set(nombre, per); s.personas.push(per); }
          else { per.estado = estado; }   // procesamos viejo→nuevo: la aparición más reciente gana
        });
      });

    // --- Pase 2: primadas en su orden original; asistencias enlazadas + snapshot inmutable. ---
    s.primadas = primadasRaw.map(p => {
      const productos = normProducts(p.productos && p.productos.length ? p.productos : catalogoHistorico());
      const fecha = normFecha(p.fecha);
      const asistencias = (p.asistentes || []).map(a => {
        const nombre = String(a.nombre || a.name || 'Primo').slice(0, 40);
        const per = byNombre.get(nombre);
        return {
          personaId: per ? per.id : null,
          estadoEnEseMomento: normEstado(a.tipo),      // SNAPSHOT, independiente del estado actual
          rol: 'asistente',
          coverExonerado: !!a.coverExonerado,
          items: normItems(productos, a.items),
          pagado: false,
        };
      });
      return {
        id: p.id || Util.uid('prm'),
        nombre: String(p.nombre || p.familia || 'Primada').slice(0, 40),
        fecha,
        mesContable: Util.mesDeFecha(fecha),
        organizadorPrincipalId: null,                  // incompleta: principal desconocido en datos viejos
        pago: { breB: null },
        cover: normCover(p.cover),                     // SNAPSHOT preservado (no se reescribe historia)
        productos,
        asistencias,
        estado: p.estado === 'cerrada' ? 'cerrada' : 'abierta',
      };
    });

    s.activePrimadaId = s.primadas.some(p => p.id === raw.activePrimadaId)
      ? raw.activePrimadaId : (s.primadas[0] ? s.primadas[0].id : null);
    return s;
  }

  // v4 → v4: normaliza tolerante conservando ids (idempotente). Rellena campos faltantes con defaults.
  function normV4(raw) {
    const s = defaultState();
    s.settings.cover = (raw.settings && raw.settings.cover) ? normCover(raw.settings.cover) : { ...CONFIG.defaultCover };
    s.settings.defaultProducts = normProducts(
      (raw.settings && raw.settings.defaultProducts && raw.settings.defaultProducts.length)
        ? raw.settings.defaultProducts : catalogoBase()
    );

    s.personas = (raw.personas || []).map(p => ({
      id: p.id || Util.uid('per'),
      nombre: String(p.nombre || 'Primo').slice(0, 40),
      estado: normEstado(p.estado),
      breB: (p.breB != null && p.breB !== '') ? String(p.breB) : null,
    }));

    s.primadas = (raw.primadas || []).map(p => {
      const productos = normProducts(p.productos && p.productos.length ? p.productos : catalogoBase());
      const fecha = normFecha(p.fecha);
      const asisRaw = Array.isArray(p.asistencias) ? p.asistencias : (Array.isArray(p.asistentes) ? p.asistentes : []);
      const asistencias = asisRaw.map(a => {
        const rol = normRol(a.rol);
        const estado = normEstado(a.estadoEnEseMomento != null ? a.estadoEnEseMomento : a.tipo);
        const items = normItems(productos, a.items);
        // pagado (v5, BINARIO): si ya viene → respetar; migración v4 (abonos[]) → pagado solo si los
        // abonos cubrían el total; el principal queda auto-saldado (true). Reemplaza el historial de abonos.
        let pagado;
        if (typeof a.pagado === 'boolean') pagado = a.pagado;
        else if (rol === 'principal') pagado = true;
        else {
          const consumo = productos.reduce((s, prod) => s + (Number(prod.precioVenta) || 0) * (items[prod.id] || 0), 0);
          const cover = (rol === 'asistente' && !a.coverExonerado) ? (Number((p.cover || {})[estado]) || 0) : 0;
          const abon = Array.isArray(a.abonos) ? a.abonos.reduce((s, b) => s + (Number(b.monto) || 0), 0) : 0;
          pagado = (consumo + cover) > 0 && abon >= (consumo + cover);
        }
        return { personaId: a.personaId || null, estadoEnEseMomento: estado, rol, coverExonerado: !!a.coverExonerado, items, pagado };
      });

      // Reconciliar el principal con un único rol coherente.
      let principalId = (p.organizadorPrincipalId != null && asistencias.some(a => a.personaId === p.organizadorPrincipalId))
        ? p.organizadorPrincipalId : null;
      if (principalId) {
        asistencias.forEach(a => { if (a.personaId === principalId) a.rol = 'principal'; else if (a.rol === 'principal') a.rol = 'organizador'; });
      } else {
        const prin = asistencias.filter(a => a.rol === 'principal');
        if (prin.length === 1) { principalId = prin[0].personaId; }
        else { asistencias.forEach(a => { if (a.rol === 'principal') a.rol = 'organizador'; }); }
      }

      return {
        id: p.id || Util.uid('prm'),
        nombre: String(p.nombre || p.familia || 'Primada').slice(0, 40),
        fecha,
        mesContable: /^\d{4}-\d{2}$/.test(String(p.mesContable)) ? p.mesContable : Util.mesDeFecha(fecha),
        organizadorPrincipalId: principalId,
        pago: { breB: (p.pago && p.pago.breB != null && p.pago.breB !== '') ? String(p.pago.breB) : null },
        cover: normCover(p.cover),
        productos,
        asistencias,
        estado: p.estado === 'cerrada' ? 'cerrada' : 'abierta',
      };
    });

    s.activePrimadaId = s.primadas.some(p => p.id === raw.activePrimadaId)
      ? raw.activePrimadaId : (s.primadas[0] ? s.primadas[0].id : null);
    return s;
  }

  /* ---------- Persistencia (vía adaptador Api: localStorage en tests/offline, Supabase en prod) ----------
     El Store NO habla con el SDK: todo pasa por Api. Render OPTIMISTA: la acción ya mutó el estado
     en memoria; commit() notifica de inmediato (render) y dispara el upsert async en background.
     Si el upsert falla, NO se revierte (no perder lo tecleado): se marca "sin sincronizar", se avisa
     (toast) y se reintenta. activePrimadaId es LOCAL por dispositivo: no se sincroniza. */

  // --- estado de sincronización (alimenta el indicador "sin sincronizar" del header) ---
  const sync = { pendientes: 0, error: null };
  function emitSync() { const snap = { pendientes: sync.pendientes, error: sync.error }; syncListeners.forEach(fn => fn(snap)); }
  function subscribeSync(fn) { syncListeners.push(fn); }
  function syncState() { return { pendientes: sync.pendientes, error: sync.error }; }

  // Espejo local del activePrimadaId (decisión: local por dispositivo, no viaja a Supabase).
  function loadLocalActiveId() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      return raw && raw.activePrimadaId || null;
    } catch (e) { return null; }
  }

  // Dispara el upsert async de un target con reintento acotado. Optimista: no bloquea el render.
  function pushUpsert(target, intento) {
    if (!Api || !target) return;
    intento = intento || 0;
    sync.pendientes++; emitSync();
    Promise.resolve(Api.commit(state, target))
      .then(() => { sync.pendientes = Math.max(0, sync.pendientes - 1); sync.error = null; emitSync(); })
      .catch((err) => {
        sync.pendientes = Math.max(0, sync.pendientes - 1);
        if (intento < 3) {
          const espera = 800 * (intento + 1);
          sync.error = 'Reintentando guardar… (' + (intento + 1) + '/3)'; emitSync();
          setTimeout(() => pushUpsert(target, intento + 1), espera);
        } else {
          sync.error = (err && err.message) ? err.message : 'No se pudo guardar en la nube';
          emitSync();
        }
      });
  }

  // load() ASYNC: hidrata el AppState desde Api (Supabase o espejo local) y le aplica migrate()
  // (reusa el normalizador tolerante). Superpone el activePrimadaId local. Nunca rompe al cargar.
  async function load() {
    try {
      const raw = Api ? await Api.load() : null;
      state = migrate(raw);
    } catch (e) { state = defaultState(); }
    const localActive = loadLocalActiveId();
    if (localActive && state.primadas.some(p => p.id === localActive)) state.activePrimadaId = localActive;
    return state;
  }

  function notify() { listeners.forEach(fn => fn(state)); }

  // Refresca el espejo local (caché de lectura) sin tocar la red. Para cambios LOCALES
  // (p.ej. activePrimadaId) que igual deben sobrevivir a un refresh en este dispositivo.
  function mirrorLocal() { if (Api && Api._cacheWrite) Api._cacheWrite(state); }

  // commit(target): render inmediato (optimista) + upsert async en background.
  // target = { kind:'persona'|'primada'|'settings', id, op? } → upsert remoto + espejo.
  // target { local:true } o sin target → solo notifica + espeja (cambio local, sin red).
  function commit(target) {
    notify();
    if (target && target.kind) pushUpsert(target);
    else mirrorLocal();
  }

  // commitQuiet(target): edición de texto en vivo (no re-render para no romper foco/cursor).
  // DEBOUNCED ~500ms por target para no escribir a la red por tecla; flushQuiet() fuerza el envío (blur).
  const quietTimers = {};
  function quietKey(t) { return t ? (t.kind + ':' + (t.id || '')) : 'none'; }
  function commitQuiet(target) {
    if (!Api || !target) return;
    const k = quietKey(target);
    if (quietTimers[k]) clearTimeout(quietTimers[k]);
    quietTimers[k] = setTimeout(() => { delete quietTimers[k]; pushUpsert(target); }, 500);
  }
  // Fuerza el envío inmediato de cualquier edición de texto pendiente (llamar en blur).
  function flushQuiet() {
    Object.keys(quietTimers).forEach(k => {
      clearTimeout(quietTimers[k]); delete quietTimers[k];
      const [kind, id] = k.split(':');
      pushUpsert({ kind, id: id || undefined });
    });
  }

  function subscribe(fn) { listeners.push(fn); }

  /* ---------- Helpers de derivación ---------- */
  function unidadesVendidas(primada, prod) { return (primada.asistencias || []).reduce((sum, a) => sum + (a.items[prod.id] || 0), 0); }
  function aportanteEfectivo(primada, prod) { return prod.aportadoPor || primada.organizadorPrincipalId || null; }
  function findPrimada(id) { return state ? (state.primadas.find(p => p.id === id) || null) : null; }

  /* ---------- Selectores (lectura / derivados puros) ---------- */
  const select = {
    state: () => state,
    activePrimada: () => (state ? state.primadas.find(p => p.id === state.activePrimadaId) || null : null),
    persona: (id) => (state ? state.personas.find(p => p.id === id) || null : null),
    personasOrdenadas: () => (state ? state.personas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, CONFIG.locale)) : []),
    ahorradores: () => (state ? state.personas.filter(p => p.estado === 'ahorrador') : []),
    invitados: () => (state ? state.personas.filter(p => p.estado === 'invitado') : []),
    // En cuántas primadas aparece la persona (refuerza que su historia se conserva al cambiar de estado).
    aparicionesDe: (personaId) => (state ? state.primadas.reduce((n, p) =>
      n + (p.asistencias.some(a => a.personaId === personaId) ? 1 : 0), 0) : 0),

    margenProducto: (prod) => (Number(prod.precioVenta) || 0) - (Number(prod.costoNeto) || 0),
    esOrganizador: (a) => a.rol === 'principal' || a.rol === 'organizador',
    aplicaCover: (a) => a.rol === 'asistente' && !a.coverExonerado,
    coverDe(primada, a) { return select.aplicaCover(a) ? (primada.cover[a.estadoEnEseMomento] || 0) : 0; },
    consumoDe(primada, a) { return primada.productos.reduce((sum, prod) => sum + (prod.precioVenta || 0) * (a.items[prod.id] || 0), 0); },
    // Progressive disclosure del consumo: lo consumido (cantidad>0) vs lo disponible para agregar (cantidad=0).
    // Puros y en orden del catálogo de la primada. consumidosDe.length + disponiblesPara.length === productos.length.
    consumidosDe(primada, a) { return primada.productos.filter(prod => (a.items[prod.id] || 0) > 0); },
    disponiblesPara(primada, a) { return primada.productos.filter(prod => (a.items[prod.id] || 0) === 0); },
    totalAsistencia(primada, a) { return select.coverDe(primada, a) + select.consumoDe(primada, a); },
    esPrincipal(primada, a) { return a.personaId != null && a.personaId === primada.organizadorPrincipalId; },
    // Saldo BINARIO: el principal está auto-saldado (plata en mano); un asistente debe su total
    // completo hasta que marca "pagado" (entonces 0). No hay pagos parciales (v5).
    saldoDe(primada, a) { return (select.esPrincipal(primada, a) || a.pagado) ? 0 : select.totalAsistencia(primada, a); },

    recaudado(primada) { return (primada.asistencias || []).reduce((sum, a) => sum + select.totalAsistencia(primada, a), 0); },
    ventaProductos(primada) { return primada.productos.reduce((sum, prod) => sum + (prod.precioVenta || 0) * unidadesVendidas(primada, prod), 0); },
    costoNetoTotal(primada) { return primada.productos.reduce((sum, prod) => sum + (prod.costoNeto || 0) * unidadesVendidas(primada, prod), 0); },
    coverCobrado(primada) { return (primada.asistencias || []).reduce((sum, a) => sum + select.coverDe(primada, a), 0); },
    margenTotal(primada) { return select.ventaProductos(primada) - select.costoNetoTotal(primada); },
    ganancia(primada) { return select.coverCobrado(primada) + select.margenTotal(primada); },

    asistenciasAhorradoras(primada) { return (primada.asistencias || []).filter(a => a.estadoEnEseMomento === 'ahorrador'); },
    parteIgual(primada) { const n = select.asistenciasAhorradoras(primada).length; return n ? Math.floor(select.ganancia(primada) / n) : 0; },
    sobranteFondo(primada) { const n = select.asistenciasAhorradoras(primada).length; return select.ganancia(primada) - select.parteIgual(primada) * n; },
    repartoPorPersona(primada) { const pi = select.parteIgual(primada); const r = {}; select.asistenciasAhorradoras(primada).forEach(a => { r[a.personaId] = pi; }); return r; },

    recuperaDe(primada, personaId) {
      return primada.productos.reduce((sum, prod) =>
        aportanteEfectivo(primada, prod) === personaId ? sum + (prod.costoNeto || 0) * unidadesVendidas(primada, prod) : sum, 0);
    },
    informePrincipal(primada) {
      const pid = primada.organizadorPrincipalId;
      const recaudadoTeorico = select.recaudado(primada);
      // Pagos REALES de terceros (no el principal): el total de los que marcaron "pagado".
      const pagadoTerceros = (primada.asistencias || []).reduce((sum, a) =>
        (select.esPrincipal(primada, a) || !a.pagado) ? sum : sum + select.totalAsistencia(primada, a), 0);
      // El principal tiene su parte EN MANO: su total cuenta como ABONO AUTOMÁTICO (no es deuda).
      // Así el pendiente refleja solo deuda de terceros y la identidad real+pendiente=teórico se mantiene.
      const principalAsis = (primada.asistencias || []).find(a => select.esPrincipal(primada, a));
      const autoAbonoPrincipal = principalAsis ? select.totalAsistencia(primada, principalAsis) : 0;
      const recaudadoReal = pagadoTerceros + autoAbonoPrincipal;
      return {
        incompleta: pid == null,
        recaudadoTeorico,
        recuperaPrincipal: pid ? select.recuperaDe(primada, pid) : 0,
        entregaTesorero: select.ganancia(primada),
        pagadoTerceros,
        autoAbonoPrincipal,
        recaudadoReal,
        saldoPendiente: recaudadoTeorico - recaudadoReal,   // = Σ saldos de los terceros
      };
    },
    deudores(primada) {
      return (primada.asistencias || [])
        .map(a => ({ personaId: a.personaId, saldo: select.saldoDe(primada, a) }))
        .filter(d => d.saldo > 0);
    },

    primadaIncompleta(primada) { return primada.organizadorPrincipalId == null; },
    // Nombre automático: "Primada {N1} + {N2}" con el PRIMER token del nombre de cada persona.
    // N1 = principal (primero de la lista). N2 = segundo organizador. Solo los dos primeros entran
    // (3+ organizadores → igual solo N1 + N2). Un solo organizador → "Primada {N1}" (sin el +).
    nombreSugerido(organizadorIds) {
      const primerToken = s => String(s || '').trim().split(/\s+/)[0] || '';
      const nombres = (organizadorIds || [])
        .map(id => { const p = select.persona(id); return p ? primerToken(p.nombre) : null; })
        .filter(Boolean);
      if (!nombres.length) return 'Primada';
      if (nombres.length === 1) return 'Primada ' + nombres[0];
      return 'Primada ' + nombres[0] + ' + ' + nombres[1];
    },
    anioContable(primada) { return String(primada.mesContable || '').slice(0, 4); },
    // Primadas agrupadas por AÑO → (dentro) por MES, más reciente arriba. Para el selector del tab.
    // → [{ anio:'2026', primadas:[…ordenadas por mesContable desc, desempate fecha desc] }, …]
    primadasPorAnio() {
      const grupos = {};
      state.primadas.forEach(p => {
        const anio = select.anioContable(p) || '—';
        (grupos[anio] = grupos[anio] || []).push(p);
      });
      const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
      return Object.keys(grupos).sort(desc).map(anio => ({
        anio,
        primadas: grupos[anio].slice().sort((a, b) =>
          a.mesContable !== b.mesContable ? desc(a.mesContable, b.mesContable) : desc(a.fecha, b.fecha)),
      }));
    },
  };

  /* ---------- Acciones (único punto que muta; hacen cumplir invariantes) ---------- */
  const actions = {
    // ----- personas -----
    addPersona({ nombre, estado, breB } = {}) {
      const per = { id: Util.uid('per'), nombre: String(nombre || 'Persona').slice(0, 40), estado: normEstado(estado), breB: (breB != null && breB !== '') ? String(breB) : null };
      state.personas.push(per); commit({ kind: 'persona', id: per.id }); return per.id;
    },
    // INVARIANTE #1 (inmutabilidad histórica): solo cambia el estado VIGENTE; NUNCA toca estadoEnEseMomento de asistencias.
    setEstadoPersona(personaId, estado) { const per = select.persona(personaId); if (!per) return; per.estado = normEstado(estado); commit({ kind: 'persona', id: personaId }); },
    renombrarPersona(personaId, nombre) { const per = select.persona(personaId); if (!per) return; per.nombre = String(nombre || per.nombre).slice(0, 40); commitQuiet({ kind: 'persona', id: personaId }); },
    setBreBPersona(personaId, breB) { const per = select.persona(personaId); if (!per) return; per.breB = (breB != null && breB !== '') ? String(breB) : null; commitQuiet({ kind: 'persona', id: personaId }); },

    // ----- settings -----
    setCover({ ahorrador, invitado } = {}) {
      if (ahorrador != null) state.settings.cover.ahorrador = Number(ahorrador) || 0;
      if (invitado != null) state.settings.cover.invitado = Number(invitado) || 0;
      commitQuiet({ kind: 'settings' });
    },
    upsertDefaultProducto(prod) {
      const np = normProducts([prod])[0];
      const i = state.settings.defaultProducts.findIndex(p => p.id === np.id);
      if (i >= 0) state.settings.defaultProducts[i] = np; else state.settings.defaultProducts.push(np);
      commit({ kind: 'settings' });
    },
    removeDefaultProducto(id) { state.settings.defaultProducts = state.settings.defaultProducts.filter(p => p.id !== id); commit({ kind: 'settings' }); },

    // ----- ciclo de primada -----
    createPrimada({ fecha, mesContable, organizadores, principalId, nombre, productos } = {}) {
      organizadores = Array.isArray(organizadores) ? organizadores.slice() : [];
      if (principalId && !organizadores.includes(principalId)) organizadores.unshift(principalId);
      // INVARIANTE #2: el principal debe ser ahorrador (estado vigente al crear → snapshot ahorrador).
      let principalPer = null;
      if (principalId) {
        principalPer = select.persona(principalId);
        if (!principalPer) throw new Error('createPrimada: el organizador principal no existe');
        if (principalPer.estado !== 'ahorrador') throw new Error('createPrimada: el organizador principal debe ser ahorrador');
      }
      const f = normFecha(fecha || Util.currentDate());
      // productos: si el wizard pasa un set propio (editado/desde cero) se usa ese (snapshot del evento);
      // si no, se copia el catálogo por defecto. En ambos casos aportadoPor por defecto = principal.
      const baseProductos = (Array.isArray(productos) && productos.length) ? productos : state.settings.defaultProducts;
      const productos_ = normProducts(baseProductos).map(x => ({ ...x, aportadoPor: x.aportadoPor || principalId || null }));
      const asistencias = organizadores.map(pid => {
        const per = select.persona(pid);
        return {
          personaId: pid,
          estadoEnEseMomento: per ? normEstado(per.estado) : 'ahorrador',
          rol: pid === principalId ? 'principal' : 'organizador',
          coverExonerado: false,
          items: normItems(productos_, {}),
          pagado: false,
        };
      });
      const prm = {
        id: Util.uid('prm'),
        nombre: (nombre && String(nombre).trim()) ? String(nombre).slice(0, 40) : select.nombreSugerido(organizadores),
        fecha: f,
        mesContable: /^\d{4}-\d{2}$/.test(String(mesContable)) ? mesContable : Util.mesDeFecha(f),
        organizadorPrincipalId: principalId || null,
        pago: { breB: principalPer ? principalPer.breB : null },
        cover: { ...state.settings.cover },        // SNAPSHOT del cover vigente
        productos: productos_, asistencias,
        estado: 'abierta',
      };
      state.primadas.unshift(prm);
      state.activePrimadaId = prm.id;
      commit({ kind: 'primada', id: prm.id }); return prm.id;
    },
    // activePrimadaId es LOCAL por dispositivo → no se sincroniza; solo se espeja local.
    seleccionarPrimada(id) { if (findPrimada(id)) { state.activePrimadaId = id; commit({ local: true }); } },
    renombrarPrimada(id, nombre) { const p = findPrimada(id); if (!p) return; p.nombre = String(nombre || p.nombre).slice(0, 40); commitQuiet({ kind: 'primada', id }); },
    setFecha(id, fecha) { const p = findPrimada(id); if (!p) return; p.fecha = normFecha(fecha); commitQuiet({ kind: 'primada', id }); },
    setMesContable(id, mes) { const p = findPrimada(id); if (!p) return; if (/^\d{4}-\d{2}$/.test(String(mes))) { p.mesContable = mes; commitQuiet({ kind: 'primada', id }); } },
    cerrarPrimada(id) { const p = findPrimada(id); if (!p) return; p.estado = 'cerrada'; commit({ kind: 'primada', id }); },
    reabrirPrimada(id) { const p = findPrimada(id); if (!p) return; p.estado = 'abierta'; commit({ kind: 'primada', id }); },
    borrarPrimada(id) {
      state.primadas = state.primadas.filter(p => p.id !== id);
      if (state.activePrimadaId === id) state.activePrimadaId = state.primadas[0] ? state.primadas[0].id : null;
      commit({ kind: 'primada', id, op: 'delete' });
    },

    // ----- productos de la primada (INVARIANTE #4: bloqueado si cerrada) -----
    addProducto(primadaId, prod) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const np = normProducts([prod])[0]; if (!np.aportadoPor) np.aportadoPor = p.organizadorPrincipalId || null;
      p.productos.push(np); p.asistencias.forEach(a => { if (a.items[np.id] == null) a.items[np.id] = 0; });
      commit({ kind: 'primada', id: primadaId });
    },
    setPreciosProducto(primadaId, prodId, { costoNeto, precioVenta } = {}) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const prod = p.productos.find(x => x.id === prodId); if (!prod) return;
      if (costoNeto != null) prod.costoNeto = Number(costoNeto) || 0;
      if (precioVenta != null) prod.precioVenta = Number(precioVenta) || 0;
      commitQuiet({ kind: 'primada', id: primadaId });   // edición de texto en vivo (precio): no re-render
    },
    setAportadoPor(primadaId, prodId, personaId) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const prod = p.productos.find(x => x.id === prodId); if (!prod) return;
      prod.aportadoPor = personaId || null; commit({ kind: 'primada', id: primadaId });
    },
    removeProducto(primadaId, prodId) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      p.productos = p.productos.filter(x => x.id !== prodId);
      p.asistencias.forEach(a => { delete a.items[prodId]; });
      commit({ kind: 'primada', id: primadaId });
    },

    // ----- asistencias (INVARIANTE #4: bloqueado si cerrada) -----
    addAsistencia(primadaId, personaId) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      if (p.asistencias.some(a => a.personaId === personaId)) return;
      const per = select.persona(personaId); if (!per) return;
      p.asistencias.push({ personaId, estadoEnEseMomento: normEstado(per.estado), rol: 'asistente', coverExonerado: false, items: normItems(p.productos, {}), pagado: false });
      commit({ kind: 'primada', id: primadaId });
    },
    removeAsistencia(primadaId, personaId) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      p.asistencias = p.asistencias.filter(a => a.personaId !== personaId);
      if (p.organizadorPrincipalId === personaId) { p.organizadorPrincipalId = null; p.pago = { breB: null }; }
      commit({ kind: 'primada', id: primadaId });
    },
    setRol(primadaId, personaId, rol) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const a = p.asistencias.find(x => x.personaId === personaId); if (!a) return;
      if (rol === 'principal') {
        // INVARIANTE #2: el principal debe ser ahorrador EN ESE MOMENTO (snapshot).
        if (a.estadoEnEseMomento !== 'ahorrador') throw new Error('setRol: el principal debe ser ahorrador (snapshot)');
        p.asistencias.forEach(x => { if (x.rol === 'principal') x.rol = 'organizador'; });   // INVARIANTE #3: único principal
        a.rol = 'principal';
        p.organizadorPrincipalId = personaId;
        const per = select.persona(personaId); p.pago = { breB: per ? per.breB : null };
      } else {
        a.rol = normRol(rol);
        if (p.organizadorPrincipalId === personaId) { p.organizadorPrincipalId = null; p.pago = { breB: null }; }
      }
      commit({ kind: 'primada', id: primadaId });
    },
    toggleCoverExonerado(primadaId, personaId) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const a = p.asistencias.find(x => x.personaId === personaId); if (!a) return;
      a.coverExonerado = !a.coverExonerado; commit({ kind: 'primada', id: primadaId });
    },
    changeItem(primadaId, personaId, prodId, delta) {
      const p = findPrimada(primadaId); if (!p || p.estado === 'cerrada') return;
      const a = p.asistencias.find(x => x.personaId === personaId); if (!a) return;
      a.items[prodId] = Math.max(0, (a.items[prodId] || 0) + delta); commit({ kind: 'primada', id: primadaId });
    },

    // ----- pago (BINARIO; INVARIANTE #4: permitido AUNQUE la primada esté cerrada: los pagos llegan
    //         después de cerrar la cuenta). El que paga marca su propio "pagado". -----
    setPagado(primadaId, personaId, valor) {
      const p = findPrimada(primadaId); if (!p) return;
      const a = p.asistencias.find(x => x.personaId === personaId); if (!a) return;
      a.pagado = !!valor; commit({ kind: 'primada', id: primadaId });
    },

    // ----- infra -----
    // replaceState reemplaza TODO el estado (restore/import): notifica + espeja local. No intenta
    // un upsert masivo a Supabase (no hay un target único); la sincronización fina ocurre por acción.
    replaceState(raw) { state = migrate(raw); commit({ local: true }); },
  };

  const Store = { load, subscribe, subscribeSync, syncState, flushQuiet, select, actions, defaultState, migrate };
  root.Store = Store;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Store, defaultState, migrate, select, actions, normProducts };
  }
})(typeof window !== 'undefined' ? window : globalThis);
