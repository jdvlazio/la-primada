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
  return {
    _tablas: tablas,
    from(nombre) {
      const store = tablas[nombre];
      if (!store) return { select: () => thenable({ data: null, error: { message: 'tabla desconocida ' + nombre } }) };
      return {
        select() { return thenable({ data: Array.from(store.values()).map(r => JSON.parse(JSON.stringify(r))), error: null }); },
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

  /* ====================== 6. Propagación de error (para el toast del Store) ====================== */
  section('commit(): un error del backend se propaga (lo verá el usuario)');
  {
    const failing = { from() { return { upsert() { return { then: (r) => Promise.resolve({ data: null, error: { message: 'RLS: no autorizado' } }).then(r) }; } }; } };
    Api.init({ client: failing });
    let threw = null;
    try { await Api.commit(sampleState(), { kind: 'persona', id: 'per_a' }); } catch (e) { threw = e.message; }
    check('commit con error → lanza (Store mostrará toast + reintento)', !!threw && /RLS: no autorizado/.test(threw));
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

  /* ---------- Resumen ---------- */
  console.log(`\n${'='.repeat(50)}`);
  console.log(`API: ${pass} pasaron, ${fail} fallaron`);
  if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('API verde ✓');
})();
