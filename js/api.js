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
    return {
      id: p.id,
      nombre: p.nombre,
      fecha: p.fecha,
      mes_contable: p.mesContable,
      organizador_principal_id: (p.organizadorPrincipalId != null ? p.organizadorPrincipalId : null),
      estado: p.estado,
      // snapshots congelados van al jsonb tal cual (forma del modelo, sin tocar):
      data: { pago: p.pago, cover: p.cover, productos: p.productos, asistencias: p.asistencias },
    };
  }
  function rowToPrimada(r) {
    const d = r.data || {};
    return {
      id: r.id,
      nombre: r.nombre,
      fecha: r.fecha,
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
      const [pe, pr, se, co] = await Promise.all([
        run(client.from('personas').select('*'), 'load.personas'),
        run(client.from('primadas').select('*'), 'load.primadas'),
        run(client.from('settings').select('*'), 'load.settings'),
        run(client.from('consumos').select('*'), 'load.consumos'),
      ]);
      return fromRows({ personas: pe.data, primadas: pr.data, settings: se.data, consumos: co.data });
    }
    return cacheRead();
  }

  /* ---------- commit(state, target): upsert granular por entidad (async) ----------
     target = { kind:'persona'|'primada'|'settings', id, op?:'delete' }.
     Siempre refresca el espejo local; en modo supabase además upserta/borra la fila.
     Lanza si el backend devuelve error → el Store muestra el mensaje y reintenta. */
  async function commit(state, target) {
    cacheWrite(state);                                  // espejo de lectura (offline / cold start)
    if (mode !== 'supabase' || !client || !target) return;

    const kind = target.kind, id = target.id, del = target.op === 'delete';

    if (kind === 'persona') {
      if (del) return run(client.from('personas').delete().eq('id', id), 'delete.persona');
      const p = (state.personas || []).find(x => x.id === id); if (!p) return;
      return run(client.from('personas').upsert(personaToRow(p)), 'upsert.persona');
    }
    if (kind === 'primada') {
      if (del) return run(client.from('primadas').delete().eq('id', id), 'delete.primada');
      const p = (state.primadas || []).find(x => x.id === id); if (!p) return;
      return run(client.from('primadas').upsert(primadaToRow(p)), 'upsert.primada');
    }
    if (kind === 'settings') {
      return run(client.from('settings').upsert(settingsToRow(state.settings)), 'upsert.settings');
    }
    // Consumos (v6): granular. insert (1 fila) / delete (por id) / delete-prod / delete-persona (limpieza).
    if (kind === 'consumo') {
      const op = target.op;
      if (op === 'delete') return run(client.from('consumos').delete().eq('id', id), 'delete.consumo');
      if (op === 'delete-prod') return run(client.from('consumos').delete().eq('primada_id', target.primadaId).eq('producto_id', target.prodId), 'delete.consumos.prod');
      if (op === 'delete-persona') return run(client.from('consumos').delete().eq('primada_id', target.primadaId).eq('persona_id', target.personaId), 'delete.consumos.persona');
      // insert: la fila ya está en el estado (la primada que la contiene); la localizamos por id.
      const prm = (state.primadas || []).find(p => (p.consumos || []).some(c => c.id === id));
      const c = prm && prm.consumos.find(x => x.id === id); if (!c) return;
      return run(client.from('consumos').insert(consumoToRow(prm.id, c)), 'insert.consumo');
    }
  }

  const Api = {
    init, load, commit,
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
