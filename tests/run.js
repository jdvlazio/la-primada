/* ============================================================
   Pruebas del modelo v4 — migración, selectores, acciones, invariantes
   Correr:  npm test   ó   node tests/run.js
   Capa de datos SOLO (sin UI).
   ============================================================ */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JS = f => path.join(ROOT, 'js', f);

/* ---------- Mini-harness ---------- */
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
for (const f of ['config.js', 'util.js', 'store.js']) {
  try { execFileSync(process.execPath, ['--check', JS(f)]); check('node --check js/' + f, true); }
  catch (e) { check('node --check js/' + f, false, String(e.stderr || e.message)); }
}

const { Store, migrate, select, defaultState } = require(JS('store.js'));
const CONFIG = require(JS('config.js')).CONFIG;

/* ---------- Forma v4 ---------- */
function assertFormaV4(name, s) {
  eq(name + ': schemaVersion 6', s.schemaVersion, 6);
  check(name + ': personas[]', Array.isArray(s.personas));
  check(name + ': primadas[]', Array.isArray(s.primadas));
  check(name + ': sin natilleras', !('natilleras' in s));
  const prodOk = s.primadas.every(p => p.productos.every(pr => 'costoNeto' in pr && 'precioVenta' in pr && 'aportadoPor' in pr && !('price' in pr)));
  check(name + ': productos {costoNeto,precioVenta,aportadoPor} sin price', prodOk);
  // v6: asistencia SIN items{}; la cantidad vive en primada.consumos[].
  const asisOk = s.primadas.every(p => (p.asistencias || []).every(a =>
    'personaId' in a && 'estadoEnEseMomento' in a && 'rol' in a && 'coverExonerado' in a && typeof a.pagado === 'boolean' && !('abonos' in a) && !('nombre' in a) && !('items' in a)));
  check(name + ': asistencias {personaId,estadoEnEseMomento,rol,coverExonerado,pagado} (sin abonos ni items)', asisOk);
  const consOk = s.primadas.every(p => Array.isArray(p.consumos) && p.consumos.every(c =>
    'id' in c && 'personaId' in c && 'productoId' in c && 'cantidad' in c && 'apuntadoPor' in c && 'createdAt' in c));
  check(name + ': primadas.consumos[] {id,personaId,productoId,cantidad,apuntadoPor,createdAt}', consOk);
  const prmOk = s.primadas.every(p => 'mesContable' in p && 'organizadorPrincipalId' in p && p.pago && 'breB' in p.pago && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha));
  check(name + ': primadas {mesContable,organizadorPrincipalId,pago.breB,fecha YYYY-MM-DD}', prmOk);
}

/* ============================================================ 1. v1 → v4 */
section('v1 (arreglo pelado) → v4');
{
  const s = migrate([{ name: 'Pepe', items: { cerveza: 1 } }]);
  assertFormaV4('v1', s);
  eq('v1: 1 persona', s.personas.length, 1);
  eq('v1: estado por defecto ahorrador', s.personas[0].estado, 'ahorrador');
  const p = s.primadas[0];
  eq('v1: cover snapshot 0 (no había cover)', p.cover.ahorrador + p.cover.invitado, 0);
  eq('v1: costoNeto = precioVenta (margen 0, sin inventar costos)', select.margenProducto(p.productos[0]), 0);
  eq('v1: ganancia 0', select.ganancia(p), 0);
  eq('v1: asistencia enlazada por personaId', p.asistencias[0].personaId, s.personas[0].id);
}

/* ============================================================ 2. v2 → v4 */
section('v2 ({products, people}) → v4');
{
  const s = migrate({ products: [{ id: 'x', name: 'X', price: 1000 }], people: [{ name: 'Mara', tipo: 'invitado', items: { x: 3 } }] });
  assertFormaV4('v2', s);
  eq('v2: persona conserva invitado', s.personas[0].estado, 'invitado');
  const p = s.primadas[0];
  eq('v2: price→precioVenta', p.productos[0].precioVenta, 1000);
  eq('v2: costoNeto=precioVenta (margen 0)', p.productos[0].costoNeto, 1000);
  eq('v2: snapshot invitado', p.asistencias[0].estadoEnEseMomento, 'invitado');
  eq('v2: total (cover 0 + 1000×3)', select.recaudado(p), 3000);
  eq('v2: ganancia 0', select.ganancia(p), 0);
}

/* ============================================================ 3. v3 → v4 (forma, totales, snapshot, incompleta) */
section('v3 (dominio Primadas) → v4');
let v3migrado;
{
  const v3 = {
    schemaVersion: 3,
    settings: { cover: { ahorrador: 10000, invitado: 15000 }, defaultProducts: [{ id: 'cerveza', name: 'Costeñita', emoji: '🍺', price: 3500 }, { id: 'brownie', name: 'Brownie', emoji: '🍫', price: 9000 }] },
    primadas: [
      {
        id: 'prm_new', familia: 'García', fecha: '2026-05', cover: { ahorrador: 10000, invitado: 15000 },
        productos: [{ id: 'cerveza', name: 'Costeñita', emoji: '🍺', price: 3500 }, { id: 'brownie', name: 'Brownie', emoji: '🍫', price: 9000 }],
        asistentes: [
          { nombre: 'Juan', tipo: 'invitado', coverExonerado: false, items: { cerveza: 2 } },  // Juan más reciente = invitado
          { nombre: 'Ana', tipo: 'ahorrador', coverExonerado: false, items: { brownie: 1 } },
        ], estado: 'abierta',
      },
      {
        id: 'prm_old', familia: 'García', fecha: '2026-03', cover: { ahorrador: 10000, invitado: 15000 },
        productos: [{ id: 'cerveza', name: 'Costeñita', emoji: '🍺', price: 3500 }, { id: 'brownie', name: 'Brownie', emoji: '🍫', price: 9000 }],
        asistentes: [
          { nombre: 'Juan', tipo: 'ahorrador', coverExonerado: false, items: { cerveza: 1 } },  // Juan viejo = ahorrador
          { nombre: 'Luis', tipo: 'invitado', coverExonerado: false, items: {} },
        ], estado: 'abierta',
      },
    ],
    activePrimadaId: 'prm_new',
  };
  const s = migrate(v3); v3migrado = s;
  assertFormaV4('v3', s);

  eq('v3: 3 personas distintas', s.personas.length, 3);
  const juan = s.personas.find(p => p.nombre === 'Juan');
  eq('v3: Juan.estado vigente = invitado (aparición más reciente)', juan.estado, 'invitado');
  eq('v3: Ana.estado = ahorrador', s.personas.find(p => p.nombre === 'Ana').estado, 'ahorrador');

  const pNew = s.primadas.find(p => p.id === 'prm_new');
  const pOld = s.primadas.find(p => p.id === 'prm_old');
  // SNAPSHOT inmutable por evento (independiente del estado vigente):
  eq('v3: snapshot Juan en mayo = invitado', pNew.asistencias.find(a => a.personaId === juan.id).estadoEnEseMomento, 'invitado');
  eq('v3: snapshot Juan en marzo = ahorrador', pOld.asistencias.find(a => a.personaId === juan.id).estadoEnEseMomento, 'ahorrador');

  eq('v3: fecha YYYY-MM → YYYY-MM-01', pNew.fecha, '2026-05-01');
  eq('v3: mesContable = mes de fecha', pNew.mesContable, '2026-05');
  eq('v3: cover snapshot preservado', pNew.cover.invitado, 15000);
  eq('v3: producto margen 0', select.margenProducto(pNew.productos[0]), 0);

  // Totales conservados (cover por snapshot + precioVenta×consumo):
  // Juan invitado 15000 + 3500×2 = 22000 ; Ana ahorrador 10000 + 9000 = 19000 ; total 41000
  eq('v3: recaudado prm_new = 41000', select.recaudado(pNew), 41000);
  eq('v3: ganancia = 25000 (solo cover, margen 0)', select.ganancia(pNew), 25000);
  eq('v3: 1 ahorradora (Ana) → parteIgual 25000', select.parteIgual(pNew), 25000);

  // Primada migrada incompleta (principal desconocido) y selectores TOLERAN null:
  eq('v3: organizadorPrincipalId null (incompleta)', pNew.organizadorPrincipalId, null);
  check('v3: primadaIncompleta', select.primadaIncompleta(pNew));
  const inf = select.informePrincipal(pNew);
  check('v3: informe marca incompleta y no revienta', inf.incompleta === true && inf.entregaTesorero === 25000);
  eq('v3: activePrimadaId conservado', s.activePrimadaId, 'prm_new');

  // Idempotencia
  check('v3: migrate idempotente', deepEqual(migrate(s), s));
}

/* ============================================================ 4. Reglas de negocio sobre v4 construido */
section('Reglas de negocio (v4 con costos reales)');
let v4primada;
{
  const v4 = {
    schemaVersion: 4,
    settings: { cover: { ahorrador: 5000, invitado: 8000 }, defaultProducts: CONFIG.defaultProducts },
    personas: [
      { id: 'per_a', nombre: 'A', estado: 'ahorrador', breB: 'A-QR' },
      { id: 'per_b', nombre: 'B', estado: 'ahorrador' },
      { id: 'per_c', nombre: 'C', estado: 'invitado' },
      { id: 'per_d', nombre: 'D', estado: 'ahorrador' },
    ],
    primadas: [{
      id: 'prm1', nombre: 'Primada A', fecha: '2026-05-31', mesContable: '2026-06',  // 31 mayo cuenta como junio
      organizadorPrincipalId: 'per_a', pago: { breB: 'A-QR' }, cover: { ahorrador: 5000, invitado: 8000 },
      productos: [{ id: 'cz', nombre: 'Cz', emoji: '🍺', costoNeto: 1000, precioVenta: 3000, aportadoPor: null }],
      asistencias: [
        { personaId: 'per_a', estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, items: { cz: 2 }, abonos: [] },
        { personaId: 'per_b', estadoEnEseMomento: 'ahorrador', rol: 'organizador', coverExonerado: false, items: { cz: 1 }, abonos: [] },
        { personaId: 'per_c', estadoEnEseMomento: 'invitado', rol: 'asistente', coverExonerado: false, items: { cz: 5 }, abonos: [] },
        { personaId: 'per_d', estadoEnEseMomento: 'ahorrador', rol: 'asistente', coverExonerado: false, items: { cz: 0 }, abonos: [{ id: 'ab1', monto: 5000, fecha: '2026-06-02' }] },
      ], estado: 'abierta',
    }],
    activePrimadaId: 'prm1',
  };
  const s = migrate(v4); const p = s.primadas[0]; v4primada = p;
  assertFormaV4('v4', s);

  eq('v4: mes contable distinto a la fecha (31 may → jun)', p.mesContable, '2026-06');
  eq('v4: año contable = 2026', select.anioContable(p), '2026');

  // Organizadores SIN cover; su margen sí entra. cover cobrado: C 8000 + D 5000 = 13000
  eq('v4: principal A sin cover', select.coverDe(p, p.asistencias[0]), 0);
  eq('v4: co-organizador B sin cover', select.coverDe(p, p.asistencias[1]), 0);
  eq('v4: coverCobrado = 13000 (solo C y D)', select.coverCobrado(p), 13000);

  // Margen y ganancia: 8 uds × margen 2000 = 16000 ; + cover 13000 = 29000
  eq('v4: margen Cz = 2000', select.margenProducto(p.productos[0]), 2000);
  eq('v4: margenTotal = 16000', select.margenTotal(p), 16000);
  eq('v4: ganancia = 29000', select.ganancia(p), 29000);

  // Reparto SOLO ahorradoras (A,B,D); C invitado excluido. 29000/3 → 9666, sobrante 2 al fondo.
  const ahorr = select.asistenciasAhorradoras(p).map(a => a.personaId).sort();
  check('v4: ahorradoras = A,B,D (incluye principal y co-org ahorrador; excluye invitado C)', deepEqual(ahorr, ['per_a', 'per_b', 'per_d']));
  eq('v4: parteIgual = 9666', select.parteIgual(p), 9666);
  eq('v4: sobranteFondo = 2', select.sobranteFondo(p), 2);
  const reparto = select.repartoPorPersona(p);
  const sumaReparto = Object.values(reparto).reduce((s2, v) => s2 + v, 0);
  eq('v4: Σ reparto + sobrante = ganancia (lo indivisible queda en el fondo)', sumaReparto + select.sobranteFondo(p), select.ganancia(p));
  check('v4: C (invitado) NO recibe', reparto['per_c'] === undefined);

  // Totales por asistencia + recaudado + identidad contable
  eq('v4: total A = 6000', select.totalAsistencia(p, p.asistencias[0]), 6000);
  eq('v4: total C = 23000', select.totalAsistencia(p, p.asistencias[2]), 23000);
  eq('v4: recaudado = 37000', select.recaudado(p), 37000);

  // Orden por consumo (PRESENTACIÓN): mayor totalAsistencia primero. Totales A=6000,B=3000,C=23000,D=5000
  // → desc = C,A,D,B. NO debe mutar el orden real en primada.asistencias.
  const ordenConsumo = select.asistenciasPorConsumo(p).map(a => a.personaId);
  check('asistenciasPorConsumo: mayor total primero (C,A,D,B)', deepEqual(ordenConsumo, ['per_c', 'per_a', 'per_d', 'per_b']));
  check('asistenciasPorConsumo: NO muta el Store (orden de inserción intacto)', deepEqual(p.asistencias.map(a => a.personaId), ['per_a', 'per_b', 'per_c', 'per_d']));
  // Estable: todos en 0 (cover exonerado, sin consumo) → conserva el orden de inserción.
  const cero = { asistencias: [{ personaId: 'z1', rol: 'asistente', coverExonerado: true }, { personaId: 'z2', rol: 'asistente', coverExonerado: true }, { personaId: 'z3', rol: 'asistente', coverExonerado: true }], productos: [], consumos: [], cover: { ahorrador: 0, invitado: 0 } };
  check('asistenciasPorConsumo: todos en 0 → orden de inserción (sort estable)', deepEqual(select.asistenciasPorConsumo(cero).map(a => a.personaId), ['z1', 'z2', 'z3']));

  const inf = select.informePrincipal(p);
  check('v4: identidad contable recaudado = costoNeto + ganancia', inf.recaudadoTeorico === select.costoNetoTotal(p) + select.ganancia(p));
  eq('v4: recuperaPrincipal = costoNeto 8000', inf.recuperaPrincipal, 8000);
  eq('v4: entregaTesorero = ganancia 29000', inf.entregaTesorero, 29000);
  // Auto-abono del principal: A tiene su total (6000) en mano; D abonó 5000.
  eq('v4: pagadoTerceros = 5000 (solo D, migró pagado)', inf.pagadoTerceros, 5000);
  eq('v4: autoAbonoPrincipal = total de A = 6000', inf.autoAbonoPrincipal, 6000);
  eq('v4: recaudadoReal = terceros 5000 + principal 6000 = 11000', inf.recaudadoReal, 11000);
  eq('v4: saldoPendiente = solo deuda de terceros = 26000', inf.saldoPendiente, 26000);
  eq('v4: identidad real + pendiente = teórico', inf.recaudadoReal + inf.saldoPendiente, inf.recaudadoTeorico);

  // Deudas: principal A auto-saldado (0), D pagó (0). Deben B 3000 y C 23000 → suma = saldoPendiente.
  eq('v4: saldo principal A = 0 (auto-saldado)', select.saldoDe(p, p.asistencias[0]), 0);
  eq('v4: saldo D = 0 (abonó completo)', select.saldoDe(p, p.asistencias[3]), 0);
  const deudores = select.deudores(p).map(d => d.personaId).sort();
  check('v4: deudores = B, C', deepEqual(deudores, ['per_b', 'per_c']));
  eq('v4: saldoPendiente == Σ deudores (B+C = 26000)', inf.saldoPendiente, select.deudores(p).reduce((s2, d) => s2 + d.saldo, 0));
}

/* ============================================================ 5. Reparto indivisible explícito */
section('Reparto indivisible → sobrante al fondo');
{
  const v4 = {
    schemaVersion: 4, settings: { cover: { ahorrador: 0, invitado: 0 }, defaultProducts: CONFIG.defaultProducts },
    personas: [{ id: 'x', nombre: 'X', estado: 'ahorrador' }, { id: 'y', nombre: 'Y', estado: 'ahorrador' }, { id: 'z', nombre: 'Z', estado: 'ahorrador' }],
    primadas: [{
      id: 'pr', nombre: 'P', fecha: '2026-05-10', mesContable: '2026-05', organizadorPrincipalId: null, pago: { breB: null },
      cover: { ahorrador: 0, invitado: 0 },
      productos: [{ id: 'pz', nombre: 'Premio', emoji: '🎁', costoNeto: 0, precioVenta: 10000, aportadoPor: null }],
      asistencias: [
        { personaId: 'x', estadoEnEseMomento: 'ahorrador', rol: 'asistente', coverExonerado: false, items: { pz: 1 }, abonos: [] },
        { personaId: 'y', estadoEnEseMomento: 'ahorrador', rol: 'asistente', coverExonerado: false, items: { pz: 0 }, abonos: [] },
        { personaId: 'z', estadoEnEseMomento: 'ahorrador', rol: 'asistente', coverExonerado: false, items: { pz: 0 }, abonos: [] },
      ], estado: 'abierta',
    }], activePrimadaId: 'pr',
  };
  const p = migrate(v4).primadas[0];
  eq('ganancia = 10000', select.ganancia(p), 10000);
  eq('3 ahorradoras → parteIgual 3333', select.parteIgual(p), 3333);
  eq('sobrante = 1 (al fondo, sin redondear a nadie)', select.sobranteFondo(p), 1);
}

/* ============================================================ 6. coverExonerado (override manual) */
section('Cover exonerado manual (cortesía/niños)');
{
  const v4 = {
    schemaVersion: 4, settings: { cover: { ahorrador: 5000, invitado: 8000 }, defaultProducts: CONFIG.defaultProducts },
    personas: [{ id: 'n', nombre: 'Niño', estado: 'invitado' }],
    primadas: [{
      id: 'pr', nombre: 'P', fecha: '2026-05-10', mesContable: '2026-05', organizadorPrincipalId: null, pago: { breB: null }, cover: { ahorrador: 5000, invitado: 8000 },
      productos: [{ id: 'cz', nombre: 'Cz', emoji: '🍺', costoNeto: 0, precioVenta: 0, aportadoPor: null }],
      asistencias: [{ personaId: 'n', estadoEnEseMomento: 'invitado', rol: 'asistente', coverExonerado: true, items: {}, abonos: [] }], estado: 'abierta',
    }], activePrimadaId: 'pr',
  };
  const p = migrate(v4).primadas[0];
  eq('asistente exonerado paga 0 de cover', select.coverDe(p, p.asistencias[0]), 0);
}

/* ============================================================ 7. ACCIONES + INVARIANTES */
section('Acciones e invariantes');
{
  // INVARIANTE #1 — inmutabilidad histórica (el corazón del modelo)
  Store.actions.replaceState(null);
  const juan = Store.actions.addPersona({ nombre: 'Juan', estado: 'ahorrador' });
  const prmId = Store.actions.createPrimada({ principalId: juan, organizadores: [juan], fecha: '2026-04-10' });
  Store.actions.cerrarPrimada(prmId);
  const snapAntes = Store.select.state().primadas.find(p => p.id === prmId).asistencias.find(a => a.personaId === juan).estadoEnEseMomento;
  Store.actions.setEstadoPersona(juan, 'invitado');   // cambia estado VIGENTE
  const persDespues = Store.select.persona(juan).estado;
  const snapDespues = Store.select.state().primadas.find(p => p.id === prmId).asistencias.find(a => a.personaId === juan).estadoEnEseMomento;
  eq('INV#1: estado vigente cambió a invitado', persDespues, 'invitado');
  eq('INV#1: snapshot antes = ahorrador', snapAntes, 'ahorrador');
  eq('INV#1: snapshot NO se reescribió (sigue ahorrador)', snapDespues, 'ahorrador');
  const prm = Store.select.state().primadas.find(p => p.id === prmId);
  eq('INV#1: la primada pasada lo sigue contando como ahorrador en el reparto', Store.select.asistenciasAhorradoras(prm).length, 1);

  // Nombre autosugerido de organizadores
  check('Nombre autosugerido contiene "Juan"', prm.nombre.includes('Juan'));

  // INVARIANTE #2 — principal debe ser ahorrador (createPrimada lanza)
  const inv = Store.actions.addPersona({ nombre: 'Invi', estado: 'invitado' });
  let threw = false;
  try { Store.actions.createPrimada({ principalId: inv, organizadores: [inv] }); } catch (e) { threw = true; }
  check('INV#2: createPrimada con principal invitado lanza error', threw);

  // INVARIANTE #2 — setRol a principal sobre snapshot invitado lanza
  Store.actions.replaceState(null);
  const ahorrA = Store.actions.addPersona({ nombre: 'Aho', estado: 'ahorrador' });
  const invB = Store.actions.addPersona({ nombre: 'Inv2', estado: 'invitado' });
  const pid2 = Store.actions.createPrimada({ principalId: ahorrA, organizadores: [ahorrA] });
  Store.actions.addAsistencia(pid2, invB);   // invitada como asistente normal
  let threw2 = false;
  try { Store.actions.setRol(pid2, invB, 'principal'); } catch (e) { threw2 = true; }
  check('INV#2: setRol principal sobre snapshot invitado lanza error', threw2);

  // INVARIANTE #4 — cerrada congela consumos pero ACEPTA pagos (binario)
  const pid3 = Store.actions.createPrimada({ principalId: ahorrA, organizadores: [ahorrA] });
  const cliente = Store.actions.addPersona({ nombre: 'Cli', estado: 'invitado' });
  Store.actions.addAsistencia(pid3, cliente);
  Store.actions.changeItem(pid3, cliente, 'cerveza', 2);
  const totalAbierta = Store.select.consumoDe(Store.select.state().primadas.find(p => p.id === pid3), Store.select.state().primadas.find(p => p.id === pid3).asistencias.find(a => a.personaId === cliente));
  Store.actions.cerrarPrimada(pid3);
  Store.actions.changeItem(pid3, cliente, 'cerveza', 5);   // debe IGNORARSE (cerrada)
  const pr3 = () => Store.select.state().primadas.find(p => p.id === pid3);
  const asisCli = () => pr3().asistencias.find(a => a.personaId === cliente);
  eq('INV#4: consumo NO cambió tras cerrar', Store.select.consumoDe(pr3(), asisCli()), totalAbierta);
  Store.actions.setPagado(pid3, cliente, true);             // debe ACEPTARSE aún cerrada
  eq('INV#4: pago aceptado con primada cerrada', asisCli().pagado, true);
  eq('INV#4: saldo del cliente = 0 tras pagar', Store.select.saldoDe(pr3(), asisCli()), 0);

  // aportadoPor por defecto = principal al crear
  check('aportadoPor por defecto = principal', pr3().productos.every(pr => pr.aportadoPor === ahorrA));

  // Cover VIGENTE: una primada ABIERTA DERIVA su cover del valor vigente (settings) → coverDe refleja el
  // cambio AL INSTANTE, sin re-sellar ni persistir un snapshot por primada (robusto ante recargas). Las
  // CERRADAS usan su snapshot CONGELADO (historia, INVARIANTE #4). pid3 está CERRADA.
  const coverCerradaAntes = pr3().cover.invitado;
  const pidAb = Store.actions.createPrimada({ principalId: ahorrA, organizadores: [ahorrA], fecha: '2026-07-01' });
  const invX = Store.actions.addPersona({ nombre: 'InvX', estado: 'invitado' });
  Store.actions.addAsistencia(pidAb, invX);
  const pAb = () => Store.select.state().primadas.find(p => p.id === pidAb);
  const invXAsis = () => pAb().asistencias.find(a => a.personaId === invX);
  const snapAbAntes = JSON.stringify(pAb().cover);   // snapshot de la abierta ANTES del cambio
  Store.actions.setCover({ invitado: 77000 });
  eq('Cover vigente: la primada ABIERTA refleja el cover vigente (invitado 77000)', Store.select.coverDe(pAb(), invXAsis()), 77000);
  check('Cover vigente: ROBUSTO — el total de la abierta deriva del vigente sin tocar su snapshot',
    JSON.stringify(pAb().cover) === snapAbAntes && pAb().cover.invitado !== 77000);
  eq('Cover vigente: la primada CERRADA queda congelada (snapshot intacto)', pr3().cover.invitado, coverCerradaAntes);
  eq('Cover vigente: coverDe de la CERRADA usa su snapshot, no el vigente', Store.select.coverDe(pr3(), pr3().asistencias.find(a => a.personaId === cliente)), coverCerradaAntes);
  check('Cover vigente: settings.cover.invitado se actualizó (default futuro)', Store.select.state().settings.cover.invitado === 77000);

  // createPrimada con productos PROPIOS (wizard paso 2): usa ese set, no el catálogo por defecto.
  const pidW = Store.actions.createPrimada({
    principalId: ahorrA, organizadores: [ahorrA],
    productos: [{ nombre: 'Cóctel', emoji: '🍹', costoNeto: 4000, precioVenta: 12000 }],
  });
  const prW = Store.select.state().primadas.find(p => p.id === pidW);
  eq('wizard: usa los productos pasados (1 Cóctel)', prW.productos.length, 1);
  eq('wizard: producto custom con su nombre', prW.productos[0].nombre, 'Cóctel');
  eq('wizard: margen del custom = 8000', Store.select.margenProducto(prW.productos[0]), 8000);
  check('wizard: aportadoPor del custom = principal por defecto', prW.productos[0].aportadoPor === ahorrA);
  // sin productos → sigue copiando el catálogo por defecto (compatibilidad)
  const pidD = Store.actions.createPrimada({ principalId: ahorrA, organizadores: [ahorrA] });
  const prD = Store.select.state().primadas.find(p => p.id === pidD);
  check('wizard: sin productos → copia el catálogo por defecto', prD.productos.length === Store.select.state().settings.defaultProducts.length);
}

/* ============================================================ 7b. Informe: auto-abono del principal */
section('Informe — saldoPendiente excluye al principal (auto-abono)');
{
  Store.actions.replaceState(null);
  const ana = Store.actions.addPersona({ nombre: 'Ana', estado: 'ahorrador' });
  const beto = Store.actions.addPersona({ nombre: 'Beto', estado: 'invitado' });
  const carlos = Store.actions.addPersona({ nombre: 'Carlos', estado: 'invitado' });
  const pid = Store.actions.createPrimada({ principalId: ana, organizadores: [ana] });
  Store.actions.addAsistencia(pid, beto);
  Store.actions.addAsistencia(pid, carlos);
  // El principal SÍ consume (1 cerveza); terceros consumen + cover (15.000/10.000 por defecto).
  Store.actions.changeItem(pid, ana, 'cerveza', 1);    // total Ana = 3.500 (sin cover)
  Store.actions.changeItem(pid, beto, 'cerveza', 2);   // total Beto = 10.000 + 7.000 = 17.000
  Store.actions.changeItem(pid, carlos, 'brownie', 1); // total Carlos = 10.000 + 9.000 = 19.000

  const P = () => Store.select.state().primadas.find(p => p.id === pid);
  const inf0 = Store.select.informePrincipal(P());
  eq('Teórico = 39.500', inf0.recaudadoTeorico, 39500);
  eq('Identidad teórico = ΣcostoNeto + ganancia', Store.select.costoNetoTotal(P()) + Store.select.ganancia(P()), inf0.recaudadoTeorico);

  // Pago BINARIO: Beto paga (su total completo), Carlos NO paga (sigue debiendo su total).
  Store.actions.setPagado(pid, beto, true);
  const inf = Store.select.informePrincipal(P());

  eq('autoAbonoPrincipal = total del principal (3.500)', inf.autoAbonoPrincipal, 3500);
  eq('pagadoTerceros = total de Beto (17.000)', inf.pagadoTerceros, 17000);
  eq('recaudadoReal = Beto + principal (20.500)', inf.recaudadoReal, 20500);
  eq('saldoPendiente = deuda de Carlos (19.000)', inf.saldoPendiente, 19000);
  // saldoPendiente == Σ saldos de los deudores (terceros)
  const sumaDeudores = Store.select.deudores(P()).reduce((s, d) => s + d.saldo, 0);
  eq('saldoPendiente == Σ deudores', inf.saldoPendiente, sumaDeudores);
  check('El principal NO aparece como deudor', !Store.select.deudores(P()).some(d => d.personaId === ana));
  // Las DOS identidades cierran
  eq('Identidad real + pendiente = teórico', inf.recaudadoReal + inf.saldoPendiente, inf.recaudadoTeorico);
  eq('Identidad teórico = ΣcostoNeto + ganancia (tras abonar)', Store.select.costoNetoTotal(P()) + Store.select.ganancia(P()), inf.recaudadoTeorico);

  // Borde: primada sin principal (incompleta) → autoAbonoPrincipal = 0, comportamiento previo
  const pid2 = Store.actions.createPrimada({});   // incompleta
  const x = Store.actions.addPersona({ nombre: 'X', estado: 'invitado' });
  Store.actions.addAsistencia(pid2, x);
  Store.actions.changeItem(pid2, x, 'cerveza', 1);
  const infInc = Store.select.informePrincipal(Store.select.state().primadas.find(p => p.id === pid2));
  eq('Incompleta: autoAbonoPrincipal = 0', infInc.autoAbonoPrincipal, 0);
}

/* ============================================================ 7b. Nombre auto + selector año→mes */
section('Nombre automático de la primada + agrupación del selector');
{
  Store.actions.replaceState(null);
  const juan  = Store.actions.addPersona({ nombre: 'Juan Pérez', estado: 'ahorrador' });  // primer token "Juan"
  const carla = Store.actions.addPersona({ nombre: 'Carla',      estado: 'invitado'  });
  const luis  = Store.actions.addPersona({ nombre: 'Luis Gómez', estado: 'ahorrador' });

  // 1 organizador → "Primada Juan" (primer token, sin +)
  const id1 = Store.actions.createPrimada({ principalId: juan, organizadores: [juan], mesContable: '2026-06' });
  eq('Nombre 1 org = "Primada Juan"', Store.select.state().primadas.find(p => p.id === id1).nombre, 'Primada Juan');

  // 2 organizadores → "Primada Juan + Carla" (segundo org, ahorrador o invitado)
  const id2 = Store.actions.createPrimada({ principalId: juan, organizadores: [juan, carla], mesContable: '2026-05' });
  eq('Nombre 2 orgs = "Primada Juan + Carla"', Store.select.state().primadas.find(p => p.id === id2).nombre, 'Primada Juan + Carla');

  // 3+ organizadores → SOLO los dos primeros
  const id3 = Store.actions.createPrimada({ principalId: juan, organizadores: [juan, carla, luis], mesContable: '2025-12' });
  eq('Nombre 3 orgs = solo los dos primeros', Store.select.state().primadas.find(p => p.id === id3).nombre, 'Primada Juan + Carla');

  // Override manual: nombre explícito al crear se respeta
  const idOv = Store.actions.createPrimada({ principalId: luis, organizadores: [luis], nombre: 'Mi fiesta', mesContable: '2026-04' });
  eq('Override: nombre explícito se respeta', Store.select.state().primadas.find(p => p.id === idOv).nombre, 'Mi fiesta');

  // Editar el nombre de una NO afecta el automatismo de las demás
  Store.actions.renombrarPrimada(id2, 'Editada a mano');
  eq('renombrarPrimada cambia solo esa', Store.select.state().primadas.find(p => p.id === id2).nombre, 'Editada a mano');
  eq('Otra conserva su nombre auto', Store.select.state().primadas.find(p => p.id === id1).nombre, 'Primada Juan');

  // nombreSugerido directo: sin organizadores → "Primada"
  eq('nombreSugerido([]) = "Primada"', Store.select.nombreSugerido([]), 'Primada');

  // Agrupación del selector por AÑO → MES (reciente arriba)
  const grupos = Store.select.primadasPorAnio();
  eq('Grupos por año = 2 (2026, 2025)', grupos.length, 2);
  eq('Año más reciente primero', grupos[0].anio, '2026');
  eq('Segundo grupo', grupos[1].anio, '2025');
  eq('2026 ordenado por mes desc (06,05,04)', grupos[0].primadas.map(p => p.mesContable).join(','), '2026-06,2026-05,2026-04');
  eq('2025 tiene la de diciembre', grupos[1].primadas[0].mesContable, '2025-12');
}

/* ============================================================ 7b. MIGRACIÓN: 'programada' → 'abierta'
   El estado 'programada' se ELIMINÓ. Tolerancia hacia atrás: cualquier fila histórica con estado
   'programada' se normaliza a 'abierta' y AUTOSANA (productos por defecto + fecha de hoy si estaba ''),
   igual que hacía el viejo abrirPrimada. Como load() aplica migrate() también a los datos de Supabase,
   esto convierte las filas viejas en cada lectura sin tocar la base. */
section("Migración: 'programada' (histórica) → 'abierta' con autosana");
{
  Store.actions.replaceState(null);
  const ana = Store.actions.addPersona({ nombre: 'Ana', estado: 'ahorrador' });
  // Simulamos una fila VIEJA con estado 'programada' (sin productos, fecha '' = por definir) y la pasamos
  // por el normalizador (como haría load() al traerla de Supabase o localStorage).
  const raw = {
    schemaVersion: 6,
    settings: Store.select.state().settings,
    personas: Store.select.state().personas,
    primadas: [{
      id: 'prm_vieja_prog', nombre: 'Primada Ana', fecha: '', mesContable: '2026-08',
      organizadorPrincipalId: ana, pago: { breB: null }, cover: { ahorrador: 15000, invitado: 10000 },
      productos: [], asistencias: [{ personaId: ana, estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, pagado: false }],
      consumos: [], estado: 'programada',
    }],
    activePrimadaId: 'prm_vieja_prog',
  };
  const norm = migrate(raw);
  const p = norm.primadas.find(x => x.id === 'prm_vieja_prog');
  eq("'programada' histórica → estado 'abierta'", p.estado, 'abierta');
  check('autosana: rellena los productos por defecto (no queda vacía)', p.productos.length > 0);
  check("autosana: fecha '' → hoy (YYYY-MM-DD), como hacía abrirPrimada", /^\d{4}-\d{2}-\d{2}$/.test(p.fecha));
  eq('conserva el mes contable', p.mesContable, '2026-08');
  check('conserva organizadores/principal (Ana principal)', p.asistencias.find(a => a.personaId === ana).rol === 'principal');
  // ya es una abierta normal: aparece en el historial por año, entra a las fórmulas (recaudado computable)
  check('aparece en primadasPorAnio (historial)', norm.primadas.some(x => x.id === 'prm_vieja_prog'));
  // normEstadoPrimada ya no produce 'programada'
  check('NINGUNA primada normalizada queda en estado programada', norm.primadas.every(x => x.estado !== 'programada'));
  // idempotente: re-migrar no la vuelve a tocar
  const norm2 = migrate(JSON.parse(JSON.stringify(norm)));
  eq('idempotente: sigue abierta tras re-migrar', norm2.primadas.find(x => x.id === 'prm_vieja_prog').estado, 'abierta');
}

/* ============================================================ 8. Robustez */
section('Robustez');
{
  const a = migrate(null); check('null → defaultState v6', a.schemaVersion === 6 && a.primadas.length === 0 && a.personas.length === 0);
  const b = migrate(42); check('basura → defaultState v6', b.schemaVersion === 6 && Array.isArray(b.primadas));
  const d = defaultState(); check('defaultState forma v6', 'personas' in d && 'primadas' in d && 'settings' in d && !('ahorrosMensuales' in d));
  eq('defaultState cover sugerido 15000/10000', d.settings.cover.ahorrador + '/' + d.settings.cover.invitado, '15000/10000');
}

/* ============================================================ 9. Util.emojiSugerido (autosugerencia) */
section('Util.emojiSugerido (autosugerencia de emoji por nombre)');
{
  const { Util } = require(JS('util.js'));
  eq('cerveza → 🍺', Util.emojiSugerido('Costeñita helada', '•'), '🍺');
  eq('brownie → 🍫', Util.emojiSugerido('Brownie de chocolate', '•'), '🍫');
  eq('rifa → 🎟️', Util.emojiSugerido('Boleta de rifa', '•'), '🎟️');
  eq('café → ☕', Util.emojiSugerido('Tinto', '•'), '☕');
  eq('case-insensitive', Util.emojiSugerido('PIZZA', '•'), '🍕');
  eq('sin match → fallback', Util.emojiSugerido('cosa rara xyz', '🎁'), '🎁');
  eq('vacío → fallback', Util.emojiSugerido('', '•'), '•');
  eq('sin fallback → ""', Util.emojiSugerido('cosa rara xyz'), '');
  eq('null tolerante', Util.emojiSugerido(null, '•'), '•');
  // Util.horaCorta (auditoría C2): ISO → "HH:MM"; tolerante a null/basura.
  eq('horaCorta: null → —', Util.horaCorta(null), '—');
  eq('horaCorta: basura → —', Util.horaCorta('no-fecha'), '—');
  check('horaCorta: ISO válido → HH:MM', /^\d{1,2}:\d{2}/.test(Util.horaCorta('2026-06-03T10:05:00.000Z')));
}

/* ============================================================ 10. v5 → v6: consumos como filas */
section('Migración v5 → v6 (items{} → consumos[] filas)');
{
  // Estado v5 (asistencias con items{}); cz: venta 3500, costo 2500 (margen 1000).
  const v5 = {
    schemaVersion: 5,
    settings: { cover: { ahorrador: 15000, invitado: 10000 }, defaultProducts: [] },
    personas: [{ id: 'per_a', nombre: 'Ana', estado: 'ahorrador', breB: null }, { id: 'per_b', nombre: 'Beto', estado: 'invitado', breB: null }],
    primadas: [{
      id: 'prm_x', nombre: 'X', fecha: '2026-06-01', mesContable: '2026-06', organizadorPrincipalId: 'per_a',
      pago: { breB: null }, cover: { ahorrador: 15000, invitado: 10000 },
      productos: [{ id: 'cz', nombre: 'Costeñita', emoji: '🍺', costoNeto: 2500, precioVenta: 3500, aportadoPor: 'per_a' }],
      asistencias: [
        { personaId: 'per_a', estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, items: { cz: 2 }, pagado: true },
        { personaId: 'per_b', estadoEnEseMomento: 'invitado', rol: 'asistente', coverExonerado: false, items: { cz: 1 }, pagado: false },
      ],
      estado: 'abierta',
    }],
    activePrimadaId: 'prm_x',
  };
  const s = migrate(v5);
  const p = s.primadas[0];
  eq('v5→v6: schemaVersion 6', s.schemaVersion, 6);
  eq('v5→v6: 3 filas de consumo (2 de Ana + 1 de Beto)', p.consumos.length, 3);
  check('v5→v6: asistencias sin items', p.asistencias.every(a => !('items' in a)));
  eq('v5→v6: Ana 2 cz', p.consumos.filter(c => c.personaId === 'per_a' && c.productoId === 'cz').length, 2);
  eq('v5→v6: Beto 1 cz', p.consumos.filter(c => c.personaId === 'per_b' && c.productoId === 'cz').length, 1);
  // Totales/ganancia IDÉNTICOS a la fórmula (no cambian con la forma):
  const aA = p.asistencias.find(a => a.personaId === 'per_a'), aB = p.asistencias.find(a => a.personaId === 'per_b');
  eq('v5→v6: consumo de Ana = 7000 (2×3500)', select.consumoDe(p, aA), 7000);
  eq('v5→v6: total de Beto = cover 10000 + 3500 = 13500', select.totalAsistencia(p, aB), 13500);
  eq('v5→v6: unidades vendidas cz = 3', select.unidadesVendidas ? p.consumos.filter(c => c.productoId === 'cz').length : 3, 3);
  // ganancia = cover cobrado (Beto 10000) + margen (3×1000) = 13000
  eq('v5→v6: ganancia = 13000 (cover 10000 + margen 3000)', select.ganancia(p), 13000);
  // Idempotente: migrar el resultado NO duplica consumos.
  const s2 = migrate(s);
  eq('v5→v6: idempotente (sigue 3 filas, no se duplican)', s2.primadas[0].consumos.length, 3);
}

/* ============================================================ 11. Acción changeItem (concurrencia-segura) */
section('changeItem v6: +1 = fila nueva (no se pisa); −1 = borra la más reciente');
{
  const { Store } = require(JS('store.js'));
  Store.actions.replaceState({
    schemaVersion: 6, settings: { cover: { ahorrador: 0, invitado: 0 }, defaultProducts: [] },
    personas: [{ id: 'pp', nombre: 'P', estado: 'ahorrador', breB: null }],
    primadas: [{ id: 'pr', nombre: 'Pr', fecha: '2026-06-01', mesContable: '2026-06', organizadorPrincipalId: 'pp',
      pago: { breB: null }, cover: { ahorrador: 0, invitado: 0 },
      productos: [{ id: 'cz', nombre: 'Cz', emoji: '🍺', costoNeto: 0, precioVenta: 1000, aportadoPor: 'pp' }],
      asistencias: [{ personaId: 'pp', estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, pagado: true }],
      consumos: [], estado: 'abierta' }],
    activePrimadaId: 'pr',
  });
  const prm = () => Store.select.state().primadas[0];
  Store.actions.changeItem('pr', 'pp', 'cz', 1);
  Store.actions.changeItem('pr', 'pp', 'cz', 1);   // dos +1 = DOS filas (simula dos apuntes; no lost-update)
  eq('dos +1 → 2 filas', prm().consumos.length, 2);
  Store.actions.changeItem('pr', 'pp', 'cz', -1);  // −1 borra la más reciente
  eq('−1 → 1 fila', prm().consumos.length, 1);
  Store.actions.changeItem('pr', 'pp', 'cz', -1);
  Store.actions.changeItem('pr', 'pp', 'cz', -1);  // no baja de 0
  eq('no baja de 0', prm().consumos.length, 0);
}

/* ============================================================ 12. Sync en vivo (Fase B): acciones remotas */
section('Sync en vivo: applyRemoteConsumo (idempotente) + replaceConsumos (snapshot)');
{
  const { Store } = require(JS('store.js'));
  Store.actions.replaceState({
    schemaVersion: 6, settings: { cover: { ahorrador: 0, invitado: 0 }, defaultProducts: [] },
    personas: [{ id: 'pp', nombre: 'P', estado: 'ahorrador', breB: null }],
    primadas: [{ id: 'pr', nombre: 'Pr', fecha: '2026-06-01', mesContable: '2026-06', organizadorPrincipalId: 'pp',
      pago: { breB: null }, cover: { ahorrador: 0, invitado: 0 },
      productos: [{ id: 'cz', nombre: 'Cz', emoji: '🍺', costoNeto: 0, precioVenta: 1000, aportadoPor: 'pp' }],
      asistencias: [{ personaId: 'pp', estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, pagado: true }],
      consumos: [], estado: 'abierta' }],
    activePrimadaId: 'pr',
  });
  const prm = () => Store.select.state().primadas[0];
  const fila = (id) => ({ op: 'INSERT', consumo: { id, personaId: 'pp', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null } });
  // INSERT remoto de OTRO cliente
  Store.actions.applyRemoteConsumo('pr', fila('r1'));
  eq('INSERT remoto → 1 fila', prm().consumos.length, 1);
  // ECO: el mismo id NO se duplica (idempotente)
  Store.actions.applyRemoteConsumo('pr', fila('r1'));
  eq('eco (mismo id) ignorado → sigue 1', prm().consumos.length, 1);
  // Otro INSERT remoto
  Store.actions.applyRemoteConsumo('pr', fila('r2'));
  eq('segundo INSERT remoto → 2 filas', prm().consumos.length, 2);
  // DELETE remoto por id
  Store.actions.applyRemoteConsumo('pr', { op: 'DELETE', id: 'r1' });
  eq('DELETE remoto → 1 fila', prm().consumos.length, 1);
  eq('quedó r2', prm().consumos[0].id, 'r2');
  // DELETE de un id inexistente → no-op
  Store.actions.applyRemoteConsumo('pr', { op: 'DELETE', id: 'noexiste' });
  eq('DELETE inexistente → sigue 1', prm().consumos.length, 1);
  // SNAPSHOT (reconciliación): reemplaza la lista entera con la verdad de la nube
  Store.actions.replaceConsumos('pr', [
    { id: 's1', personaId: 'pp', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null },
    { id: 's2', personaId: 'pp', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null },
    { id: 's3', personaId: 'pp', productoId: 'cz', cantidad: 1, apuntadoPor: null, createdAt: null },
  ]);
  eq('snapshot reemplaza → 3 filas (verdad de la nube)', prm().consumos.length, 3);
  eq('total recalculado desde snapshot (3×1000)', select.consumoDe(prm(), prm().asistencias[0]), 3000);
}

/* ---------- Resumen ---------- */
console.log(`\n${'='.repeat(50)}`);
console.log(`Resultado: ${pass} pasaron, ${fail} fallaron`);
if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('Todo verde ✓');
