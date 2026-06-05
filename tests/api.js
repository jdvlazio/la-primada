/* ============================================================
   Pruebas del adaptador js/api.js — fake de Supabase en memoria.
   Verifica: serialización v4 <-> filas, round-trip jsonb, upsert
   granular por {kind,id}, delete, settings singleton, y fallback 'local'.
   Correr:  node tests/api.js   (lo encadena `npm test`)
   ============================================================ */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const JS = f => path.join(ROOT, 'js', f);

/* ---------- mini-harness ---------- */
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) { check(name, got === want, `esperado ${JSON.stringify(want)}, obtuve ${JSON.stringify(got)}`); }
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}
function section(t) { console.log('\n' + t); }

/* ---------- 0. Sintaxis ---------- */
section('Sintaxis (node --check)');
try { execFileSync(process.execPath, ['--check', JS('api.js')]); check('node --check js/api.js', true); }
catch (e) { check('node --check js/api.js', false, String(e.stderr || e.message)); }

const { Api } = require(JS('api.js'));

/* ============================================================
   Fake de Supabase en memoria — imita la cadena del SDK:
     client.from(tabla).select('*')         → { data, error }
     client.from(tabla).upsert(rowOrRows)    → { data, error }  (PK = id)
     client.from(tabla).delete().eq('id', v) → { data, error }
   Cada método devuelve un thenable (await-able), como el SDK real.
   ============================================================ */
function makeFakeSupabase() {
  const tablas = { personas: new Map(), primadas: new Map(), settings: new Map(), consumos: new Map() };
  function thenable(result) { return { then: (res) => Promise.resolve(result).then(res) }; }
  function write(store, rowOrRows) { const arr = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]; arr.forEach(r => store.set(r.id, JSON.parse(JSON.stringify(r)))); return thenable({ data: arr, error: null }); }
  const channels = [];
  const rpcCalls = []; let rpcResult = { data: null, error: null };
  return {
    _tablas: tablas,
    _channels: channels,
    // RPC fake (delete_own_account, etc.): registra la llamada y devuelve el resultado configurado.
    _rpcCalls: rpcCalls,
    _setRpcResult(r) { rpcResult = r; },
    rpc(name, params) { rpcCalls.push({ name, params: params || null }); return thenable(rpcResult); },
    // Realtime fake: channel().on().subscribe(cb) → cb('SUBSCRIBED'); _emit(payload) simula un cambio.
    channel(name, opts) {
      const hs = []; const presenceCbs = []; const presence = {};
      const selfKey = (opts && opts.config && opts.config.presence && opts.config.presence.key) || 'self';
      const chan = {
        on(type, cfg, cb) { if (type === 'presence') presenceCbs.push(cb); else hs.push(cb); return chan; },
        subscribe(statusCb) { if (statusCb) statusCb('SUBSCRIBED'); return chan; },
        track(meta) { presence[selfKey] = [meta]; presenceCbs.forEach(cb => cb()); return Promise.resolve('ok'); },
        presenceState() { return presence; },
        _emit(payload) { hs.forEach(cb => cb(payload)); },
        _join(k, meta) { presence[k] = [meta]; presenceCbs.forEach(cb => cb()); },   // simula otro cliente
      };
      channels.push(chan); return chan;
    },
    removeChannel() {},
    from(nombre) {
      const store = tablas[nombre];
      if (!store) return { select: () => thenable({ data: null, error: { message: 'tabla desconocida ' + nombre } }) };
      return {
        // select() es awaitable Y encadenable con .eq() (filtro por columnas).
        select() {
          const filtros = []; const q = {
            eq(col, val) { filtros.push([col, val]); return q; },
            then(res) { const rows = Array.from(store.values()).filter(r => filtros.every(([c, v]) => r[c] === v)).map(r => JSON.parse(JSON.stringify(r))); return Promise.resolve({ data: rows, error: null }).then(res); },
          };
          return q;
        },
        upsert(rowOrRows) { return write(store, rowOrRows); },
        insert(rowOrRows) { return write(store, rowOrRows); },   // consumos usan insert (no upsert)
        delete() {
          // soporta .eq() encadenado (borra las filas que cumplen TODOS los filtros); awaitable.
          const filtros = []; const api = {
            eq(col, val) { filtros.push([col, val]); return api; },
            then(res) { Array.from(store.entries()).forEach(([k, r]) => { if (filtros.every(([c, v]) => r[c] === v)) store.delete(k); }); return Promise.resolve({ data: null, error: null }).then(res); },
          };
          return api;
        },
      };
    },
  };
}

/* ---------- Datos v4 de muestra ---------- */
function sampleState() {
  return {
    schemaVersion: 6,
    settings: { cover: { ahorrador: 15000, invitado: 10000 }, defaultProducts: [{ id: 'cz', nombre: 'Costeñita', emoji: '🍺', costoNeto: 2500, precioVenta: 3500, aportadoPor: null }] },
    personas: [
      { id: 'per_a', nombre: 'Ana', estado: 'ahorrador', breB: 'ana@bre-b' },
      { id: 'per_b', nombre: 'Beto', estado: 'invitado', breB: null },
    ],
    primadas: [{
      id: 'prm_1', nombre: 'Primada Ana', fecha: '2026-05-31', mesContable: '2026-06',
      organizadorPrincipalId: 'per_a', pago: { breB: 'ana@bre-b' }, cover: { ahorrador: 15000, invitado: 10000 },
      productos: [{ id: 'cz', nombre: 'Costeñita', emoji: '🍺', costoNeto: 2500, precioVenta: 3500, aportadoPor: 'per_a' }],
      asistencias: [
        { personaId: 'per_a', estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, pagado: true },
        { personaId: 'per_b', estadoEnEseMomento: 'invitado', rol: 'asistente', coverExonerado: false, pagado: true },
      ],
      // v6: consumos como filas (per_a 2 cz, per_b 1 cz)
      consumos: [
        { id: 'cns_1', personaId: 'per_a', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: '2026-05-31T10:00:00.000Z' },
        { id: 'cns_2', personaId: 'per_a', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: '2026-05-31T10:01:00.000Z' },
        { id: 'cns_3', personaId: 'per_b', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: '2026-05-31T10:02:00.000Z' },
      ],
      estado: 'abierta',
    }],
    activePrimadaId: 'prm_1',
  };
}
// Fila de consumo (snake) como la guarda Supabase, derivada del modelo.
function consumoRowOf(primadaId, c) { return { id: c.id, primada_id: primadaId, persona_id: c.personaId, producto_id: c.productoId, cantidad: c.cantidad, apuntado_por: c.apuntadoPor, created_at: c.createdAt }; }

/* ============================================================ 1. Serialización ida y vuelta */
section('Serialización modelo v4 <-> filas Supabase');
{
  const s = sampleState();
  // persona: breB(camel) <-> breb(snake)
  const pr = Api._ser.personaToRow(s.personas[0]);
  eq('persona→fila: breB se mapea a breb', pr.breb, 'ana@bre-b');
  check('persona→fila: sin breB camelCase', !('breB' in pr));
  const pback = Api._ser.rowToPersona(pr);
  check('fila→persona: round-trip idéntico', deepEqual(pback, s.personas[0]));
  eq('persona null breB conserva null', Api._ser.rowToPersona(Api._ser.personaToRow(s.personas[1])).breB, null);

  // primada: columnas indexables + data jsonb
  const prr = Api._ser.primadaToRow(s.primadas[0]);
  eq('primada→fila: mes_contable (snake) extraído', prr.mes_contable, '2026-06');
  eq('primada→fila: organizador_principal_id (snake)', prr.organizador_principal_id, 'per_a');
  eq('primada→fila: fecha como columna', prr.fecha, '2026-05-31');
  check('primada→fila: snapshots dentro de data jsonb', !!prr.data && Array.isArray(prr.data.asistencias) && Array.isArray(prr.data.productos) && !!prr.data.cover && !!prr.data.pago);
  check('primada→fila: NO duplica snapshots fuera de data', !('asistencias' in prr) && !('productos' in prr) && !('cover' in prr));
  // PROGRAMADA sin fecha: '' en memoria. La columna DATE es NOT NULL (no acepta NULL ni ''), así que la
  // COLUMNA recibe un PLACEHOLDER = 1° del mes contable, y la fecha REAL ('') vive en data.fecha (verdad).
  const progRow = Api._ser.primadaToRow({ id: 'prm_x', nombre: 'Primada Ana', fecha: '', mesContable: '2026-09', organizadorPrincipalId: 'per_a', estado: 'programada', pago: { breB: null }, cover: { ahorrador: 0, invitado: 0 }, productos: [], asistencias: [] });
  eq('programada sin fecha → columna = placeholder mes-01 (NO null, NO "")', progRow.fecha, '2026-09-01');
  eq('programada sin fecha → data.fecha = "" (verdad, por definir)', progRow.data.fecha, '');
  eq('programada: estado se preserva en la fila', progRow.estado, 'programada');
  // Y al leer de vuelta, la fecha vuelve a ser '' (la UI muestra "por definir"), NO el placeholder.
  eq('programada round-trip → fecha vuelve a "" (no el placeholder de la columna)', Api._ser.rowToPrimada(progRow).fecha, '');
  // Fila VIEJA (anterior a data.fecha): rowToPrimada usa la columna como fallback.
  eq('fila vieja sin data.fecha → fecha = columna (fallback)', Api._ser.rowToPrimada({ id: 'p', nombre: 'X', fecha: '2026-05-31', mes_contable: '2026-05', estado: 'cerrada', data: { pago: {}, cover: {}, productos: [], asistencias: [] } }).fecha, '2026-05-31');
}

/* ============================================================ 2. Round-trip jsonb completo (lo crítico) */
section('Round-trip jsonb: primada → fila → primada idéntica');
{
  const original = sampleState().primadas[0];
  const row = Api._ser.primadaToRow(original);
  const back = Api._ser.rowToPrimada(row);
  // v6: los consumos viven en su tabla, NO en el jsonb de la primada → el round-trip de la fila no los trae.
  check('primada→fila: consumos NO van en el jsonb', !('consumos' in row.data) && !('consumos' in row));
  const sinConsumos = JSON.parse(JSON.stringify(original)); delete sinConsumos.consumos;
  check('primada round-trip idéntica (sin consumos, que son tabla aparte)', deepEqual(back, sinConsumos));
  eq('pagado dentro del jsonb preservado', back.asistencias[1].pagado, true);
  check('asistencia v6 sin items', !('items' in back.asistencias[0]));
  // consumo: round-trip camel <-> snake
  const cr = Api._ser.consumoToRow('prm_1', original.consumos[0]);
  check('consumo→fila: snake (primada_id/persona_id/producto_id)', cr.primada_id === 'prm_1' && cr.persona_id === 'per_a' && cr.producto_id === 'cz');
  const cback = Api._ser.rowToConsumo(consumoRowOf('prm_1', original.consumos[0]));
  check('fila→consumo: round-trip idéntico', deepEqual(cback, original.consumos[0]));
}

/* ============================================================ 3. fromRows: ensambla AppState crudo (sin migrar) */
section('fromRows: filas → AppState crudo');
{
  const s = sampleState();
  const rows = {
    personas: s.personas.map(Api._ser.personaToRow),
    primadas: s.primadas.map(Api._ser.primadaToRow),
    settings: [Api._ser.settingsToRow(s.settings)],
    consumos: s.primadas[0].consumos.map(c => consumoRowOf('prm_1', c)),
  };
  const app = Api._ser.fromRows(rows);
  eq('fromRows: schemaVersion 6', app.schemaVersion, 6);
  eq('fromRows: 2 personas', app.personas.length, 2);
  eq('fromRows: 1 primada', app.primadas.length, 1);
  eq('fromRows: activePrimadaId null (local por dispositivo, no se sincroniza)', app.activePrimadaId, null);
  check('fromRows: settings reconstruido (cover + defaultProducts)', app.settings.cover.ahorrador === 15000 && app.settings.defaultProducts.length === 1);
  check('fromRows: personas reconstruidas idénticas', deepEqual(app.personas, s.personas));
  // v6: fromRows agrupa los consumos por primada y los cuelga → la primada queda idéntica al original.
  eq('fromRows: 3 consumos agrupados en la primada', app.primadas[0].consumos.length, 3);
  check('fromRows: primadas reconstruidas idénticas (con consumos agrupados)', deepEqual(app.primadas, s.primadas));
}

/* ============================================================ 4. load() async desde Supabase (fake) */
section('load() async contra Supabase (fake en memoria)');
(async () => {
  {
    const fake = makeFakeSupabase();
    const s = sampleState();
    // sembrar el fake como lo haría commit()
    s.personas.forEach(p => fake._tablas.personas.set(p.id, Api._ser.personaToRow(p)));
    s.primadas.forEach(p => fake._tablas.primadas.set(p.id, Api._ser.primadaToRow(p)));
    s.primadas[0].consumos.forEach(c => fake._tablas.consumos.set(c.id, consumoRowOf('prm_1', c)));
    fake._tablas.settings.set('singleton', Api._ser.settingsToRow(s.settings));

    const mode = Api.init({ client: fake });
    eq('init con client → modo supabase', mode, 'supabase');
    const app = await Api.load();
    eq('load: 2 personas desde Supabase', app.personas.length, 2);
    eq('load: 1 primada desde Supabase', app.primadas.length, 1);
    eq('load: 3 consumos colgados de la primada', app.primadas[0].consumos.length, 3);
    check('load: primada idéntica al original (incluye consumos agrupados)', deepEqual(app.primadas[0], s.primadas[0]));
    check('load: personas idénticas', deepEqual(app.personas, s.personas));
    eq('load: activePrimadaId null (no sincronizado)', app.activePrimadaId, null);
  }

  /* ====================== 5. commit() upsert granular por {kind,id} ====================== */
  section('commit(): upsert granular por entidad');
  {
    const fake = makeFakeSupabase();
    Api.init({ client: fake });
    const s = sampleState();

    // settings
    await Api.commit(s, { kind: 'settings' });
    check('commit settings → 1 fila singleton', fake._tablas.settings.size === 1 && fake._tablas.settings.has('singleton'));

    // persona (insert/upsert)
    await Api.commit(s, { kind: 'persona', id: 'per_a' });
    check('commit persona per_a → solo esa fila', fake._tablas.personas.size === 1 && fake._tablas.personas.has('per_a'));
    eq('commit persona: breb serializado', fake._tablas.personas.get('per_a').breb, 'ana@bre-b');

    // primada
    await Api.commit(s, { kind: 'primada', id: 'prm_1' });
    check('commit primada prm_1 → 1 fila con data jsonb', fake._tablas.primadas.size === 1 && !!fake._tablas.primadas.get('prm_1').data);
    eq('commit primada: mes_contable en columna', fake._tablas.primadas.get('prm_1').mes_contable, '2026-06');

    // granularidad: editar la persona B NO toca la fila de A ni la primada
    s.personas[1].estado = 'ahorrador';
    await Api.commit(s, { kind: 'persona', id: 'per_b' });
    eq('commit persona B → ahora 2 personas', fake._tablas.personas.size, 2);
    eq('granular: A intacta (ahorrador)', fake._tablas.personas.get('per_a').estado, 'ahorrador');
    eq('granular: B actualizada (ahorrador)', fake._tablas.personas.get('per_b').estado, 'ahorrador');

    // delete primada
    await Api.commit(s, { kind: 'primada', id: 'prm_1', op: 'delete' });
    check('commit delete primada → fila eliminada', fake._tablas.primadas.size === 0);

    // delete persona
    await Api.commit(s, { kind: 'persona', id: 'per_b', op: 'delete' });
    check('commit delete persona → solo esa fila', fake._tablas.personas.size === 1 && !fake._tablas.personas.has('per_b'));

    // consumos (v6): insert granular (1 fila), delete por id, y limpiezas delete-prod / delete-persona
    const c = s.primadas[0].consumos[0];                 // cns_1 (per_a, cz)
    await Api.commit(s, { kind: 'consumo', op: 'insert', id: c.id, primadaId: 'prm_1' });
    check('commit consumo insert → 1 fila', fake._tablas.consumos.size === 1 && fake._tablas.consumos.has('cns_1'));
    eq('commit consumo: persona_id en columna (snake)', fake._tablas.consumos.get('cns_1').persona_id, 'per_a');
    await Api.commit(s, { kind: 'consumo', op: 'delete', id: 'cns_1', primadaId: 'prm_1' });
    check('commit consumo delete por id → fila eliminada', fake._tablas.consumos.size === 0);
    // sembrar las 3 filas y probar las limpiezas en bloque
    s.primadas[0].consumos.forEach(x => fake._tablas.consumos.set(x.id, consumoRowOf('prm_1', x)));
    await Api.commit(s, { kind: 'consumo', op: 'delete-persona', primadaId: 'prm_1', personaId: 'per_a' });
    eq('commit delete-persona → quedan solo los de per_b (1)', fake._tablas.consumos.size, 1);
    await Api.commit(s, { kind: 'consumo', op: 'delete-prod', primadaId: 'prm_1', prodId: 'cz' });
    eq('commit delete-prod → sin consumos de cz (0)', fake._tablas.consumos.size, 0);
  }

  /* ====================== 6. Cola offline (Fase C): error DEFINITIVO se descarta y se reporta ====================== */
  section('commit(): la escritura NO lanza; la cola reporta el estado (pendientes/error)');
  {
    // localStorage en jsdom para que la cola persista; limpiamos la clave de cola.
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('laPrimada_cola'); } catch (e) {}
    const failing = { from() { return { upsert() { return { then: (r) => Promise.resolve({ data: null, error: { message: 'RLS: no autorizado' } }).then(r) }; } }; } };
    Api.init({ client: failing });
    let estados = [];
    Api.onQueueChange((s) => estados.push(s));
    let threw = false;
    try { await Api.commit(sampleState(), { kind: 'persona', id: 'per_a' }); } catch (e) { threw = true; }
    check('commit NO lanza (la cola absorbe el fallo)', !threw);
    const fin = Api.queueState();
    check('error RLS es DEFINITIVO → se descarta (cola vacía)', fin.pendientes === 0);
    check('el rechazo se reporta por estado (no se pierde silencioso)', !!fin.error && /rechazado/i.test(fin.error));
  }

  /* ====================== 6b. Cola offline: error de RED se reintenta (queda encolado) ====================== */
  section('Cola offline: sin red el cambio se ENCOLA y se sincroniza al reconectar');
  {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('laPrimada_cola'); } catch (e) {}
    let online = false;
    // Cliente que RECHAZA (red caída) mientras online=false; al reconectar guarda la fila.
    const net = { _store: new Map(), from() { const self = net; return {
      upsert(row) { if (!online) return Promise.reject(new Error('Failed to fetch')); self._store.set(row.id, row); return Promise.resolve({ data: [row], error: null }); },
    }; } };
    Api.init({ client: net });
    await Api.commit(sampleState(), { kind: 'persona', id: 'per_a' });
    check('sin red → queda ENCOLADO (1 pendiente)', Api.queueState().pendientes === 1);
    check('sin red → estado "sin conexión"', /conexi/i.test(Api.queueState().error || ''));
    check('sin red → la fila NO llegó al backend todavía', !net._store.has('per_a'));
    online = true;
    await Api.flush();
    check('al reconectar → la cola se vacía (0 pendientes)', Api.queueState().pendientes === 0);
    check('al reconectar → la fila llegó al backend', net._store.has('per_a'));
  }

  /* ====================== 7. Fallback a 'local' (Node/jsdom sin SDK) ====================== */
  section('Fallback a backend local (sin SDK / offline)');
  {
    const mode = Api.init({});   // sin client, sin window.supabase
    eq('init sin client → modo local', mode, 'local');
    // en Node no hay localStorage → no rompe, load() devuelve null y commit() no lanza
    const app = await Api.load();
    check('load local sin localStorage → null (Store hará defaultState vía migrate)', app === null);
    let ok = true; try { await Api.commit(sampleState(), { kind: 'settings' }); } catch (e) { ok = false; }
    check('commit local no lanza (solo espeja; sin red)', ok);
  }

  /* ====================== 8. Sync en vivo (Fase B): fetchConsumos + subscribeConsumos ====================== */
  section('Sync en vivo (Fase B): fetchConsumos (snapshot) + subscribeConsumos (canal fake)');
  {
    const fake = makeFakeSupabase();
    Api.init({ client: fake });
    fake._tablas.consumos.set('a1', consumoRowOf('prm_1', { id: 'a1', personaId: 'per_a', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null }));
    fake._tablas.consumos.set('b1', consumoRowOf('prm_2', { id: 'b1', personaId: 'per_b', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null }));
    const snap = await Api.fetchConsumos('prm_1');
    eq('fetchConsumos filtra por primada (1 fila de prm_1)', snap.length, 1);
    check('fetchConsumos devuelve camelCase', snap[0].personaId === 'per_a' && snap[0].id === 'a1');

    let subbed = 0; const eventos = [];
    const unsub = Api.subscribeConsumos('prm_1', { onSubscribed: () => { subbed++; }, onChange: (e) => eventos.push(e) });
    eq('subscribe → onSubscribed disparó (SUBSCRIBED = (re)conexión)', subbed, 1);
    const chan = fake._channels[fake._channels.length - 1];
    chan._emit({ eventType: 'INSERT', new: consumoRowOf('prm_1', { id: 'a2', personaId: 'per_a', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null }) });
    chan._emit({ eventType: 'DELETE', old: { id: 'a1', primada_id: 'prm_1', persona_id: 'per_a', producto_id: 'cz', cantidad: 1, apuntado_por: null, created_at: null } });
    eq('onChange recibió 2 eventos', eventos.length, 2);
    check('evento INSERT normalizado a camelCase', eventos[0].op === 'INSERT' && eventos[0].consumo.id === 'a2' && eventos[0].consumo.personaId === 'per_a');
    check('evento DELETE trae el id', eventos[1].op === 'DELETE' && eventos[1].id === 'a1');
    let threw = false; try { unsub(); } catch (e) { threw = true; }
    check('unsubscribe no lanza', !threw);
  }

  /* ====================== 9. Presence (Fase C): subscribePresence ====================== */
  section('Presence (Fase C): rastrea mi presencia y reporta a los demás');
  {
    const fake = makeFakeSupabase();
    Api.init({ client: fake });
    const estados = [];
    const pres = Api.subscribePresence('prm_1', { key: 'me', nombre: 'Yo', apuntando: 0 }, (lista, ownKey) => estados.push({ lista, ownKey }));
    check('presence: al (re)conectar hace track → me reporta a MÍ', estados.length >= 1 && estados[estados.length - 1].lista.some(m => m.nombre === 'Yo'));
    eq('presence: ownKey = mi key (para excluirme)', estados[estados.length - 1].ownKey, 'me');
    const chan = fake._channels[fake._channels.length - 1];
    chan._join('otra', { nombre: 'Ana', apuntando: 0 });
    const ult = estados[estados.length - 1].lista;
    check('presence: aparece otro cliente (Ana)', ult.some(m => m.nombre === 'Ana'));
    check('presence: cada meta trae _key', ult.every(m => '_key' in m));
    let ok = true; try { pres.setMeta({ apuntando: 123 }); pres.unsubscribe(); } catch (e) { ok = false; }
    check('presence: setMeta/unsubscribe no lanzan', ok);
  }

  /* ====================== 10. Borrado de cuenta (FASE 2b): deleteOwnAccount ====================== */
  section('Borrado de cuenta (Apple 5.1.1(v)): deleteOwnAccount → RPC delete_own_account');
  {
    const fake = makeFakeSupabase();
    Api.init({ client: fake });
    // Éxito: invoca el RPC correcto y no lanza.
    fake._setRpcResult({ data: null, error: null });
    let ok = true; try { await Api.deleteOwnAccount(); } catch (e) { ok = false; }
    check('deleteOwnAccount no lanza en éxito', ok);
    eq('llama al RPC delete_own_account', fake._rpcCalls[fake._rpcCalls.length - 1].name, 'delete_own_account');

    // Rechazo del RPC (p. ej. último admin) → propaga el mensaje para el toast.
    fake._setRpcResult({ data: null, error: { message: 'No puedes borrar la única cuenta admin' } });
    let msg = null; try { await Api.deleteOwnAccount(); } catch (e) { msg = e.message; }
    check('rechazo del RPC propaga el mensaje (último admin)', !!msg && /única cuenta admin/.test(msg));

    // Sin backend (modo local) → lanza sin tocar RPC.
    Api.init({});
    let threw = false; try { await Api.deleteOwnAccount(); } catch (e) { threw = true; }
    check('sin backend → deleteOwnAccount lanza (no hay nube)', threw);
  }

  /* ---------- Resumen ---------- */
  console.log(`\n${'='.repeat(50)}`);
  console.log(`API: ${pass} pasaron, ${fail} fallaron`);
  if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('API verde ✓');
})();
