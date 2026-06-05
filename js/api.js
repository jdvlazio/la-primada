/* ============================================================
   API — adaptador de persistencia (aísla TODO Supabase del Store)
   El Store NUNCA habla con el SDK directo: lo hace a través de aquí,
   igual que antes `persist()` escondía localStorage.
   ------------------------------------------------------------
   Dos backends, elegidos en init():
     · 'supabase' — hay client (SDK por CDN o inyectado en tests).
     · 'local'    — sin client (Node/jsdom, u offline): espejo en localStorage.
   ------------------------------------------------------------
   Esquema híbrido (Opción C):
     personas  → fila relacional        { id, nombre, estado, breb }
     primadas  → columnas indexables + data jsonb
                 { id, nombre, fecha, mes_contable, organizador_principal_id, estado,
                   data:{ pago, cover, productos[], asistencias[] } }
     settings  → singleton              { id:'singleton', data:{ cover, defaultProducts } }
   activePrimadaId NO se sincroniza (local por dispositivo); load() lo deja null
   y el Store lo superpone desde el espejo local.
   ============================================================ */
(function (root) {
  'use strict';

  const CONFIG = root.CONFIG || (typeof require !== 'undefined' ? require('./config.js').CONFIG : {});
  const KEY = (CONFIG && CONFIG.storageKey) || 'laPrimada';

  /* ---------- Serializadores: modelo v4 (camelCase) <-> filas Supabase (snake_case) ---------- */
  function personaToRow(p) {
    return { id: p.id, nombre: p.nombre, estado: p.estado, breb: (p.breB != null ? p.breB : null) };
  }
  function rowToPersona(r) {
    return { id: r.id, nombre: r.nombre, estado: r.estado, breB: (r.breb != null ? r.breb : null) };
  }
  function primadaToRow(p) {
    // La columna DATE `fecha` es NOT NULL en el backend. Una PROGRAMADA sin fecha tiene `fecha:''` en
    // memoria ('' = por definir). NO podemos mandar NULL (viola not-null) ni '' (sintaxis DATE inválida),
    // así que la COLUMNA recibe un PLACEHOLDER = 1° del mes contable (solo para indexar/ordenar), mientras
    // la fecha REAL ('' incluida) se guarda en el jsonb `data.fecha` (fuente de verdad que lee rowToPrimada).
    const fechaCol = p.fecha || (p.mesContable ? p.mesContable + '-01' : null);
    return {
      id: p.id,
      nombre: p.nombre,
      fecha: fechaCol,
      mes_contable: p.mesContable,
      organizador_principal_id: (p.organizadorPrincipalId != null ? p.organizadorPrincipalId : null),
      estado: p.estado,
      // snapshots congelados van al jsonb tal cual (forma del modelo, sin tocar). `fecha` va aquí también
      // como FUENTE DE VERDAD (preserva '' de las programadas; la columna lleva el placeholder):
      data: { pago: p.pago, cover: p.cover, productos: p.productos, asistencias: p.asistencias, fecha: p.fecha },
    };
  }
  function rowToPrimada(r) {
    const d = r.data || {};
    return {
      id: r.id,
      nombre: r.nombre,
      // Prefiere la fecha del jsonb (verdad, incluye '' = por definir); fallback a la columna para filas
      // viejas anteriores a este campo (no traen data.fecha → usan la columna, que ahí sí es la real).
      fecha: (d.fecha !== undefined ? d.fecha : r.fecha),
      mesContable: r.mes_contable,
      organizadorPrincipalId: (r.organizador_principal_id != null ? r.organizador_principal_id : null),
      estado: r.estado,
      pago: d.pago,
      cover: d.cover,
      productos: d.productos,
      asistencias: d.asistencias,
    };
  }
  function settingsToRow(s) {
    return { id: 'singleton', data: { cover: (s || {}).cover, defaultProducts: (s || {}).defaultProducts } };
  }
  // Consumos (v6): tabla RELACIONAL aparte (1 fila = 1 pedido). apuntado_por lo pone el server por
  // defecto (auth.uid()); created_at se manda desde el cliente para que local y nube coincidan.
  function consumoToRow(primadaId, c) {
    const row = { id: c.id, primada_id: primadaId, persona_id: c.personaId, producto_id: c.productoId, cantidad: c.cantidad != null ? c.cantidad : 1 };
    if (c.createdAt) row.created_at = c.createdAt;
    if (c.apuntadoPor) row.apuntado_por = c.apuntadoPor;   // normalmente null → el server pone auth.uid()
    return row;
  }
  function rowToConsumo(r) {
    return { id: r.id, personaId: r.persona_id, productoId: r.producto_id, cantidad: r.cantidad != null ? r.cantidad : 1, apuntadoPor: (r.apuntado_por != null ? r.apuntado_por : null), createdAt: (r.created_at != null ? r.created_at : null) };
  }

  // Ensambla un AppState CRUDO desde filas. NO migra: el Store aplica migrate() (reusa el normalizador).
  function fromRows(rows) {
    rows = rows || {};
    const sd = (rows.settings && rows.settings[0] && rows.settings[0].data) || {};
    const primadas = (rows.primadas || []).map(rowToPrimada);
    // Agrupa consumos por primada_id y los cuelga de cada primada (forma v6 que espera el normalizador).
    const porPrimada = {};
    (rows.consumos || []).forEach(r => { (porPrimada[r.primada_id] = porPrimada[r.primada_id] || []).push(rowToConsumo(r)); });
    primadas.forEach(p => { p.consumos = porPrimada[p.id] || []; });
    return {
      schemaVersion: (CONFIG && CONFIG.schemaVersion) || 6,
      settings: { cover: sd.cover, defaultProducts: sd.defaultProducts },
      personas: (rows.personas || []).map(rowToPersona),
      primadas,
      activePrimadaId: null,   // local por dispositivo → el Store lo superpone desde el espejo
    };
  }

  /* ---------- Espejo de lectura en localStorage (caché offline / arranque en frío) ----------
     SOLO lectura: la fuente de verdad es Supabase. Nunca se escribe lógica de dominio aquí
     como autoridad; es un reflejo del último estado para ver sin conexión. */
  function cacheWrite(state) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function cacheRead() {
    try { return (typeof localStorage !== 'undefined') ? JSON.parse(localStorage.getItem(KEY)) : null; }
    catch (e) { return null; }
  }

  /* ---------- Estado del adaptador ---------- */
  let client = null;
  let mode = 'local';

  // init({ url, anonKey }) en producción · init({ client }) en tests (fake en memoria).
  // Sin client utilizable → backend 'local'. Devuelve el modo elegido.
  function init(opts) {
    opts = opts || {};
    if (opts.client) { client = opts.client; mode = 'supabase'; }
    else if (root.supabase && typeof root.supabase.createClient === 'function' && opts.url && opts.anonKey) {
      client = root.supabase.createClient(opts.url, opts.anonKey);
      mode = 'supabase';
    } else { client = null; mode = 'local'; }
    if (mode === 'supabase') {
      if (!init._online && typeof root.addEventListener === 'function') { init._online = true; root.addEventListener('online', function () { flush(); }); }
      flush();   // vacía lo que haya quedado encolado de una sesión anterior (offline → reconectó)
    }
    return mode;
  }

  // await a una llamada del SDK; propaga el error para que el Store lo muestre (toast).
  async function run(thenable, etiqueta) {
    const res = await thenable;
    if (res && res.error) throw new Error('Api.' + etiqueta + ': ' + (res.error.message || String(res.error)));
    return res;
  }

  /* ---------- load(): hidrata el AppState (async) ----------
     supabase → trae las 3 tablas y ensambla. local → lee el espejo.
     Devuelve un AppState CRUDO (o null); el Store le aplica migrate(). */
  async function load() {
    if (mode === 'supabase' && client) {
      try {
        const [pe, pr, se, co] = await Promise.all([
          run(client.from('personas').select('*'), 'load.personas'),
          run(client.from('primadas').select('*'), 'load.primadas'),
          run(client.from('settings').select('*'), 'load.settings'),
          run(client.from('consumos').select('*'), 'load.consumos'),
        ]);
        return fromRows({ personas: pe.data, primadas: pr.data, settings: se.data, consumos: co.data });
      } catch (e) {
        // Resiliencia de LECTURA: si la red/Supabase falla, cae al espejo local (caché solo-lectura,
        // CLAUDE.md). No deja la app en blanco por un parpadeo de red. La escritura sigue siendo nube.
        const cache = cacheRead();
        if (cache) return cache;
        throw e;
      }
    }
    return cacheRead();
  }

  /* ---------- COLA DE TRÁNSITO OFFLINE (Fase C) ----------
     Las escrituras NO van directo a la red: se traducen a una OPERACIÓN autocontenida y se ENCOLAN
     (persistida en localStorage, clave aparte). Se vacía al instante si hay red; si falla por red, se
     reintenta al reconectar (evento 'online'). Errores DEFINITIVOS (RLS/validación/duplicado) se DESCARTAN
     para no atascar la cola, y se reportan. La cola es TRÁNSITO, NO estado de dominio (excepción CLAUDE.md). */
  const COLA_KEY = KEY + '_cola';
  let cola = colaRead();
  let colaError = null;
  let flushing = false;
  const colaListeners = [];
  function colaRead() { try { return (typeof localStorage !== 'undefined') ? (JSON.parse(localStorage.getItem(COLA_KEY)) || []) : []; } catch (e) { return []; } }
  function colaWrite() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(COLA_KEY, JSON.stringify(cola)); } catch (e) {} }
  function emitCola() { const snap = { pendientes: cola.length, error: colaError }; colaListeners.forEach(fn => fn(snap)); }
  function onQueueChange(fn) { colaListeners.push(fn); }

  // buildOp: traduce (state, target) a una operación Supabase AUTOCONTENIDA (no depende del state futuro).
  function buildOp(state, target) {
    const kind = target.kind, id = target.id, del = target.op === 'delete';
    if (kind === 'persona') { if (del) return { t: 'personas', op: 'delete', id }; const p = (state.personas || []).find(x => x.id === id); return p ? { t: 'personas', op: 'upsert', row: personaToRow(p) } : null; }
    if (kind === 'primada') { if (del) return { t: 'primadas', op: 'delete', id }; const p = (state.primadas || []).find(x => x.id === id); return p ? { t: 'primadas', op: 'upsert', row: primadaToRow(p) } : null; }
    if (kind === 'settings') return { t: 'settings', op: 'upsert', row: settingsToRow(state.settings) };
    if (kind === 'consumo') {
      if (target.op === 'delete') return { t: 'consumos', op: 'delete', id };
      if (target.op === 'delete-prod') return { t: 'consumos', op: 'delete-where', where: [['primada_id', target.primadaId], ['producto_id', target.prodId]] };
      if (target.op === 'delete-persona') return { t: 'consumos', op: 'delete-where', where: [['primada_id', target.primadaId], ['persona_id', target.personaId]] };
      const prm = (state.primadas || []).find(p => (p.consumos || []).some(c => c.id === id));
      const c = prm && prm.consumos.find(x => x.id === id); return c ? { t: 'consumos', op: 'insert', row: consumoToRow(prm.id, c) } : null;
    }
    return null;
  }
  function execOp(o) {
    const tbl = client.from(o.t);
    if (o.op === 'upsert') return run(tbl.upsert(o.row), 'q.upsert.' + o.t);
    if (o.op === 'insert') return run(tbl.insert(o.row), 'q.insert.' + o.t);
    if (o.op === 'delete') return run(tbl.delete().eq('id', o.id), 'q.delete.' + o.t);
    if (o.op === 'delete-where') { let q = tbl.delete(); o.where.forEach(([c, v]) => { q = q.eq(c, v); }); return run(q, 'q.deletewhere.' + o.t); }
  }
  // Un error es DEFINITIVO (descartar) si es de RLS/validación/duplicado; si no, es de RED (reintentar).
  function esDefinitivo(msg) { return /row-level|\bRLS\b|no autoriz|not authorized|unauthorized|permission denied|violates|duplicate|already exists|invalid input|42501|23505|23502|23503|22P02/i.test(String(msg || '')); }
  async function flush() {
    if (flushing || mode !== 'supabase' || !client) return;
    if (!cola.length) { if (colaError) { colaError = null; emitCola(); } return; }
    flushing = true;
    try {
      while (cola.length) {
        try { await execOp(cola[0]); cola.shift(); colaWrite(); colaError = null; emitCola(); }
        catch (e) {
          const msg = (e && e.message) || '';
          if (esDefinitivo(msg)) { cola.shift(); colaWrite(); colaError = 'Un cambio fue rechazado (' + msg + ')'; emitCola(); }
          else { colaError = 'Sin conexión — se sincroniza al volver'; emitCola(); break; }
        }
      }
    } finally { flushing = false; }
  }

  /* ---------- commit(state, target): ENCOLA + intenta vaciar (Fase C) ----------
     Render OPTIMISTA: el Store ya mutó y renderizó; aquí solo persistimos. NO lanza: la durabilidad la
     da la cola; el estado (pendientes/error) se reporta por onQueueChange. target {local:true} → solo espejo. */
  async function commit(state, target) {
    cacheWrite(state);                                  // espejo de lectura (offline / cold start)
    if (mode !== 'supabase' || !client || !target || target.local) return;
    const o = buildOp(state, target);
    if (!o) return;
    cola.push(o); colaWrite(); emitCola();
    return flush();
  }

  /* ---------- SYNC EN VIVO (Fase B): snapshot + incremental sobre consumos ----------
     fetchConsumos = SNAPSHOT de una primada (reconciliación en (re)conexión).
     subscribeConsumos = INCREMENTAL por Postgres Changes (INSERT/DELETE/UPDATE) filtrado por primada.
     onSubscribed dispara en cada (re)conexión del canal → el controller re-snapshota (no pierde eventos). */
  async function fetchConsumos(primadaId) {
    if (mode !== 'supabase' || !client) return null;
    const res = await run(client.from('consumos').select('*').eq('primada_id', primadaId), 'fetch.consumos');
    return (res.data || []).map(rowToConsumo);
  }
  // Mapa user_id(uuid) → email, para el detalle de AUDITORÍA ("quién apuntó"). profiles tiene SELECT
  // solo autenticado → anon obtiene {} (mostrará "—"). Tolerante: cualquier fallo → {}.
  async function fetchApuntadores() {
    if (mode !== 'supabase' || !client) return {};
    try {
      const res = await run(client.from('profiles').select('user_id,email'), 'fetch.apuntadores');
      const map = {}; (res.data || []).forEach(r => { map[r.user_id] = r.email; }); return map;
    } catch (e) { return {}; }
  }
  // Borra la cuenta del usuario en sesión (Apple 5.1.1(v)): RPC delete_own_account (SECURITY DEFINER).
  // Anonimiza sus consumos (apuntado_por→NULL, fila INTACTA) y borra profiles + auth.users. NO toca el
  // libro colectivo → saldos de primadas cerradas idénticos. Lanza si no hay backend o si el RPC rechaza
  // (p. ej. "única cuenta admin"). El controller hace signOut + recarga tras el éxito.
  async function deleteOwnAccount() {
    if (mode !== 'supabase' || !client) throw new Error('Borrado no disponible sin backend');
    const res = await run(client.rpc('delete_own_account'), 'deleteOwnAccount');
    return res.data;
  }
  function subscribeConsumos(primadaId, opts) {
    opts = opts || {};
    if (mode !== 'supabase' || !client || typeof client.channel !== 'function') return function () {};
    // SIN filtro server-side (los filtros de Postgres Changes NO aplican fiable a DELETE). Filtramos en
    // el CLIENTE. CLAVE: con RLS habilitado, el payload de DELETE trae SOLO la primary key (id), sin
    // primada_id → NO se puede filtrar por primada. Como los ids de consumo son ÚNICOS globales,
    // entregamos el DELETE por id y applyRemoteConsumo lo quita SOLO si está en la primada activa (no-op
    // si pertenece a otra). INSERT/UPDATE sí traen la fila completa → se filtran por primada_id.
    const ch = client.channel('consumos:' + primadaId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consumos' }, function (payload) {
        try {
          const op = payload.eventType || payload.type;
          if (op === 'DELETE') {
            const id = payload.old && payload.old.id;
            if (id != null && opts.onChange) opts.onChange({ op: 'DELETE', id: id });
            return;
          }
          const row = payload.new;
          if (!row || row.primada_id !== primadaId) return;   // INSERT/UPDATE: fila completa → filtro por primada
          if (opts.onChange) opts.onChange({ op: op, consumo: rowToConsumo(row), id: row.id });
        } catch (e) {}
      })
      .subscribe(function (status) { if (status === 'SUBSCRIBED' && opts.onSubscribed) { try { opts.onSubscribed(); } catch (e) {} } });
    return function () { try { client.removeChannel(ch); } catch (e) {} };
  }

  /* ---------- PRESENCE (Fase C): "X está apuntando" (auto-coordinación, no bloqueo) ----------
     Canal de presencia por primada. Cada cliente publica su meta { nombre, apuntando } y recibe la
     lista de TODOS los presentes en cada 'sync'. setMeta re-publica (p. ej. al marcar "apuntando"). */
  function subscribePresence(primadaId, meta, onSync) {
    if (mode !== 'supabase' || !client || typeof client.channel !== 'function') return { setMeta: function () {}, unsubscribe: function () {} };
    const key = (meta && meta.key) || ('k' + Math.random().toString(36).slice(2));
    let current = Object.assign({}, meta || {});
    const ch = client.channel('presence:' + primadaId, { config: { presence: { key: key } } });
    ch.on('presence', { event: 'sync' }, function () {
      try {
        const st = ch.presenceState ? ch.presenceState() : {};
        const list = [];
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { list.push(Object.assign({ _key: k }, m)); }); });
        if (onSync) onSync(list, key);
      } catch (e) {}
    }).subscribe(function (status) { if (status === 'SUBSCRIBED') { try { ch.track(current); } catch (e) {} } });
    return {
      setMeta: function (m) { current = Object.assign({}, current, m); try { ch.track(current); } catch (e) {} },
      unsubscribe: function () { try { client.removeChannel(ch); } catch (e) {} },
    };
  }

  const Api = {
    init, load, commit, fetchConsumos, fetchApuntadores, deleteOwnAccount, subscribeConsumos, subscribePresence,
    onQueueChange, flush, queueState: function () { return { pendientes: cola.length, error: colaError }; },
    mode: function () { return mode; },
    // Cambia el modo de DATOS sin tocar el client de auth: 'supabase' solo si hay client. Permite
    // tener el client (para el magic link) pero leer/escribir LOCAL hasta que haya sesión.
    setMode: function (m) { mode = (m === 'supabase' && client) ? 'supabase' : 'local'; return mode; },
    client: function () { return client; },   // el módulo Auth reusa ESTE client (un solo GoTrueClient)
    // expuestos para tests (round-trip / serialización):
    _ser: { personaToRow, rowToPersona, primadaToRow, rowToPrimada, settingsToRow, consumoToRow, rowToConsumo, fromRows },
    _cacheRead: cacheRead, _cacheWrite: cacheWrite,
  };

  root.Api = Api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Api };
})(typeof window !== 'undefined' ? window : globalThis);
