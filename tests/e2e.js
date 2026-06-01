/* ============================================================
   E2E — Flujo MVC del tab Primadas con clics REALES (jsdom)
   Carga index.html + js/*.js en orden, simula eventos de usuario y
   re-consulta el DOM tras cada render. Verifica el flujo completo:
   evento → acción → commit → render, y los invariantes vía UI.
   Correr:  node tests/e2e.js   (lo invoca `npm test` tras run.js)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/* ---------- mini-harness ---------- */
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) { check(name, got === want, `esperado ${JSON.stringify(want)}, obtuve ${JSON.stringify(got)}`); }
function section(t) { console.log('\n' + t); }

/* ---------- montar el documento ---------- */
// Quitamos los <script src> reales: inyectamos los módulos a mano (en orden) para
// controlar la ejecución y evitar el loader de recursos / fuentes CDN.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

// Esperar a que el documento termine de cargar: así, al inyectar los módulos,
// `document.readyState === 'complete'` y el bootstrap del controlador corre
// `start()` UNA sola vez (no por un DOMContentLoaded que ya pasó).
function ready() {
  return document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(res => window.addEventListener('load', res));
}

ready().then(async () => {
  window.localStorage.clear();   // arrancar de cero (defaultState)
  // Orden real de carga (incluye el adaptador): config → util → api → store → view → controller.
  ['js/config.js', 'js/util.js', 'js/api.js', 'js/auth.js', 'js/store.js', 'js/view.js', 'js/controller.js'].forEach(rel => {
    const s = document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    document.body.appendChild(s);   // ejecuta sincrónicamente (runScripts:'dangerously')
  });
  // El bootstrap (controller start) es ASYNC: hidrata vía Api.load() (modo 'local' en jsdom, sin SDK).
  // Esperamos a que el estado quede listo antes de manejar la app con clics.
  for (let i = 0; i < 50 && !(window.Store && window.Store.select.state()); i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  runTests();
});

function runTests() {

/* ---------- helpers de interacción ---------- */
const Store = window.Store;
const st = () => Store.select.state();
const q  = sel => document.querySelector(sel);
const qa = sel => Array.from(document.querySelectorAll(sel));
function click(elOrSel) {
  const el = typeof elOrSel === 'string' ? q(elOrSel) : elOrSel;
  if (!el) throw new Error('click: no existe ' + elOrSel);
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}
function setVal(elOrSel, value) {
  const el = typeof elOrSel === 'string' ? q(elOrSel) : elOrSel;
  if (!el) throw new Error('setVal: no existe ' + elOrSel);
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
// Acordeón: las tarjetas nacen CERRADAS; rol/cover/steppers/abonos viven en el .acc-body expandido.
// abrir(pid) es idempotente: togglea solo si está cerrada (sin .acc-body para ese pid).
function abrir(pid) {
  const head = q(`.acc-head[data-pid="${pid}"]`);
  if (!head) throw new Error('abrir: no existe la cabecera de ' + pid);
  if (!head.closest('.asis').querySelector('.acc-body')) click(head);
}

/* ============================================================ */
section('Arranque (bootstrap cableó la Vista sobre el modelo v4)');
check('Store, View y Controller existen en window', !!window.Store && !!window.View && !!window.Controller);
check('Render inicial: tab Primadas con estado vacío', /No hay primada activa/.test(q('#screen').innerHTML));
eq('localStorage limpio → 0 personas', st().personas.length, 0);

/* ---------- 1. Directorio de personas (overlay del engranaje) ---------- */
section('Personas: alta desde el overlay del engranaje');
click('#gearBtn');                                   // abre la pantalla Personas
check('Pantalla Personas visible', !q('#overlay').hidden && /Nueva persona/.test(q('#overlay').innerHTML));
setVal('#np-nombre', 'Ana'); setVal('#np-estado', 'ahorrador'); click('[data-act="add-persona"]');
setVal('#np-nombre', 'Beto'); setVal('#np-estado', 'invitado'); click('[data-act="add-persona"]');
eq('2 personas en el directorio', st().personas.length, 2);
const ana  = st().personas.find(p => p.nombre === 'Ana');
const beto = st().personas.find(p => p.nombre === 'Beto');
check('Ana es ahorradora, Beto invitado', ana.estado === 'ahorrador' && beto.estado === 'invitado');
click('[data-act="close-overlay"]');
check('Overlay cerrado', q('#overlay').hidden);

/* ---------- 2. Crear primada (queda incompleta) ---------- */
section('Crear y seleccionar primada');
click('[data-act="new-primada"]');
eq('1 primada creada', st().primadas.length, 1);
const prm = () => st().primadas[0];
check('Primada activa = la nueva', st().activePrimadaId === prm().id);
check('Incompleta: sin principal en la UI', /sin principal/.test(q('#screen').innerHTML));

/* ---------- 3. Agregar asistencias desde el directorio ---------- */
section('Asistencias desde el directorio');
setVal('#as-pick', ana.id);  click('[data-act="add-asistencia"]');
setVal('#as-pick', beto.id); click('[data-act="add-asistencia"]');
eq('2 asistencias', prm().asistencias.length, 2);
check('Snapshot inmutable: Ana=ahorrador, Beto=invitado en la asistencia',
  prm().asistencias.find(a => a.personaId === ana.id).estadoEnEseMomento === 'ahorrador' &&
  prm().asistencias.find(a => a.personaId === beto.id).estadoEnEseMomento === 'invitado');

/* ---------- 4. Asignar principal (INVARIANTE #2) ---------- */
section('Asignar principal — invariante "principal siempre ahorrador"');
// Acordeón: abrir ambas tarjetas para acceder a sus controles internos (rol/cover/steppers/abonos).
abrir(ana.id);
abrir(beto.id);
setVal(`select[data-ch="rol"][data-pid="${ana.id}"]`, 'principal');
eq('Ana es el principal', prm().organizadorPrincipalId, ana.id);
check('Ya no está incompleta', !Store.select.primadaIncompleta(prm()));
check('Snapshot de la llave Bre-B del principal en pago', 'breB' in prm().pago);

// Intentar hacer principal a Beto (invitado) → debe rechazarse por invariante
setVal(`select[data-ch="rol"][data-pid="${beto.id}"]`, 'principal');
eq('Beto NO pudo ser principal (sigue Ana)', prm().organizadorPrincipalId, ana.id);
check('Render se recuperó tras el error (sigue habiendo asistencias)', qa('.asis').length === 2);

/* ---------- 5. Consumos ± (progressive disclosure) ---------- */
section('Consumos: primer ítem por el chip-picker, luego steppers ±');
abrir(beto.id);   // idempotente: asegura su tarjeta expandida
// Progressive disclosure: sin cantidad>0 NO hay stepper; el primer consumo entra por "+ Agregar" → chip.
click(`[data-act="open-pickprod"][data-pid="${beto.id}"]`);
click(`[data-act="add-item"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // 0→1 vía chip
eq('Beto lleva 1 cerveza (agregada por chip)', prm().asistencias.find(a => a.personaId === beto.id).items.cerveza, 1);
// Ya con cantidad>0 aparece el stepper: subir a 2 con +
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Beto lleva 2 cervezas', prm().asistencias.find(a => a.personaId === beto.id).items.cerveza, 2);
click(`[data-act="item-minus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Stepper baja a 1', prm().asistencias.find(a => a.personaId === beto.id).items.cerveza, 1);
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // de vuelta a 2

/* ---------- 6. Cover automático + exoneración ---------- */
section('Cover automático por tipo + exoneración manual');
const betoAsis = () => prm().asistencias.find(a => a.personaId === beto.id);
eq('Cover de Beto (invitado) = 10.000 por defecto', Store.select.coverDe(prm(), betoAsis()), 10000);
const anaAsis = () => prm().asistencias.find(a => a.personaId === ana.id);
eq('Ana (principal) sin cover', Store.select.coverDe(prm(), anaAsis()), 0);

// Ganancia ANTES de exonerar: cover 10000 + margen 2*(3500-2500)=2000 → 12000
eq('Ganancia = cover + margen (12.000)', Store.select.ganancia(prm()), 12000);
check('Reparto visible en la UI', /Ganancia de la primada/.test(q('#screen').innerHTML));

click(`[data-act="toggle-exonerado"][data-pid="${beto.id}"]`);
check('Beto exonerado', betoAsis().coverExonerado === true);
eq('Cover de Beto ahora 0', Store.select.coverDe(prm(), betoAsis()), 0);
eq('Ganancia baja al margen puro (2.000)', Store.select.ganancia(prm()), 2000);

/* ---------- 7. Resumen e informe del principal ---------- */
section('Resumen de ganancia + informe del principal');
const inf = Store.select.informePrincipal(prm());
check('Informe completo (ya hay principal)', inf.incompleta === false);
eq('Entrega al Tesorero = ganancia', inf.entregaTesorero, Store.select.ganancia(prm()));
eq('Parte igual a la única ahorradora (Ana) = ganancia', Store.select.parteIgual(prm()), 2000);
eq('Sobrante indivisible = 0', Store.select.sobranteFondo(prm()), 0);
check('Informe del principal renderizado con el nombre', /Informe del principal — Ana/.test(q('#screen').innerHTML));

/* ---------- 8. Cerrar congela consumos pero la UI sigue viva ---------- */
section('Cerrar cuenta (INVARIANTE #4) vía UI');
click(`[data-act="cerrar-primada"][data-id="${prm().id}"]`);
eq('Primada cerrada', prm().estado, 'cerrada');
const before = betoAsis().items.cerveza;
const plus = q(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
check('Steppers deshabilitados al cerrar', !!plus && plus.disabled === true);
if (plus) click(plus);   // aunque hagamos click, la acción debe ignorarlo
eq('Consumo congelado tras cerrar', betoAsis().items.cerveza, before);

/* ---------- 8b. Abonos vía UI con la cuenta CERRADA (INVARIANTE #4) ---------- */
section('Abonos: registrar/eliminar pago con la primada cerrada');
// Beto exonerado, 2 cervezas → total 7.000, saldo 7.000
eq('Saldo de Beto antes de abonar = 7.000', Store.select.saldoDe(prm(), betoAsis()), 7000);
setVal(`#abono-${beto.id}`, '3000');
click(`[data-act="abonar"][data-pid="${beto.id}"]`);
eq('Abono registrado (abonado = 3.000)', Store.select.abonadoDe(betoAsis()), 3000);
eq('Saldo de Beto baja a 4.000', Store.select.saldoDe(prm(), betoAsis()), 4000);
eq('Informe: recaudado real = 3.000', Store.select.informePrincipal(prm()).recaudadoReal, 3000);
eq('Informe: saldo pendiente = 4.000', Store.select.informePrincipal(prm()).saldoPendiente, 4000);
const abId = betoAsis().abonos[0].id;
click(`[data-act="remove-abono"][data-pid="${beto.id}"][data-abono="${abId}"]`);
eq('Abono eliminado (abonado = 0)', Store.select.abonadoDe(betoAsis()), 0);
setVal(`#abono-${beto.id}`, '3000');   // dejarlo registrado para la persistencia
click(`[data-act="abonar"][data-pid="${beto.id}"]`);

/* ---------- 8c. Directorio: cambiar estado NO reescribe snapshots (INVARIANTE #1) vía UI ---------- */
section('Directorio: cambiar estado vigente conserva la historia (INV#1)');
eq('Snapshot de Beto en la asistencia = invitado', betoAsis().estadoEnEseMomento, 'invitado');
click('#gearBtn');                                   // abre la pantalla Personas
check('Beto aparece en 1 primada (historia)', Store.select.aparicionesDe(beto.id) === 1);
click(`[data-act="set-estado-persona"][data-pid="${beto.id}"][data-estado="ahorrador"]`);
eq('Estado VIGENTE de Beto ahora = ahorrador', Store.select.persona(beto.id).estado, 'ahorrador');
eq('Snapshot histórico INTACTO (sigue invitado)', betoAsis().estadoEnEseMomento, 'invitado');
check('Reparto no cambió: Beto sigue sin contar como ahorradora (snapshot)',
  Store.select.asistenciasAhorradoras(prm()).every(a => a.personaId !== beto.id));
// Editar la llave Bre-B desde el directorio
click('[data-act="overlay-tab"][data-overlay="ajustes"]');
check('Seg-nav cambia a Ajustes (cover)', /Cover vigente/.test(q('#overlay').innerHTML));
click('[data-act="overlay-tab"][data-overlay="personas"]');
click('[data-act="close-overlay"]');
check('Pantalla cerrada', q('#overlay').hidden);

/* ---------- 9. Navegación de tabs ---------- */
section('Navegación: tabs Resumen/Fondo (Próximamente)');
click('[data-tab="fondo"]');
check('Tab Fondo muestra Próximamente', /Próximamente/.test(q('#screen').innerHTML));
click('[data-tab="primadas"]');
check('Vuelve a Primadas', /Asistencias/.test(q('#screen').innerHTML));

/* ---------- 10. Persistencia (lo escrito quedó en localStorage v4) ---------- */
section('Persistencia');
const saved = JSON.parse(window.localStorage.getItem('laPrimada'));
check('localStorage tiene schemaVersion 4', saved && saved.schemaVersion === 4);
check('Persistió la primada con sus 2 asistencias', saved.primadas[0].asistencias.length === 2);

/* ---------- 11. Historial: abrir una primada vieja muestra valores CONGELADOS ---------- */
section('Historial: abrir una primada pasada muestra sus snapshots (no recalcula con hoy)');
const viejaId = Store.select.activePrimada().id;
const coverViejo = JSON.stringify(Store.select.activePrimada().cover);   // snapshot original (15.000/10.000)
// Cambiar el cover GLOBAL en Ajustes (no debe reescribir la vieja)
click('#gearBtn');
click('[data-act="overlay-tab"][data-overlay="ajustes"]');
setVal('[data-ch="cover-ahorrador"]', '20000');
setVal('[data-ch="cover-invitado"]', '12000');
click('[data-act="close-overlay"]');
eq('Cover global cambiado a invitado 12.000', Store.select.state().settings.cover.invitado, 12000);
// Crear una primada nueva → toma el cover NUEVO
click('[data-act="new-primada"]');
const nuevaId = Store.select.activePrimada().id;
eq('La primada NUEVA toma el cover global nuevo (12.000)', Store.select.activePrimada().cover.invitado, 12000);
// La vieja aparece en el Historial; abrirla con un tap
check('La vieja aparece en el Historial', !!q(`[data-act="select-primada"][data-id="${viejaId}"]`));
check('Historial visible', /Historial/.test(q('#screen').innerHTML));
click(`[data-act="select-primada"][data-id="${viejaId}"]`);
eq('Se abrió la primada vieja', Store.select.activePrimada().id, viejaId);
eq('Su cover sigue CONGELADO (10.000, no 12.000)', Store.select.activePrimada().cover.invitado, 10000);
eq('Snapshot del cover idéntico al original', JSON.stringify(Store.select.activePrimada().cover), coverViejo);

/* ---------- Resumen ---------- */
console.log(`\n${'='.repeat(50)}`);
console.log(`E2E: ${pass} pasaron, ${fail} fallaron`);
if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('E2E verde ✓');

}   // fin runTests
